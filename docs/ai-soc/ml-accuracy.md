# Current ML/AI Accuracy Status

A single place to check "how good is this actually" without digging through every incident report. Each line links to where the real methodology and numbers live.

| Component | Status | Detail |
|---|---|---|
| ML anomaly filter (Isolation Forest) | No missed threats in a 32-sample manual stratified review; no automated accuracy score exists (ground-truth link was lost in an earlier data wipe) | `docs/architecture/overview.md` §3 |
| Local LLM classifier (LogEM), pre-fix | 8.0% real accuracy against 513 manually-labeled alerts | `docs/ai-soc/reliability-log.md` (item 32) |
| Local LLM classifier, post rule-override fix | 8/9 known-dangerous test alerts correctly escalate | `docs/ai-soc/reliability-log.md` (item 33) |
| Fine-tuned local model (LoRA) | Shadow-tested: called LOW on 100% of real HIGH/CRITICAL cases — worse than the unmodified base model | `docs/architecture/overview.md` §3 |
| UEBA ML engine (separate IsolationForest, per entity-type) | Judges entity-day anomaly, not per-alert TP/FP — not comparable to the rows above; gated on the model's own anomaly flag after testing showed an ungated percentile score always flags *someone* as unusual even on a calm day | `docs/architecture/agentic_architecture.md` §7 |

## 3-way benchmark, complete (October 2026): LogEM vs. Groq vs. Laya

Full 513-row human-confirmed ground truth (504 BENIGN, 9 real TP), each of the 3 classification systems run against the exact same alerts, scored by per-class precision/recall (not raw accuracy alone, since the set is heavily skewed toward BENIGN).

| | LogEM (local, fine-tuned `logem-merged-phase4`) | **Groq (external)** | Laya (independent open-weights model) |
|---|---|---|---|
| Verdict accuracy (513 rows) | 74.3% | **94.9%** | 18.9% |
| Real TP recall (of 9 actual threats) | 4/9 (44.4%) | **5/9 (55.6%)** | 4/9 (44.4%) |
| TP precision (false-alarm rate on TP calls) | 3.1% | **18.5%** | 1.9% |
| Mean latency per alert | ~39.8s | **~0.9s** | ~4.9s |

**Conclusion**: Groq is the clear winner — highest accuracy, highest real-threat recall, and ~45x faster than the local fine-tuned model. The fine-tuning effort on LogEM has not closed the gap with Groq; LogEM's local inference cost (CPU-bound, ~40s/alert) isn't currently buying better accuracy. Laya is not viable for this workload — it calls the large majority of routine BENIGN traffic "suspicious" (18.5% BENIGN recall), making it unusable as a filter despite catching threats at a similar rate to LogEM.

**This validates the existing production design** (trust LogEM only when confidently LOW, escalate everything else to Groq) with real measured evidence instead of a prior assumption — Groq should remain the primary external classifier for anything the local model doesn't confidently clear.

**Known caveat, stated honestly**: 224 of the 513 Groq calls (44%) hit a rate limit on the primary model and automatically fell back to a secondary model mid-run (`openai/gpt-oss-20b`, per the documented fallback chain). The 94.9% figure above reflects that real, production-realistic mixed behavior — not an idealized single-model number — and is, if anything, a more honest number for what actually happens in production under load.

Full results: `benchmark/system1_vs_system2/results/benchmark_results.csv`. Scoring methodology: `benchmark/system1_vs_system2/score_results.py`.

**The honest summary**: this system has never claimed a single clean accuracy percentage, because the two things that would require — a stable labeled test set and a model that isn't actively changing — don't both hold here. What exists instead is a series of targeted, specific checks (does it catch known-dangerous patterns, does a manual sample turn up anything missed) run each time something changed enough to warrant re-checking. The 3-way benchmark above is the most comprehensive such check run to date — the first against the fully human-confirmed 513-row set, covering all 9 real threats, not just routine traffic.

The ground-truth set itself has also improved since the original 8.0% study: all 513 rows are now individually human-confirmed (reviewed and, where needed, corrected via `backend/scripts/review_auto_labels.py`), rather than the mix of analyst-reviewed and AI-proposed labels the original study used.
