# Components

Split out from `docs/architecture/overview.md` §6 for a closer look at each piece.

## Backend (`backend/app/`)

| Component | Location | Role |
|---|---|---|
| Live classification daemon | `ml_utils/ml_worker_daemon.py` | the 4-phase pipeline (poll → filter → classify → save), own container |
| ML anomaly filter | `ml_utils/anomaly_detector.py` | Isolation Forest wrapper |
| Cost/budget tracker | `ml_utils/ai_cost_tracker.py` | hard LLM spend ceiling, independent of `classifier_lab`'s own cost controls |
| Alert routers | `routers/alerts/{core,detail_ai,raw_events,verdicts}.py` | alert lifecycle, raw pipeline visibility, verdicts |
| Intelligence routers | `routers/intelligence/*.py` | MITRE, threat actors, hunting |
| Agent fleet | `agents/` | `runner.py` (`AgentRunner` base class) + 15 agents + 6 A2A endpoints — see `docs/architecture/agentic_architecture.md` |
| Forensic investigation (legacy entry point) | `investigation/` | `crew.py` — now a thin backward-compat wrapper delegating to `agents/*`; `auto_trigger.py` |
| Blast Radius | `routers/blast_radius_routes.py` | case/entity graph aggregation — `docs/architecture/blast-radius.md` |
| Email Security | `routers/email_routes.py`, `services/{graph_mail_client,email_mailbox_sync,qr_scanner,click_protection}.py` | phishing ensemble, live mailbox scanning, QR/time-of-click — `docs/architecture/email-security.md` |
| Forensic Analysis / AI Analysis dashboards | `routers/forensics_routes.py`, `services/{opensearch_sync,osd_dashboard_builder}.py` | embedded OpenSearch Dashboards — `docs/architecture/forensic-analysis.md` |
| Resource Governance | `services/governance_service.py`, `routers/governance_routes.py` | unified usage/capacity/health view across the agent fleet and AI spend |
| Pluggable LLM providers | `services/llm_provider.py`, `routers/llm_provider_routes.py` | any OpenAI-compatible provider, not just Groq |
| Auth | `utils/auth.py` | JWT issuance/verification, role checks |
| DB session | `database/session.py` | async PostgreSQL via SQLAlchemy + asyncpg — the only DB access path |
| Batch/legacy classification | `core/sensors/orchestrator.py`, `core/triage/rule_engine.py` | an older, separate batch-classification path — don't confuse with `ml_worker_daemon.py` |

## Frontend (`frontend/src/`)

Feature-folder organized under `features/`: `alerts/`, `intelligence/`, `reports/`, `copilot/`, `system/`, `email/`, `administration/`, `dashboard/`, `common/`, `agents/` (Agent Activity, Approval Queue, Detection Rules), `blastradius/` (case explorer), `forensics/` (embedded OSD views), `integrations/` (LLM provider + threat-intel key management), `ueba/`. No shared `api/` client directory — each feature calls the backend directly; check an existing feature for the current pattern.

## The separate, standalone classification lab

`classifier_lab/src/` (`engine.py`, `toon.py`, `pg_sync.py`) is a distinct subsystem from `backend/app/ml_utils/` — it handles LLM-call tiering, caching, and payload compression for the classification pipeline, and syncs verdicts into `sz_alerts`. See `docs/research/cost-architecture.md` for what it actually does.
