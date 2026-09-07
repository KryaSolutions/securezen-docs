# LogEM / ML Worker Classification — Bug Fix Task List

Audit scope: the real-time classification path that Wazuh logs travel through today —
`events table (Minion DB)` → `backend/app/ml_utils/ml_worker_daemon.py` (anomaly detection +
`LogEMClassifier`) → `verdicts table` → SecureZen UI/AIBenchmarks dashboard.

This document was produced by tracing the code against real production `events`/`verdicts` rows
(FortiGate webfilter blocks, Windows logon events, SSL anomaly events) pulled from the live DB.
Every item below is a **confirmed defect in the code**, not a model-quality/fine-tuning question —
each is reproducible by reading the referenced lines.

Fix these **in order**. Items 1–2 are the highest-impact, lowest-risk fixes (they explain why every
verdict currently looks like a confirmed threat). Items 3–6 fix *why* routine traffic gets escalated
to the classifier in the first place. Items 7–11 fix the classifier itself. Item 12 is a secondary
pipeline (manual "AI Specialists" analysis) with a related but separate defect.

Give each numbered section to Antigravity **one at a time**, in order — later fixes assume earlier
ones are already applied (e.g. Task 2 depends on Task 1's plumbing).

---

## Task 1 — Verdict is hardcoded to `"TP"` for every classified event

**File:** `backend/app/ml_utils/ml_worker_daemon.py`
**Function:** `_phase3_save` (~line 631–648), fed by `_phase2_infer` (~line 551–628)

**Current behavior:**
```python
def _phase3_save(minion_dsn: str, results: list):
    ...
    for r in results:
        cur.execute(
            """
            INSERT INTO verdicts
                (event_id, verdict, severity, confidence, reason, provider, llm_model, classified_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (event_id) DO NOTHING
            """,
            (r["event_id"], "TP", r["severity"], 85, r["reason"], r["provider"], r["model"]),
        )
```
The literal string `"TP"` is inserted for every single row — not derived from `r` at all. `r`
(built in `_phase2_infer`) doesn't even carry a verdict field; it only carries
`event_id, severity, reason, provider, model`.

**Why this breaks classification:** every anomaly that reaches phase 2 — regardless of what LogEM
or the external LLM actually concluded — is persisted as a **confirmed True Positive**. There is
currently no code path that can ever produce a False Positive verdict from the automatic worker.
This alone accounts for the flood of "TP" rows analysts are seeing for routine FortiGate ad/category
blocks.

**Required fix:**
1. In `_phase2_infer`, decide a real verdict alongside `severity`/`reason`. Minimum viable rule:
   if `final_severity` resolves to `"LOW"` (or `"UNKNOWN"` with no external confirmation), verdict
   should be `"FP"`; otherwise `"TP"`. Add this as an explicit field on the `results.append({...})`
   dict (e.g. `"verdict": ...`) — don't infer it later in `_phase3_save` from severity alone, since
   by then you've lost the context of *why* a severity was chosen.
2. Update `_phase3_save`'s INSERT to use `r["verdict"]` instead of the literal `"TP"`.
3. Do **not** invent a new severity/verdict taxonomy — reuse the `TP`/`FP` values already used
   elsewhere in the codebase (see `classifier_lab/src/engine.py`'s `run_pipeline`, which already
   downgrades low-confidence `TP` to `FP` — mirror that logic here rather than designing a new one).

**Verify:** After the fix, seed a handful of routine FortiGate webfilter-block events (rule_level 6,
category block, no real threat indicators) through the worker and confirm they land in `verdicts`
as `FP`, not `TP`.

---

## Task 2 — Confidence is hardcoded to `85` for every verdict

**File:** `backend/app/ml_utils/ml_worker_daemon.py`, same INSERT as Task 1 (~line 645).

**Current behavior:** the tuple passed to `cur.execute` has a literal `85` in the confidence
position — not `local_res["confidence"]` or `external_res` confidence. `LogEMClassifier.classify_alert`
already computes a (heuristic) confidence value of `0.92` / `0.70` / `0.20` in `local_res["confidence"]`
— it's computed, then discarded and replaced with `85` before the DB write.

**Why this breaks classification:** analysts see `confidence = 85` on literally every alert, so the
confidence column carries zero information — there is no way to distinguish a well-supported verdict
from a shaky one just by looking at the `verdicts` table.

**Required fix:**
1. Thread the real confidence value through `_phase2_infer`'s `results.append({...})` dict (it
   already has `local_res` and `external_res` in scope — just carry `local_res.get("confidence")`,
   or `external_res`'s confidence when `final_verdict_by == "external"`, through as a new field, e.g.
   `"confidence": ...`).
2. Convert it to whatever scale the `verdicts.confidence` column expects (it looks like an integer
   0–100 elsewhere in the codebase — see `classifier_lab/src/engine.py`'s
   `mapping = {"LOW": 30, "MEDIUM": 60, "HIGH": 90, "CRITICAL": 100}` pattern — so multiply LogEM's
   0.0–1.0 heuristic score by 100 and round, rather than inventing a new scale).
3. Update `_phase3_save` to use `r["confidence"]` instead of the literal `85`.

**Depends on:** Task 1 (same INSERT statement, same `results` dict — implement together in one pass
through `_phase2_infer`/`_phase3_save` if you prefer, but keep them as two reviewable diffs).

**Verify:** confirm confidence values in new `verdicts` rows vary (not all `85`), and correlate with
`local_confidence` values already being logged into `sz_ai_benchmarks` for the same `event_id`.

---

## Task 3 — Anomaly-detector severity feature has no MEDIUM tier and mislabels routine traffic as HIGH

**File:** `backend/app/ml_utils/ml_worker_daemon.py`
**Function:** `_phase1_poll` (~line 421–456), specifically line 444:

```python
feat_dict = {
    "severity": "LOW" if row["rule_level"] and int(row["rule_level"]) < 5 else "HIGH",
    "src_ip": row["srcip"] or "",
    "raw_log": row["full_log"] or "",
}
```

**Why this breaks classification:** any Wazuh `rule_level >= 5` is tagged `"HIGH"` in the feature
vector fed to the Isolation Forest anomaly detector — including `rule_level: 6` FortiGate webfilter
category blocks (ads, social media, streaming — routine, expected, low-value traffic; confirmed from
real production `events` rows). There's no MEDIUM tier at all. This structurally biases the anomaly
detector toward treating ordinary policy-enforcement logs as noteworthy, which is *why* they get
routed into LogEM classification in the first place.

**Required fix:** Replace the binary split with the same tiering already used correctly elsewhere in
this codebase — `classifier_lab/src/engine.py`'s `pre_classify()` maps `rule_level` into
`URGENT`/`PRIORITY`/`ELEVATED`/`ROUTINE` using sensible thresholds (`>=16`, `>=10`, `>=6`, else
routine) plus keyword/IP-based escalation. Port an equivalent (at minimum a 3-4 tier numeric mapping
matching those thresholds) into the feature vector here instead of the current `<5` binary check.
Don't just widen the two-tier map to three arbitrary buckets — reuse `pre_classify`'s actual
thresholds so the two systems agree on what counts as significant.

**Verify:** re-run the same rule_level-6 FortiGate sample from Task 1's verification and confirm its
feature severity is no longer `"HIGH"`.

---

## Task 4 — Isolation Forest anomaly detector is calibrated on synthetic random noise, not real traffic

**File:** `backend/app/ml_utils/ml_worker_daemon.py`
**Function:** `init_components` (~line 197–209):

```python
def init_components():
    global _classifier, _anomaly_detector
    if _classifier is None:
        _classifier = LogEMClassifier()
    if _anomaly_detector is None:
        from app.ml_utils.anomaly_detector import AnomalyDetector
        import random
        _anomaly_detector = AnomalyDetector(min_samples=20)
        for _ in range(25):
            _anomaly_detector.update([
                random.uniform(8, 17), random.uniform(0.8, 1.0),
                random.uniform(0, 1), 0.0, 0.0, 0.0,
            ])
```

**Why this breaks classification:** `AnomalyDetector.update()` (see `anomaly_detector.py`) triggers
its first `IsolationForest.fit()` as soon as the training buffer reaches `min_samples` (here, 20).
This loop inserts **25 synthetic random vectors** before any real event is ever scored — meaning the
detector's very first fit, which defines its baseline notion of "normal," is calibrated almost
entirely on fabricated noise (with severity/is_external/is_new_user fixed at `0.0` for every synthetic
sample) rather than your actual environment's traffic distribution. Real events only start
influencing the model after this synthetic seed already triggered the initial fit.

**Required fix:** Don't synthetically pre-seed past `min_samples`. Either:
- Remove the seeding loop entirely and let the detector warm up naturally on the first `min_samples`
  *real* events (the `score()` method already returns `{"status": "warming_up"}` gracefully while
  unfitted — that path is designed to be used), or
- If a warm-start is genuinely needed to avoid an empty-detector window at boot, seed with **real
  historical rows** pulled from the `events` table (last N processed events) via
  `build_feature_vector`, not `random.uniform(...)`.

**Verify:** after the fix, confirm `_anomaly_detector.fitted` stays `False` until real events
accumulate, and that the eventual fit reflects your environment's actual feature distribution (spot
check a few real "normal" vs "anomalous" vectors against the fitted model's `score()` output).

---

## Task 5 — Anomaly feature vector has 3 of 6 dimensions permanently dead in this pipeline

**File:** `backend/app/ml_utils/ml_worker_daemon.py`, `_phase1_poll` (same `feat_dict` as Task 3)
vs. `backend/app/ml_utils/anomaly_detector.py`, `build_feature_vector` (~line 51–82).

**Current behavior:** `build_feature_vector` expects up to 6 signals — `timestamp` (→ hour-of-day),
`completeness_score`, `template`/`raw_log` (→ keyword count), `severity`, `src_ip` (→ external flag),
`username` (→ new-user flag). `_phase1_poll`'s `feat_dict` only ever populates `severity`, `src_ip`,
`raw_log`. The other three always fall back to their defaults:
- `timestamp` missing → `hour = 0.0` for every event, always.
- `completeness_score` missing → defaults to `100` → `completeness = 1.0` for every event, always.
- `username` missing → `is_new_user` compares `None == "UNKNOWN_USER"` → always `0.0`.

**Why this breaks classification:** the Isolation Forest is only really discriminating on 3 live
signals (keyword count, the broken severity feature from Task 3, and the external-IP flag) instead
of 6. Half the feature space carries zero information, which weakens the detector's ability to tell
a genuinely unusual event from a routine one that happens to score similarly on the 3 live features.

**Required fix:** Populate `timestamp` (use the event's actual timestamp — `events` table has
`created_at`/similar; pull it in the `_phase1_poll` SELECT alongside `full_log`/`rule_level`/`srcip`)
and `username`/`dstuser` (already selected in adjacent queries elsewhere in this file — add it to the
`_phase1_poll` SELECT and pass it through). Decide deliberately whether `completeness_score` is
meaningful for Wazuh events at all; if there's no real analogue, remove that dimension from the
feature vector rather than leaving it permanently constant (a constant feature is worse than no
feature — it adds dimensionality without adding signal, which measurably hurts Isolation Forest's
scoring in low-dimensional spaces like this one).

**Verify:** log the feature vector for a sample of real events before/after the fix and confirm all
included dimensions actually vary across the sample.

---

## Task 6 — Security-keyword feature inflates "relevance" for routine deny/block logs

**File:** `backend/app/ml_utils/anomaly_detector.py`, `count_security_keywords` (~line 40–49):

```python
keywords = ["failed", "denied", "error", "invalid", "unauthorized",
            "attack", "malware", "exploit", "suspicious", "blocked",
            "drop", "reject"]
```

**Why this breaks classification:** words like `"blocked"`, `"denied"`, `"drop"`, `"reject"` appear
in *every* routine, working-as-intended FortiGate policy-enforcement log (the firewall is *supposed*
to block ad/category traffic and log it as "blocked"/"denied"). Mixing these routine-operational
words into the same keyword list as genuinely severe indicators (`"malware"`, `"exploit"`, `"attack"`)
means ordinary policy enforcement scores similarly to real attack indicators on this feature,
directly contributing to over-flagging benign FortiGate traffic as anomalous.

**Required fix:** Split this into two tiers weighted differently — e.g. routine-operational words
(`"failed"`, `"denied"`, `"blocked"`, `"drop"`, `"reject"`, `"invalid"`) contribute a small weight,
while high-severity words (`"attack"`, `"malware"`, `"exploit"`, `"unauthorized"`, `"suspicious"`)
contribute a larger weight — instead of a flat `+1` per match regardless of severity. Calibrate the
weights using a sample of known-routine vs known-suspicious real logs from your `events` table, not
arbitrary numbers.

**Verify:** confirm a routine FortiGate ad-block log now scores meaningfully lower on this feature
than a log containing an actual attack-indicator keyword.

---

## Task 7 — LogEM tokenizes with no truncation/length guard

**File:** `backend/app/ml_utils/ml_worker_daemon.py`, `LogEMClassifier.classify_alert` (~line 148):

```python
inputs = self.tokenizer(prompt, return_tensors="pt").to(self.model.device)
```

**Why this breaks classification:** real Wazuh/FortiGate log lines are frequently 500–1500+
characters (confirmed from production `full_log` samples — a single FortiGate UTM log line easily
exceeds a thousand characters). There is no `truncation=True` / `max_length=...` on this tokenizer
call. If `HassanShehata/logem`'s context window is smaller than the resulting token count (likely,
for a small local model), the model either silently processes a corrupted/truncated view of the
prompt, or errors out. This is a strong candidate explanation for the hallucinated verdicts observed
in production where the `"Log:"` section in the stored `prompt_str` is effectively empty — the actual
log content may never be reaching the model's usable context.

**Required fix:** Add explicit `truncation=True, max_length=<model's real context budget minus
room for the prompt template and generation>` to the tokenizer call. Determine the model's actual
max input length from its config (`self.tokenizer.model_max_length` after loading) rather than
guessing a number. If the raw log is longer than the budget, truncate the *log content* sensibly
(e.g. keep the first N and last M characters, similar to the existing `truncate_for_llm` helper in
`backend/app/core/triage/alert_classifier.py:28` — reuse that function or its approach rather than
writing a second truncation strategy) instead of letting the tokenizer silently cut off wherever it
lands.

**Verify:** feed the exact long FortiGate log lines from production through the fixed classifier and
confirm the model's response addresses content that's actually present in the log (no more fabricated
SMB/port-8080/"attacker" scenarios unrelated to the input).

---

## Task 8 — No guard against empty/unusably short log text before generation

**File:** `backend/app/ml_utils/ml_worker_daemon.py`, `LogEMClassifier.classify_alert` (~line 126–191).

**Why this breaks classification:** confirmed directly from production `verdicts` rows — several
entries show a prompt where the `"Log:"` section is blank, yet `"Analysis:"` still contains a fully
fabricated narrative (SMB access to `log.txt`, a nonexistent port-8080 connection, an invented
"attacker" scenario) with no relation to the actual event. The current code always calls
`self.model.generate(...)` regardless of whether `alert_text` is empty, whitespace-only, or
degenerate after Task 7's truncation. A small causal LM given an empty log body will still complete
the prompt with a plausible-sounding but entirely invented scenario.

**Required fix:** Before calling `self.model.generate(...)`, check that `alert_text.strip()` has
meaningful content (non-trivial length, not just whitespace/punctuation). If it doesn't, skip
generation and return a result with `"status": "error"`, `"severity": "UNKNOWN"`, a message noting
the log body was empty/unusable — mirroring the existing "Model not loaded" early-return shape in
the same function, so it flows into the existing fallback-to-external-LLM path in `_phase2_infer`
rather than silently producing a fabricated verdict.

**Depends on:** Task 11 (the fallback trigger condition) — make sure this new `"UNKNOWN"` status
actually reaches the external-LLM fallback once Task 11 is fixed.

**Verify:** confirm an event with an empty/near-empty `full_log` now short-circuits to `UNKNOWN` +
external fallback instead of generating fabricated content.

---

## Task 9 — Severity/MITRE extraction is naive keyword & regex matching on freeform text

**File:** `backend/app/ml_utils/ml_worker_daemon.py`, `LogEMClassifier.classify_alert` (~line 152–160):

```python
severity = "MEDIUM"
if any(kw in response.upper() for kw in ("CRITICAL", "HIGH", "ATTACK")):
    severity = "CRITICAL"
elif any(kw in response.upper() for kw in ("WARNING", "MEDIUM")):
    severity = "MEDIUM"
elif any(kw in response.upper() for kw in ("LOW", "INFO")):
    severity = "LOW"

mitre = extract_mitre_code(response)  # regex: r"T\d{4}(?:\.\d{3})?" on raw text
```

**Why this breaks classification:** this misfires whenever the model's free text mentions a severity
word in a way that doesn't match its actual meaning (e.g. "this is *not* critical" still matches
`"CRITICAL"` and gets classified `CRITICAL`; a MITRE code mentioned as an example or in passing gets
extracted as if it were the model's actual conclusion). Compare this to `processor_llm.classify_with_llm`
in `backend/app/ai_engine/processor_llm.py`, which asks Groq for a structured 4-key JSON object and
parses it directly — far more reliable by construction, and already proven in this codebase.

**Required fix:** Change the LogEM prompt to request a fixed, minimal structured format (even a
simple `SEVERITY: <value>\nMITRE: <code>` line-based format the small local model can reliably
produce, if full JSON mode isn't supported for this model) and parse *that* structure specifically,
rather than scanning the entire freeform response for keywords. Don't attempt full JSON-schema
structured output here unless you've confirmed `HassanShehata/logem` supports it reliably — start
with the smallest structured format that removes the false-positive-keyword-match problem.

**Depends on:** Task 7/8 (fix input handling first, so you're evaluating output quality against a
model that's actually seeing the real, complete log).

**Verify:** construct a handful of adversarial test prompts where a severity/MITRE keyword appears
in a negated or example context, and confirm the new parser doesn't misfire on them.

---

## Task 10 — LogEM's own confidence score is fabricated, not model-derived

**File:** `backend/app/ml_utils/ml_worker_daemon.py`, `LogEMClassifier.classify_alert` (~line 162–168):

```python
if severity != "UNKNOWN" and mitre != "Unknown":
    confidence = 0.92
elif severity != "UNKNOWN":
    confidence = 0.70
else:
    confidence = 0.20
```

**Why this breaks classification:** this is a constant lookup based purely on *whether a keyword was
found*, not any actual measure of the model's certainty (e.g. token-level probabilities/logits). Two
wildly different-quality generations that both happen to contain a severity keyword and a MITRE-shaped
string get the identical `0.92`, whether the model was actually confident or just got lucky matching
a pattern.

**Required fix:** Either (a) derive a real confidence signal from the model's generation — e.g.
average token probability / logit margin for the generated span via `output_scores=True` on
`model.generate(...)`, or (b) if that's impractical for this model, be explicit in code and in the
UI that this is a rough heuristic proxy (keep the `"confidence_method": "heuristic_v1"` label, which
already does this honestly) — but do not present it as equivalent to `external_res`'s confidence
when both flow into Task 2's fix. At minimum, this heuristic should account for *how* strong the
keyword match was (single ambiguous mention vs. clear unambiguous statement), not just presence/absence.

**Depends on:** Task 9 (once output parsing is more structured, a real confidence signal — e.g. how
cleanly the structured fields parsed — becomes available almost for free).

**Verify:** spot-check confidence values against manual analyst judgment of the same generations —
confirm the score actually correlates with generation quality, not just keyword presence.

---

## Task 11 — External-LLM fallback safety net almost never triggers

**File:** `backend/app/ml_utils/ml_worker_daemon.py`, `_phase2_infer` (~line 551–628), specifically:

```python
local_sev = local_res.get("severity", "UNKNOWN")
local_success = local_res.get("status") == "success"
is_confident = local_success and local_sev != "UNKNOWN"

...
if not is_confident:
    final_verdict_by = "external"
    ...
```

**Why this breaks classification:** because `classify_alert` (pre-Task-8-fix) never actually returns
`severity: "UNKNOWN"` unless the model failed to load entirely (it defaults to `"MEDIUM"` whenever no
keyword matches — see Task 9), `is_confident` evaluates `True` for nearly every call, including the
hallucinated ones. The fallback-to-Groq safety net — the one mechanism meant to catch bad local
classifications — essentially never fires for the exact cases (hallucinated/garbled output) it
should be catching. It only fires today via the separate sampling-based validation policy
(`evaluate_benchmarking_policy`), which explicitly does **not** override the production verdict even
when it disagrees (see the comment in `_phase2_infer`: *"the external model NEVER influences or
overrides the production verdict"*).

**Required fix:** Once Task 8 makes `classify_alert` return a genuine `UNKNOWN`/error status for
empty/degenerate input, and Task 9/10 give you a real confidence signal, tighten the `is_confident`
check to also require `local_res.get("confidence", 0) >= <threshold>` (not just
`severity != UNKNOWN`). Additionally, reconsider the "external never overrides" policy specifically
for the *fallback* path (not the sampling-validation path) — when LogEM's own status is `error`/`UNKNOWN`,
the external result should become the production verdict (it already does, per the `if
final_verdict_by == "external":` branch further down) — just make sure low-confidence-but-"success"
cases can also route here, not only hard failures.

**Depends on:** Tasks 8, 9, 10 (this task tightens the trigger condition using signals those tasks
introduce — do this last among the LogEM-internals fixes).

**Verify:** after all of Tasks 7–11, replay the previously-hallucinated production events and confirm
they now either produce a grounded local classification, or correctly fall back to the external LLM
instead of persisting a fabricated verdict.

---

## Task 12 (secondary pipeline) — Manual "AI Specialists" re-analysis strips the raw log text

**File:** `classifier_lab/src/nodes.py`, `consolidated_analysis_node` (~line 111–114):

```python
clean_events = []
for ev in raw_events:
    clean_ev = {k: v for k, v in ev.items() if k != "full_log"}
    clean_events.append(clean_ev)
```

**Why this matters:** this is the on-demand pipeline behind the "AI Specialists" manual re-analysis
feature (triggered via `POST /{alert_id}/ai-specialists/analyze` → `classifier_lab/main.py`) — a
separate pipeline from the automatic worker, but with its own related defect: it strips out
`full_log` — the actual raw log text — before sending the event to the LLM, leaving only whatever
structured metadata fields happen to exist on the alert. For log sources where the important
evidence lives in the raw text (encoded commands, exact attack strings, unusual parameters) rather
than in the structured fields SecureZen has parsed out, this pipeline is analyzing with one hand
tied behind its back.

**Required fix:** Determine why `full_log` was excluded (likely token-cost reduction, per the file's
own comment "Clean the input logs to reduce token size"). If cost is the concern, truncate
`full_log` (reuse the `truncate_for_llm` approach from
`backend/app/core/triage/alert_classifier.py:28`) rather than dropping it entirely.

**Verify:** confirm a manually-triggered "AI Specialist" re-analysis of an alert whose relevant
detail lives only in `full_log` (not in structured fields) now reflects that detail in its output.

---

## Suggested order of operations for Antigravity

1. Task 1 → Task 2 (same file, same statement — do together, review as one diff)
2. Task 3 → Task 4 → Task 5 → Task 6 (anomaly detector, all in `anomaly_detector.py` +
   `_phase1_poll`)
3. Task 7 → Task 8 → Task 9 → Task 10 → Task 11 (LogEM internals, in this dependency order)
4. Task 12 (independent secondary pipeline, can be done any time)

After all tasks land, re-open `/api/alerts/benchmark-stats` (the `AIBenchmarks.jsx` dashboard) against
**real** traffic and check `overall_agreement_pct` — that number is now finally meaningful, since the
verdict/confidence values feeding it are no longer hardcoded constants. Only if disagreement remains
high *after* this list is fully addressed is fine-tuning `HassanShehata/logem` a reasonable next
question to revisit.
