# Current ML/AI Accuracy Status

A single place to check "how good is this actually" without digging through every incident report. Each line links to where the real methodology and numbers live.

| Component | Status | Detail |
|---|---|---|
| ML anomaly filter (Isolation Forest) | No missed threats in a 32-sample manual stratified review; no automated accuracy score exists (ground-truth link was lost in an earlier data wipe) | `docs/research/ml-filter-design.md` |
| Local LLM classifier (LogEM), pre-fix | 8.0% real accuracy against 513 manually-labeled alerts | `docs/ai-soc/reliability-log.md` (item 32) |
| Local LLM classifier, post rule-override fix | 8/9 known-dangerous test alerts correctly escalate | `docs/ai-soc/reliability-log.md` (item 33) |
| Fine-tuned local model (LoRA) | Shadow-tested: called LOW on 100% of real HIGH/CRITICAL cases — worse than the unmodified base model | `docs/research/fine-tuning.md` |
| External LLM fallback (Groq) | No dedicated accuracy study yet — currently trusted as the fallback of record when the local model isn't confidently LOW | — |

**The honest summary**: this system has never claimed a single clean accuracy percentage, because the two things that would require — a stable labeled test set and a model that isn't actively changing — don't both hold here. What exists instead is a series of targeted, specific checks (does it catch known-dangerous patterns, does a manual sample turn up anything missed) run each time something changed enough to warrant re-checking. Treat any single accuracy number quoted about this system as scoped to whichever specific check produced it, not as a general claim.
