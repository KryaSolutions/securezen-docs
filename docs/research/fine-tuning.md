# LogEM Fine-Tuning — Gameplan

## Why this exists

Ground-truth testing (see `../ai-soc/reliability-log.md`, Part 7) found the local
LogEM classifier's real accuracy against 513 manually-labeled alerts was 8.0% before a prompt fix,
and that the prompt fix alone can overcorrect into under-alerting on genuine threats (caught via a
targeted known-threats regression test, fixed with two rule-based overrides — signature match and
repeat-login correlation). Those overrides close the two specific gaps found so far, but the
underlying question remains: is the local model's *reasoning* on ambiguous cases good enough, or
does it need fine-tuning on real data from this environment?

**Decision so far:** rules first (cheap, deterministic, already shipped), fine-tuning only if rules
+ prompting aren't enough once measured properly. This document is the plan for making that
measurement and, if warranted, doing the fine-tune.

## Blockers and how each is being addressed

| # | Blocker | Approach |
|---|---|---|
| 1 | Dataset size (513, need thousands) | Mine the existing 328k+ raw events already in the pipeline via Wazuh rule-based classification as bulk volume; keep growing the manually-labeled set in parallel |
| 2 | Class imbalance (474 LOW / 39 Critical+High) | Manual + assisted labeling focused on filling out Critical/High; this org's perimeter blocks most attacks before they're visible internally, so real Critical/High volume will stay naturally low — augmentation (injected test attacks, real perimeter-attack examples already found) is required, not optional |
| 3 | No GPU (confirmed no CUDA, ~25-30s/call on CPU) | Unsloth (https://unsloth.ai) for LoRA/QLoRA fine-tuning — confirmed LogEM is a Qwen3-architecture model (~1B-class, 28 layers), which Unsloth explicitly supports and is cheap to fine-tune even on modest rented GPU hours |
| 4 | Model capability ceiling | Bake-off: fine-tune a small LoRA adapter on 2-3 candidate base models on the same data before committing to one |
| 5 | No held-out test set | Split labeled data into train/validation/test before any fine-tuning work starts |
| 6 | Deployment/rollback safety | Shadow-deploy any new model version alongside production before cutover; keep rule-based overrides permanently, regardless of model version |
| 7 | Labeling is a human-time bottleneck | Active learning — escalate only ambiguous cases to a human; auto-label clearly-routine patterns (already doing this via `auto_label_routine.py`/`auto_label_reviewed.py`) |
| 8 | Concept drift | Treat relabeling/retraining as a recurring cadence (e.g. quarterly), not a one-time project |
| 9 | No fine-tuning pipeline/tooling yet | Small proof-of-concept LoRA run on the current 513 rows first, to validate the tooling before scaling up data collection |
| 10 | Unclear ROI/cost bound | Set a target accuracy threshold on the held-out test set before investing further compute/time |

## Phases

**Phase 0 — Tooling proof-of-concept — 🔶 in progress, blocked on GPU access**
Set up Unsloth + LoRA fine-tuning script for the Qwen3/LogEM architecture. Run a tiny proof pass on
the current 513 labeled rows (`sz_ground_truth_labels`) — not to get a good model, just to prove the
pipeline (data format → train → eval) works end to end.

Status:
- ✅ Confirmed no CUDA GPU is available anywhere in this environment (checked both the `ml-worker`
  container and the host directly) — Unsloth requires CUDA, so training/eval cannot run here.
- ✅ `backend/scripts/export_finetune_dataset.py` — exports `sz_ground_truth_labels` into
  `backend/data/finetune/{train,val,test}.jsonl` (instruction/input/output format matching the
  production `SEVERITY: <value>` contract). Already run: 357/77/79 train/val/test split.
  Severity distribution is extremely skewed (352/2/3 LOW/HIGH/MEDIUM in train) — expected per
  blocker #2, not a bug in the split; Phase 1/2 must fix this before a real run.
- ✅ `backend/scripts/finetune_logem_unsloth.py` — LoRA fine-tuning script (Unsloth `FastLanguageModel`,
  4-bit load, r=16 LoRA), ready to run on any CUDA-capable machine.
- ✅ `backend/scripts/eval_finetuned_logem.py` — loads a trained adapter, evaluates against
  `test.jsonl`, prints accuracy + confusion matrix.
- ✅ **Done.** Ran on a free Colab T4 (via `colab-mcp`-assisted manual run). Training converged
  cleanly (eval_loss 1.119 → 0.703 → 0.624 across 3 epochs, no errors). Eval against the 79-example
  held-out test set: 77/79 (97.5%) - but this number is misleading, not a real accuracy result: the
  test set is 77 LOW / 1 HIGH / 1 MEDIUM, so it's almost entirely "got the easy majority class
  right." The 1 HIGH was caught correctly; the 1 MEDIUM was missed (called LOW) - same
  default-to-benign pattern seen throughout this project, but n=1, not statistically meaningful.
  **Conclusion: the pipeline mechanics work end-to-end. This run says nothing reliable yet about
  whether fine-tuning actually improves real threat detection** - that requires Phase 1/2's larger,
  better-balanced dataset before it can be measured honestly.

**Phase 1 — Bulk dataset build — ✅ extraction done, human-verification pass still pending**
Extract thousands of Wazuh rule-classified alerts (`rule_level` as a bootstrap/prior label, not
verified truth) into training format. Continue the human-labeling loop for a sample, especially
anything Critical/High-tier, since those are the riskiest to get wrong in training data.

Status:
- ✅ `backend/scripts/export_bulk_finetune_dataset.py` — extracts events using the SAME rule_level
  thresholds already used in production (`ml_worker_daemon.py`'s `_phase1_poll`: `>=16` CRITICAL,
  `>=10` HIGH, `>=6` MEDIUM, else LOW), tagged `source="bootstrap_rule_level"` so it stays
  distinguishable from the 513 human-verified examples. Already run:
  `backend/data/finetune/bulk_bootstrap.jsonl` — **6,011 examples** (11 HIGH, 3,000 MEDIUM, 3,000 LOW).
- 🔴 **Hard finding, not a bug:** across the FULL ~495,000-event corpus, only **11 events are
  rule_level HIGH+ and ZERO are CRITICAL**. Wazuh's own native rule engine almost never assigns
  high severity in this environment either — confirming this org's perimeter blocks most real
  attacks before they generate a high-severity Wazuh alert. Bulk extraction fixes MEDIUM/LOW volume
  (great for teaching the model what "normal" actually looks like); it does **not** fix Critical/High
  scarcity at any scale. Phase 2 (synthetic attack injection) is not optional — it's the only source
  of real Critical/High training signal available.
- ⏳ Pending: human-verification spot-check of a sample of the 6,011 bootstrap-labeled rows (per
  blocker #7's active-learning approach — prioritize checking ones the current model is least
  confident about, rather than checking all 6,011).
- ✅ **Human-verified** — the analyst manually reviewed all 6,011 bootstrap-labeled rows.

**Phase 2 — Rare-class augmentation — ✅ done**
Inject known-attack test traffic (atomic-red-team style) and fold in real perimeter-attack examples
already found (e.g. the Bladabindi backdoor case) to grow genuine Critical/High representation beyond
what occurs organically in an environment where most attacks are blocked before reaching internal
visibility.

**Scope note:** this generates realistic synthetic *log text* for training, offline. It does not
fire live attack traffic against real infrastructure — that would be a red-team engagement requiring
separate explicit authorization, out of scope here.

**Coverage check, corrected mid-phase:** the first version of this generator leaned almost entirely
on Fortigate/generic-Wazuh formats. Checked directly against real production data before finalizing:
confirmed Office 365 (18,820 real events, ALL log source subtypes) and native Windows Security Event
Log alerts (e.g. "Domain Admins Group Changed") have **100% empty raw log content at the source** -
every single one, not a sampling gap. This is an ingestion-connector gap, not something synthetic
training data can fix - no amount of fine-tuning teaches a model to distinguish attacks from content
that doesn't exist. Flagged as a separate follow-up (see `docs/ai-soc/reliability-log.md`), out of this plan's scope.
Linux/sudo, Windows registry FIM, and rootcheck events DO carry real content (confirmed), so the
templates below were rewritten to use those exact real formats instead of inventing generic ones.

Status:
- ✅ Real perimeter-attack examples already folded in — the 9 known-real-threat rows (4 Bladabindi
  backdoor blocks, 5 VPN brute-force attempts) were already part of Phase 0's 513-row export (they
  ARE the 4 HIGH / 5 MEDIUM in that split) — no extra work needed here, already covered.
- ✅ `backend/scripts/generate_synthetic_attack_dataset.py` — 9 parameterized log templates spanning
  multiple MITRE ATT&CK tactics: Fortigate IPS backdoor signature match, Fortigate successful VPN
  brute-force, Fortigate C2 beaconing, Fortigate data exfiltration, Fortigate/WAF SQL injection,
  malicious sudo commands (SSH key backdoor, sudoers tampering, curl|bash payload) in the real sudo
  log format, malicious registry Run-key persistence in the real FIM format, a suspicious hidden NTFS
  ADS in the real rootcheck format, plus a routine-LOW benign-sudo template so the model isn't shown
  attacks exclusively. Randomized per-generation (IPs, usernames, timestamps, session IDs) to avoid
  degenerate repeated-identical training rows. Tagged `source="synthetic_attack_template"` — LLM-
  authored realistic examples grounded in real confirmed log formats, not verified real incidents;
  worth a human spot-check before fully trusting them equivalent to real ground truth.
- ✅ Generated `backend/data/finetune/synthetic_attacks.jsonl` — **200 examples: 80 CRITICAL, 100
  HIGH, 20 LOW.** This is the first real CRITICAL-severity training signal available anywhere in
  this project — recall Phase 1 confirmed 0 real CRITICAL examples exist in ~495k real events.
- 🔴 **Follow-up finding (out of this plan's scope):** Office 365 and native Windows Security Event
  Log ingestion carries zero raw log content at the source — needs the ingestion connector fixed to
  capture real audit payload fields before any classifier can meaningfully detect attacks in that
  log source category.

**Phase 3 — Log pattern discovery, coverage-gap fill, train/val/test split + baseline**
Split the expanded, balanced dataset properly. Evaluate the *current* production pipeline (prompt fix
+ rule overrides, no fine-tuning) against the held-out test set — this number is the bar any
fine-tuned model has to clear.

**Log pattern discovery (done before the split, per explicit request):** queried the full real
`events` corpus directly rather than relying on samples. Findings:
- **275 distinct log pattern types** (`rule_description` values) across ~500,000 real events.
- The 513 human-verified examples only covered **35 of those 275** — **240 pattern types had zero
  representation** anywhere in training data (though collectively only ~1.3% of event volume — mostly
  rare/long-tail types: CIS benchmark compliance checks, VirusTotal clean-scan results, DNS resolution
  timeouts, application-crash events like ".NET Runtime fatal execution engine error").
- ✅ `backend/scripts/export_pattern_coverage_dataset.py` — pulls one real example of every missing
  pattern (rule_level-based bootstrap severity, same mapping as Phase 1), tagged
  `source="pattern_coverage"`. Generated `backend/data/finetune/pattern_coverage.jsonl` — **240
  examples: 226 LOW, 11 MEDIUM, 3 HIGH.** All 275 real pattern types now have at least one training
  example.

**Combined training pool going into the split:**
| Source | Count | Tag |
|---|---|---|
| Human-verified (Phase 0) | 513 | `human_verified` |
| Bootstrap rule_level, human-spot-checked (Phase 1) | 6,011 | `bootstrap_rule_level` |
| Synthetic attack templates (Phase 2) | 200 | `synthetic_attack_template` |
| Pattern-coverage fill (Phase 3) | 240 | `pattern_coverage` |
| **Total** | **6,964** | |

**Split (stratified by severity, shuffled within each severity group so no single source clusters
into one split — an earlier version of this bug put all of `pattern_coverage` into test with zero in
train, defeating the point of pattern coverage; fixed before finalizing):**
| Split | Total | LOW | MEDIUM | HIGH | CRITICAL |
|---|---|---|---|---|---|
| train | 4,874 | 2,625 | 2,111 | 82 | 56 |
| val | 1,043 | 562 | 452 | 17 | 12 |
| test | 1,047 | 563 | 453 | 19 | 12 |

✅ `backend/scripts/build_phase3_split.py` — produced `backend/data/finetune/phase3/{train,val,test}.jsonl`.
Every severity tier and every one of the 4 sources now has real representation in all 3 splits — a
large improvement over Phase 0's split (test had just 1 HIGH, 1 MEDIUM, 0 CRITICAL).

- ✅ **Baseline measured — Phase 3 complete.** Ran `backend/scripts/eval_production_baseline.py`
  (exact production prompt from `classify_alert()`, few-shot examples, `max_new_tokens=180`,
  batched on a Colab T4) against the full 1,047-row test set.

  **PRODUCTION BASELINE: 189/1047 (18.1%) — this is the number Phase 4's fine-tuned model has to beat.**

  | True severity | Correct | Total | Accuracy |
  |---|---|---|---|
  | LOW | 176 | 563 | 31.3% |
  | MEDIUM | 11 | 453 | 2.4% |
  | HIGH | 0 | 19 | 0.0% |
  | CRITICAL | 2 | 12 | 16.7% |

  **Bigger finding than the accuracy number itself: 660/1047 (63.0%) of all answers came back
  `UNKNOWN`** — the model never produced a parseable `SEVERITY:` line at all, for nearly two-thirds
  of everything, even with the real production prompt and 180 generation tokens. This is a format-
  reliability problem, not just an accuracy problem — and it's a strong point *in favor* of
  fine-tuning: Phase 0's tiny proof-of-concept fine-tune (357 examples) already produced a correctly
  formatted answer 100% of the time with zero `UNKNOWN`s, suggesting this isn't a capability ceiling,
  just an absence of training on the expected output format.

**Phase 4 — Fine-tune via Unsloth**
LoRA fine-tune LogEM (and 1-2 alternative candidate models, per blocker #4) on rented GPU hours.
Compare each against the Phase 3 baseline on the same held-out test set.

**Phase 5 — Shadow deploy, gated cutover**
Run the winning fine-tuned model alongside production without affecting real verdicts. Re-run the
known-threats regression check (see `verify_rule_overrides.py`). Only cut over if it clears both the
Phase 3 baseline and the known-threats suite.

**Phase 6 — Recurring maintenance loop**
Quarterly (or otherwise defined) relabel + retrain cadence for drift. Rule-based overrides stay
permanent regardless of which model version is running underneath them.

## Related docs

- `../ai-soc/reliability-log.md` — Part 7 covers the ground-truth measurement and the
  over-alerting/under-alerting fixes that motivated this plan
- `../ai-soc/ai-classification-bug-fixes.md` — prior 12-task bug-fix pass on the local LogEM
  classifier's plumbing (hardcoded values, missing truncation, naive parsing, anomaly-detector
  calibration) — already applied; this plan picks up from there
- `../ai-soc/ground-truth-feedback-loop.md` — an alternative, complementary approach: an in-workflow
  analyst confirm/correct button feeding a continuous accuracy signal, instead of (or alongside) the
  batch-sampling approach `sz_ground_truth_labels` currently uses
- `backend/scripts/` — `sample_ground_truth.py`, `label_ground_truth.py`, `ground_truth_accuracy.py`,
  `reclassify_ground_truth*.py`, `verify_rule_overrides.py` — the tooling this plan builds on
