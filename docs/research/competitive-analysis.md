# Competitive Analysis

How SecureZen's approach compares to the closest external reference found so far, [`zhadyz/AI_SOC`](https://github.com/zhadyz/AI_SOC) (evaluated in full: `docs/experiments/candidate-resources-evaluated.md`). This page is the feature-by-feature comparison; that one is the rejection log.

| Dimension | SecureZen | `AI_SOC` |
|---|---|---|
| ML approach | Unsupervised (Isolation Forest), online, no fixed dataset | Supervised (Random Forest/XGBoost) trained on CICIDS2017, a static academic flow-features dataset |
| ML input | Raw log text/fields | 77 numeric network-flow features (packet counts, byte rates) |
| Ground truth | None available (real attacks too rare); validated manually | Claims 99.28% accuracy — on training data, against a labeled academic dataset, not real production traffic |
| Local LLM | Trust-tiered (only confidently-LOW calls trusted) | Ollama-backed, structured JSON triage |
| Forensics | CrewAI agent pipeline, on-demand | RAG over MITRE/CVE/runbooks via ChromaDB |
| Database | PostgreSQL | PostgreSQL |
| Observability | Manual health-endpoint checks only | Prometheus/Grafana/Loki |
| Deployment maturity | Real client traffic, actively validated on a dedicated test server | Self-described "research-quality... not production deployment without additional hardening" |

**Where SecureZen is ahead**: real production traffic validation, a working trust-tiered LLM policy backed by measured failure rates, an honest (not fabricated) accuracy story.

**Where `AI_SOC` is ahead**: observability tooling (Prometheus/Grafana/Loki), and a broader out-of-the-box service catalog (correlation engine, response orchestrator with EDR/firewall/identity adapters) — though several of those adapters are explicitly stubbed in their own README, not fully production-ready either.

**Takeaway**: the two projects solve genuinely different-shaped problems (labeled network-flow classification vs. unsupervised log-text anomaly detection on real, ground-truth-scarce traffic) — this isn't a head-to-head where one is simply better, but the observability gap is a real, actionable takeaway regardless of the ML approach difference.
