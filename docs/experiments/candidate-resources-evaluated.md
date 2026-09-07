# External Resources Evaluated (and Rejected)

A running log of external repos/papers/datasets checked as possible shortcuts for the local-model fine-tuning problem, so nobody re-evaluates the same dead end twice. "Rejected" here means "not usable as-is for this project's specific problem" — not necessarily bad work in its own context.

| Resource | What it offered | Why it didn't fit |
|---|---|---|
| [`niebikong/Sieve`](https://github.com/niebikong/Sieve) (GitHub) | A candidate fine-tuning dataset/approach for a local security-log classifier | Domain and task shape didn't match this project's real problem — evaluated for reuse in the LogEM fine-tuning effort and found unsuitable |
| ScienceDirect article (`S138912862500297X`) | Published research on log/alert classification | The approach described didn't map onto this project's unsupervised-filter + local/external-LLM-classifier pipeline closely enough to be directly actionable |
| Kaggle — `aryan208/cybersecurity-threat-detection-logs` | A labeled cybersecurity log dataset | Synthetic/unrealistic relative to real SIEM traffic — the whole reason fine-tuning is hard here is the near-total absence of *real* high-severity examples; a synthetic dataset doesn't solve that |
| [`zhadyz/AI_SOC`](https://github.com/zhadyz/AI_SOC) (GitHub) | A full open-source AI SOC platform — Wazuh ingestion, ML-based IDS, local LLM triage, RAG, observability stack | Its ML layer is **supervised** binary classification (Random Forest/XGBoost) trained on CICIDS2017 — a static dataset of 77 numeric *network flow* features (packet counts, byte rates). This project's ML filter (Isolation Forest, unsupervised) works directly on raw *log text*, not flow features — different input schema, different problem shape. Their trained models can't be reused; their training methodology doesn't transfer either, since we don't capture flow-level data. Their own README describes it as "research-quality, not production-ready" (stubbed firewall/EDR adapters, no real adversary-emulation validation). |

## Recurring pattern across all four

Every external candidate so far has failed on the same axis: **this project's real bottleneck is the near-total absence of real, high-severity, ground-truth-labeled examples** — not a lack of ML technique, code, or published research. A better dataset schema or a more sophisticated model doesn't fix a shortage of real CRITICAL/HIGH examples to learn from. See `docs/research/fine-tuning.md` for the fine-tuning attempt that ran into exactly this wall directly.

## One idea worth revisiting later (not rejected, just not urgent)

`zhadyz/AI_SOC` runs Prometheus/Grafana/Loki for observability — this project currently has no equivalent (checking `ml-worker` health means manually hitting `/api/alerts/worker/health`). Not a data/ML fit, but a legitimate operational gap worth considering independently of the fine-tuning question.
