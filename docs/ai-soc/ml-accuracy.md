# Current ML/AI Accuracy Status

A single place to check "how good is this actually" without digging through every incident report. Each line links to where the real methodology and numbers live.

| Component | Status | Detail |
|---|---|---|
| ML anomaly filter (Isolation Forest) | No missed threats in a 32-sample manual stratified review; no automated accuracy score exists (ground-truth link was lost in an earlier data wipe) | `docs/architecture/overview.md` §3 |
| Local LLM classifier (LogEM), pre-fix | 8.0% real accuracy against 513 manually-labeled alerts | `docs/ai-soc/reliability-log.md` (item 32) |
| Local LLM classifier, post rule-override fix | 8/9 known-dangerous test alerts correctly escalate | `docs/ai-soc/reliability-log.md` (item 33) |
| Fine-tuned local model (LoRA) | Shadow-tested: called LOW on 100% of real HIGH/CRITICAL cases — worse than the unmodified base model | `docs/architecture/overview.md` §3 |
| External LLM fallback (Groq) | No dedicated accuracy study yet — currently trusted as the fallback of record when the local model isn't confidently LOW | — |
| UEBA ML engine (separate IsolationForest, per entity-type) | Judges entity-day anomaly, not per-alert TP/FP — not comparable to the rows above; gated on the model's own anomaly flag after testing showed an ungated percentile score always flags *someone* as unusual even on a calm day | `docs/architecture/agentic_architecture.md` §7 |
| 3-way benchmark: LogEM (fine-tuned, `logem-merged-phase4`) vs. Groq vs. Laya | **In progress** — all 513 rows now 100% human-confirmed ground truth (up from the original 8.0% study's mostly-AI-labeled set); running the real fine-tuned checkpoint (not the earlier base-model run, which understated it) through all 3 systems, scored by per-class precision/recall/F1 since the set is heavily skewed (504 BENIGN vs. 9 TP of 513) | this page, once complete |

**The honest summary**: this system has never claimed a single clean accuracy percentage, because the two things that would require — a stable labeled test set and a model that isn't actively changing — don't both hold here. What exists instead is a series of targeted, specific checks (does it catch known-dangerous patterns, does a manual sample turn up anything missed) run each time something changed enough to warrant re-checking. Treat any single accuracy number quoted about this system as scoped to whichever specific check produced it, not as a general claim.

The ground-truth set itself has also improved since the original 8.0% study: all 513 rows are now individually human-confirmed (reviewed and, where needed, corrected via `backend/scripts/review_auto_labels.py`), rather than the mix of analyst-reviewed and AI-proposed labels the original study used. The ongoing 3-way benchmark above is the first accuracy check run against this fully human-confirmed set.
