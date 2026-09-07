# ML Performance — Consolidated Numbers

Every real, measured number that exists about this system's ML/AI performance, in one place. Cross-links to where each was actually established — this page doesn't re-derive anything, it indexes.

| Number | Meaning | Source |
|---|---|---|
| 8.0% | Local LogEM classifier's real accuracy against 513 manually-labeled alerts, before the prompt fix | `docs/ai-soc/reliability-log.md` #32 |
| 8/9 | Known-dangerous test alerts correctly escalated after the rule-override fix | `docs/ai-soc/reliability-log.md` #33 |
| 0 missed threats | Result of a 32-sample manual stratified review of the ML anomaly filter's keep/drop decisions | `docs/research/ml-filter-design.md` |
| 100% | Rate at which the LoRA-fine-tuned local model called real HIGH/CRITICAL cases LOW (shadow test) | `docs/research/fine-tuning.md` |
| 93.5% vs 80.7% | ML filter drop rate on MEDIUM-tier vs LOW-tier Wazuh-labeled events | `docs/experiments/baseline-models.md` |
| ~44% | Local model's rate of failing to produce a parseable answer at all, on non-LOW calls | `docs/research/ml-filter-design.md` |

No other numbers should be treated as real until they're added here with a source.
