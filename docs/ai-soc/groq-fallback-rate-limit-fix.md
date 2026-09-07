# Groq Fallback: Dead Models + Silent Fake-Success Degradation

## How this was found

Discovered live, from real backend terminal output, while testing the ground-truth feedback loop:
`llama-3.2-11b-vision-preview` and `llama-3.2-3b-preview` returned `400 model_decommissioned`, while
`llama-3.1-8b-instant` and `llama-3.3-70b-versatile` returned `429 rate_limit_exceeded` (the 70b model's
**daily** token quota was at 99%+ used). All four failed, and the system silently returned a hardcoded
canned narrative — the exact text: *"ZEN local fallback analysis: A syslog threat event has been
recorded. Due to temporary AI service rate limits, a full dynamic playbook was generated using the local
rules signature database..."* — presented as if it were a real analysis.

**Why this matters beyond the raw-logs UI:** this is shared infrastructure. `call_groq_with_fallback`
(`backend/app/utils/helpers.py:329`) is called from **seven** places:
`ml_worker_daemon.py`, `alert_routes.py`, `intelligence_routes.py`, `email_routes.py`,
`dashboard_routes.py`, `copilot_service.py`. The one that matters most for classification correctness is
`ml_worker_daemon.py`'s `classify_with_external_llm` — the same external-LLM safety net that Tasks 8–11 of
`AI_CLASSIFICATION_BUG_FIXES.md` made LogEM depend on when its own confidence is low. If Groq is
rate-limited exactly when that fallback fires, LogEM's safety net silently returns this fake canned text
as a `"status": "success"` result — indistinguishable from a real verdict.

**One thing already in place, don't rebuild it:** `call_groq_with_fallback` already returns a
distinguishable second value when it falls back —
`return static_fallback, "static-fallback"` (line 393) — versus a real model name like
`"llama-3.1-8b-instant"` on success. The signal already exists. The bug is that **callers don't check it.**

---

## Task 1 — Remove the two permanently-decommissioned models from the fallback list

**File:** `backend/app/utils/helpers.py`, `GROQ_MODELS` list (~line 344-349):
```python
GROQ_MODELS = [
    "llama-3.1-8b-instant",
    "llama-3.3-70b-versatile", 
    "llama-3.2-11b-vision-preview",   # confirmed dead: 400 model_decommissioned
    "llama-3.2-3b-preview",           # confirmed dead: 400 model_decommissioned
]
```

**Why:** these two will *never* succeed — they're permanently retired by Groq, not rate-limited. Keeping
them in the list means every failure path burns time on two guaranteed-dead requests before reaching the
static fallback, and reduces the effective retry chain from 4 models to 2.

**Required fix:** Before hardcoding replacements, check Groq's **current** live model catalog — the error
message itself links to `https://console.groq.com/docs/deprecations`; also check
`https://console.groq.com/docs/models` for what's currently supported. Don't guess model names from
memory (Groq's catalog changes frequently) — verify against the live docs at implementation time. Keep
`llama-3.1-8b-instant` and `llama-3.3-70b-versatile` (confirmed working, just rate-limited, not dead), and
replace the two dead entries with currently-supported models of a similar size class (a small/fast model
and a distinct model family, so a single provider-wide outage doesn't take out both — check what's
available; don't pick two variants of the same model).

**Verify:** trigger a request that would use this fallback chain and confirm no `model_decommissioned`
errors appear in the logs, only real rate-limit or success responses.

---

## Task 2 — Make `classify_with_external_llm` treat `"static-fallback"` as non-success

**File:** `backend/app/ml_utils/ml_worker_daemon.py`, `classify_with_external_llm` (~line 465-490):
```python
def classify_with_external_llm(alert_text: str) -> dict:
    ...
    try:
        content, used_model = call_groq_with_fallback(prompt, max_tokens=150)
        severity = "MEDIUM"
        if any(kw in content.upper() for kw in ("CRITICAL", "HIGH", "ATTACK")):
            severity = "CRITICAL"
        ...
        return {
            "status": "success",
            "severity": severity,
            "raw_output": content,
            "latency_ms": ...,
            "model": used_model
        }
```

**Why this is dangerous:** `status` is unconditionally `"success"` regardless of whether `used_model` is a
real Groq model or the literal sentinel `"static-fallback"`. Trace what happens downstream in
`_phase2_infer` (`ml_worker_daemon.py`): when this is the fallback path (LogEM was unconfident), the code
does `if external_res and external_res.get("status") == "success": final_severity = external_res.get(...)`
— meaning a fake canned response becomes the **production verdict**, persisted via Task 1/2 of the earlier
bug-fix pass with whatever severity happens to fall out of keyword-matching the canned text (none of the
severity keywords appear in it, so it always resolves to the `"MEDIUM"` default) — and it'll pass the
`is_confident`/fallback checks from Task 11 as a legitimate success.

**Required fix:**
1. Check `used_model == "static-fallback"` immediately after calling `call_groq_with_fallback`.
2. If true, return `"status": "error"` (not `"success"`) with `"severity": "UNKNOWN"` and a message noting
   the external provider was unavailable — mirroring the shape of the existing "Model not loaded"/empty-log
   early-returns already in this file (Task 8's pattern) so it flows correctly through `_phase2_infer`'s
   existing `is_confident`/fallback-reason logic rather than needing new branching there.
3. Do **not** treat this as a reason to fall back to LogEM's own (already-rejected) low-confidence result
   as the final verdict — when both the local model was unconfident *and* the external fallback degraded,
   the honest outcome is `UNKNOWN`, not silently picking whichever one is less obviously wrong. Check how
   `_phase2_infer` currently handles `external_res.get("status") != "success"` (it already has an
   `else: final_severity = "MEDIUM"` branch for "LogEM and Fallback both failed" — decide if that's still
   the right behavior now that this failure mode is properly detected, or if `UNKNOWN` is more honest here
   too).

**Verify:** with Groq still rate-limited (or simulate it by temporarily using an invalid API key), confirm
an event that triggers the external fallback now gets logged with an honest error/UNKNOWN status instead of
a fake `"success"` verdict built from canned text.

---

## Task 3 (optional, broader scope — do only if you want full coverage)

The same `"static-fallback"` blind spot exists in the other 5 callers of `call_groq_with_fallback`
(`alert_routes.py` — including the `CCRawLogs.jsx` "Event Analysis Using ZEN AI" panel you saw this bug in
— plus `intelligence_routes.py`, `email_routes.py`, `dashboard_routes.py`, `copilot_service.py`). None of
these feed into `verdicts`/ground-truth accuracy the way LogEM's path does, so they're lower priority than
Tasks 1-2, but they do mislead analysts/users with the same fake "AI analyzed this" narrative when Groq is
degraded. If you want to fix these too: each caller should check the returned model string for
`"static-fallback"` and surface something honest in the UI (e.g. "AI analysis temporarily unavailable —
rate limited" instead of presenting the canned text as a real narrative) rather than displaying it
verbatim as if it were a genuine response.

---

## Suggested order

Task 1 first (universal, benefits all 7 callers immediately, zero risk). Then Task 2 (the one that
actually matters for classification correctness — do this even if you skip Task 3). Task 3 only if you
want the raw-logs panel and other UI surfaces to stop showing fake analyses too.
