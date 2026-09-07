# API — ML Inference

> Same caveat as `alert-triage.md`: this isn't a separate ML-inference microservice with its own HTTP API. The actual ML inference happens inside `ml_worker_daemon.py`, a background daemon process with no direct HTTP surface of its own — these are the API endpoints that expose *visibility into* that process.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/alerts/worker/health` | is `ml-worker` alive and actively processing right now — the single most useful endpoint for "is inference working" |
| GET | `/api/alerts/ai-verdicts` | classification results produced by the pipeline |
| GET | `/api/alerts/benchmark-stats` | classifier benchmark numbers |
| GET | `/api/alerts/accuracy-stats` | accuracy tracking, where available |
| GET | `/api/pg-verdicts` | direct read of the raw `verdicts` table (feature-flagged) |
| GET | `/api/dashboard-ai-insights` | AI-derived dashboard summaries |
| GET | `/api/ai/budget-status` | LLM cost/budget tracker status — see `docs/research/cost-architecture.md` |

To actually trigger or inspect inference itself, the real "API" is the daemon's own loop, not a request/response call — see `docs/architecture/overview.md` §2 for the poll → filter → classify → save phases, and `docs/research/ml-filter-design.md` for how it decides.
