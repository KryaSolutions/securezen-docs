---
sidebar_position: 13
---

# SecureZen CHANGELOG
## All notable changes documented in reverse chronological order

> **Note (August 2026)**: entries below `[3.0.0]` are historical — they describe the SQLite/UDP-syslog/BERT/CrewAI-6-agent era of the project as it actually was at the time. That system has since been replaced (see "Unreleased" below and `docs/architecture/overview.md`). The "Upcoming — Sprint 5-8" section at the bottom describes what was *planned* then; what actually shipped is captured here instead.

---

## [Unreleased] — October 2026

### Agent fleet: CrewAI replaced with AgentRunner + real tool-calling + A2A
#### Added
- **`AgentRunner`** (`backend/app/agents/runner.py`) — shared base class for every new agent: real LLM tool-calling (the model decides which tools to call, not a fixed sequence), a bounded autonomous loop (`max_iterations` + wall-clock timeout, reports `needs_human` instead of looping forever), automatic activity logging (`sz_agent_activity_log`), and real Langfuse tracing/cost accounting instead of a second homegrown cost table.
- **15 of an 18-agent fleet built**: Alert Triage, Investigation (TruePositiveCrew's successor), MITRE Mapping, Daily Report, Threat Intelligence, Email Security, Detection Tuning, Incident Commander, Compliance, Attack Path, Response/SOAR, Executive Briefing, ZEN Chat (rebuilt), Threat Hunter, Detection Engineering. Full roster and what each does in `docs/architecture/agentic_architecture.md`.
- **CrewAI fully removed.** The 4 original crews (`AlertTriageCrew`, `MitreMappingCrew`, `DailyReportCrew`, `TruePositiveCrew`) are now thin backward-compatible wrappers in `investigation/crew.py` delegating to the new agents.
- **Real Agent2Agent (A2A) protocol** endpoints for Detection Engineering, Incident Commander, Investigation, and Response — Alert Triage is the first real A2A client, handing P1/P2 alerts straight to Investigation without a human in the loop.
- **Human-approval gate completed** (`routers/approval_queue_routes.py`) — the Response/SOAR agent is the first agent that can touch a live system (block an IP), and only ever does so by proposing the action (`AgentRunner.propose_action()` → `sz_agent_actions`, `status='pending_approval'`); a human approves or rejects it in the Approval Queue UI before it actually executes. Replaces the old `response_engine.py` auto-fire path, which bypassed human review entirely and had been silently broken (a type mismatch meant it never actually ran).
- **Resource Governance** (`services/governance_service.py`) — a single real-numbers view across 7 previously-disconnected usage/capacity limits (AI budget, Groq fallback rate, login limiter, DB pool usage, per-agent health) with alerting that didn't exist for any of them before.
- **Pluggable LLM providers** (`services/llm_provider.py`) — any OpenAI-compatible provider can be activated from Settings → Integrations for the whole agent fleet, not just Groq; fixed a real bug where `AgentRunner` ignored the activated provider and always used Groq regardless.
- **Real monitoring via Langfuse** (`services/langfuse_sync.py`) — every agent run's cost/token numbers are backfilled from Langfuse's own metrics API, not estimated locally.
- **ZEN Chat rebuilt onto the shared tool library** — the old version glued the same hardcoded context dump onto every message and let the LLM free-write raw SQL with no tenant boundary. It now shares the same tenant-scoped, read-only tools as Threat Hunter/Investigation/Compliance and decides for itself what a question actually needs.
- **UEBA Phase 3** — real unsupervised `IsolationForest` (scikit-learn) anomaly scoring per tenant per entity-type, trained fresh daily, blended with Phase 2's deterministic rule score. Full phase history in `docs/development/ueba-plan.md`.
- **Daily Report overhaul** — the dashboard now reads real structured per-section JSON (not re-parsed prose), the Agent Fleet Activity section reflects real agent run data, and PDF/email/case-report exports are all real (previously partially stubbed).
- **Ground-truth benchmark infrastructure** — 513 real alerts fully human-confirmed (`sz_ground_truth_labels`), plus an independent LogEM-vs-Groq-vs-Laya 3-way benchmark harness scoring precision/recall/F1 per class against that ground truth. Results land in `docs/ai-soc/ml-accuracy.md` once complete.

#### Fixed
- **Groq external-LLM fallback returning empty output on long/complex logs** — `max_tokens=100` was too tight for a reasoning model's internal "thinking" tokens before it ever emitted the final answer, so long raw logs silently parsed as `UNKNOWN`. Raised to 400, confirmed fixed.
- **LLM provider key saves not reaching the running process** — saving a provider key in Settings now also writes `.env` in parallel, so a newly-activated provider takes effect without requiring a manual restart.
- **`AgentRunner` respecting only Groq regardless of what was activated** — see "Pluggable LLM providers" above.

### Blast Radius case explorer, Email Security hardening, Custom Detection Rules UI, embedded OpenSearch dashboards
#### Added
- **Blast Radius / Case Explorer** (`routers/blast_radius_routes.py`, `features/blastradius/`) — groups recent alerts into cases (campaign-linked or single-alert), graphs cases and shared entities (IP/user/host) so lateral movement across separately-alerted events becomes visible. Built in 6 stages: shared-entity graph engine → force-directed canvas → case list sidebar with filters → detail panels + Attack Path integration → timeline replay scrubber → 6-tier verdict taxonomy (Malicious/Suspicious/Inconclusive/False_positive/Benign/Degraded) with a split-view case report. Full detail in `docs/architecture/blast-radius.md`.
- **Email Security: live mailbox scanning + behavioral signal** — Microsoft Graph client-credentials integration (`services/graph_mail_client.py`, `services/email_mailbox_sync.py`) replaces manual copy-paste intake; a new `sender_history` tool flags first-time senders, the classic BEC/VEC behavioral signal pure content-scoring can't catch.
- **Email Security: QR code, time-of-click, auto-remediation** (all dormant by default, env-var activated) — QR/quishing detection via OpenCV (`services/qr_scanner.py`), HMAC-signed time-of-click URL re-verification (`services/click_protection.py`, matches Microsoft Safe Links), and auto-remediation that proposes (never auto-executes) mailbox action through the same human-approval gate as Response/SOAR. Full detail in `docs/architecture/email-security.md`.
- **Custom Detection Rules UI** (`routers/detection_rules_routes.py`, `features/agents/DetectionRulesPage.jsx`) — full CRUD for the custom rules `ml_worker_daemon.py` already enforced as a rule-override source: list, edit, deactivate/reactivate, or author a rule directly as a human (skips the AI-proposal approval gate since there's no self-approval needed). A `created_by` column distinguishes `detection_engineering_agent` from a human's email.
- **Forensic Analysis** (`routers/forensics_routes.py`) — a real embedded OpenSearch Dashboards Discover, deep-linking to a specific alert's ±2-day window and host/user. New `opensearch`/`opensearch-dashboards` Docker Compose services, rebranded (every non-core OSD plugin stripped at build time) and theme-synced to SecureZen's own dark/light toggle.
- **AI Analysis dashboard** — 6 native OSD visualizations (verdict donut, confidence histogram, investigations-over-time, severity bar, top MITRE techniques, agent breakdown) auto-provisioned on every backend startup from a `securezen-ai-analysis` index (`sz_crewai_tasks` left-joined with `sz_alerts`), reusing Blast Radius's verdict taxonomy for consistent coloring.

#### Fixed
- **AI Analysis dashboard showing zero investigations** — every `sz_crewai_tasks` row referenced an `alert_id` already purged by the demo's 60-day cleanup job, so an inner join against `sz_alerts` silently returned nothing. Switched to a left join.

---

## [Unreleased] — August 2026

### Pipeline rewrite: Postgres, real-time ML worker, rule overrides
#### Added
- **PostgreSQL as the only database** — full migration off SQLite. `backend/app/database/session.py`, async via `asyncpg`.
- **`ml_worker_daemon.py`** — the live 4-phase classification pipeline replacing the old batch orchestrator: poll (newest-first, `FOR UPDATE SKIP LOCKED`) → Isolation Forest anomaly filter + deterministic rule overrides (signature match, repeat-login count) → local LLM (LogEM) with external Groq fallback → denormalized verdict write → sync to `sz_alerts`.
- **Router package split** — `alert_routes.py` and `intelligence_routes.py` split into `routers/alerts/{core,detail_ai,raw_events,verdicts}.py` and `routers/intelligence/*.py`.
- **Denormalized verdict context** — `verdicts` rows now carry srcip/dstip/country/device/hostname/rule_description directly, so the dashboard doesn't need a join back to raw events.
- **Multi-server operational split** — a permanently-frozen demo server, a dedicated test/candidate server running the local model against real traffic, and local dev.
- **Manual ML filter validation methodology** (`sz_ml_filter_validation` table) — stratified human review, used in place of automated accuracy scoring since the original ground-truth data was lost in an earlier cleanup wipe.
- **LoRA fine-tuning attempt** for the local classifier — trained and shadow-tested, but shelved: it called LOW on 100% of real HIGH/CRITICAL test cases (see `docs/research/fine-tuning.md`).

#### Fixed
- **`load_dotenv(override=True)` env corruption** — multiple modules (`anomaly_detector.py`, `ip_enricher.py`, `response_engine.py`, `alert_classifier.py`) were silently overwriting correct Docker container Postgres env vars with stale `.env` file defaults on import. Root-caused and fixed across all four.
- **Backend healthcheck port mismatch** causing `zen-backend` to show `unhealthy` even when the app was fine.
- **Poll order** — switched raw event polling from oldest-first to newest-first so a large historical backlog can't block triage of fresh alerts.
- **CPU contention incident** — running the local classifier (`LOGEM_MODEL_PATH`) on a shared, heavily-loaded server made the login endpoint unresponsive; fixed by removing local-model config from that server's `.env` and confining local-model use to the dedicated test server.

---

## [3.0.0] — April 2026 (superseded)

### Sprint 4: Reporting & Analytics
#### Added
- **SOC Daily Report Engine**: Automated HTML report generation with enterprise styling, saved to `reports/` folder
- **Report Viewer API**: `GET /api/reports/list` and `GET /api/reports/{filename}` endpoints registered in server.py
- **ZEN AI Copilot — Auto-Expand**: Chatbot now opens in maximized modal by default for better investigative UX
- **ZEN AI Copilot — Table Rendering**: Query results now render as formatted Markdown tables instead of raw JSON
- **ZEN AI Copilot — Severity Fix**: Switched from numeric `rule_level` filtering to text-based `severity` labels (CRITICAL/HIGH/MEDIUM/LOW) for accurate results
- **Forensic Analysis Fix**: `/analyze critical` command now correctly queries `severity = 'CRITICAL'` column
- **Agile Product Backlog**: Full Sprint 1–8 backlog created for team project management

#### Fixed
- **ZEN Chat routing**: Registered `/api/zen/chat` and `/api/zen/suggestions` routes in `server.py` (previously disconnected)
- **ChatRequest import**: Fixed missing `ChatRequest` model import causing 500 errors on chat endpoint
- **Dashboard data alignment**: Fixed blank Top Threat Actors table — now uses correct `src_ip` column over `agent_ip`

---

## [2.5.0] — March 2026

### Sprint 3: Dashboard & ZEN Copilot
#### Added
- **ZEN AI Copilot**: Full NLP chatbot interface (`ZENChatbot.jsx`) with suggested questions and conversational forensics
- **Copilot Service** (`copilot_service.py`): Groq LLM-powered intent detection + SQL generation from natural language
- **Alert Triage System**: P1-P5 priority-based alert sorting, status management (Open/Acknowledged/Closed)
- **MITRE ATT&CK Dashboard**: Tactic heatmap, kill chain phase donut chart
- **GeoIP Threat Map**: Real-time IP geolocation via ip-api.com with fallback to demo coordinates
- **Phishing Detection Engine**: BERT-based email analysis module with `email_analysis` table

#### Fixed
- **RBAC Enforcement**: System health endpoints now require ADMIN role; DEMO accounts cannot access sensitive data
- **JWT Token Flow**: Fixed missing Authorization header propagation from React Triage alert buttons
- **Mock Data Removal**: All hardcoded placeholder values replaced with live database queries

---

## [2.0.0] — February–March 2026

### Sprint 2: AI Intelligence Layer
#### Added
- **BERT ML Model**: `syslog_bert_model.joblib` loaded at startup for offline ML inference without internet
- **Hybrid Classification Pipeline**: 3-tier model (Tier 1: Regex, Tier 2: BERT, Tier 3: Groq LLM)
- **IOC Enrichment Worker**: Background enrichment via VirusTotal, AbuseIPDB, IPQualityScore
- **YETI CTI Integration**: Observable lookup for threat intelligence correlation
- **CrewAI 6-Agent Forensic Engine**: Coordinator → VirusTotal → AbuseIPDB → YETI → Evidence → Reporter pipeline
- **Auto-Trigger Engine**: `auto_trigger.py` monitors CRITICAL alerts and auto-dispatches CrewAI (1hr cooldown)
- **SMTP Email Notifications**: Office 365 integration for True Positive alert emails
- **MITRE ATT&CK Mapping**: Automatic tactic/technique tagging on all classified alerts
- **Kill Chain Assignment**: Lockheed Martin Kill Chain phases mapped per alert
- **AI Call Log**: Complete audit trail for all LLM API calls (`ai_call_log` table)
- **AI Response Cache**: 30-day LLM result caching to reduce costs
- **SMTP Diagnostic Endpoint**: `POST /api/smtp/test` for email configuration validation
- **Groq Model Update**: Migrated from deprecated `llama3-8b-8192` to `llama-3.3-70b-versatile`

#### Fixed
- **Database Absolute Paths**: All `ThreatDatabase` instances now use absolute path resolution from `SECUREZEN_DB_PATH` env var
- **WAL Mode**: SQLite WAL journal mode enabled for concurrent read/write without locking errors
- **PyTorch Windows Crash**: `KMP_DUPLICATE_LIB_OK=TRUE` and `CUDA_VISIBLE_DEVICES=-1` added to startup scripts

---

## [1.5.0] — February 2026

### Sprint 1: Foundation Layer
#### Added
- **UDP Syslog Listener**: `syslog_listener.py` receiving on port 514/5514
- **Multi-Format Parser**: RFC 5424, RFC 3164, CEF, and JSON format support
- **In-Memory Buffer**: `collections.deque(maxlen=10000)` for burst handling
- **Complete SQLite Schema**: `syslog_alerts.db` with 13 tables, `users.db` with 4 tables
- **FastAPI Backend**: `main.py` entry point with Uvicorn on port 5000
- **React Frontend**: Vite-based SPA on port 5173
- **JWT Authentication**: HS256 token generation with 8-hour expiry
- **RBAC System**: ADMIN / ANALYST / DEMO roles with endpoint-level guards
- **User Seeding**: Default admin, analyst, demo accounts on first startup
- **start_standalone.bat**: One-click startup for all 4 services
- **WinRM Poller**: `winrm_poller.py` for Windows Event Log collection

#### Fixed
- **Modular Architecture**: Consolidated from multi-app structure (`standalone_app/` + `siem_overlay/`) to single unified `secure_zen_core/` architecture
- **Schema Migration**: `ALTER TABLE` migration runs safely on startup for new columns

---

## [1.0.0] — Early 2026 (Initial)

### Proof of Concept
- Basic syslog UDP receiver
- Redis buffer (later replaced by in-memory + planned Kafka)
- Single-stage ML classification
- Minimal React dashboard with hardcoded data
- Initial CrewAI integration (single-agent)
- SQLite database (basic schema)

---

## Upcoming — Sprint 5-8 (historical plan, as of April 2026 — see actual outcome below)

> What actually shipped from this list, as of August 2026: PostgreSQL migration ✅ (done, see `[Unreleased]` above), Docker Compose for backend/frontend/Postgres ✅ (done — no Redis/Celery/Windows-service wrapper were built). Multi-tenancy, MISP/OpenCTI, and a full OWASP security audit remain not done.

- PostgreSQL migration (replace SQLite for production)
- Redis + Celery task queue (non-blocking CrewAI jobs)
- Connection pooling for concurrent users
- Alembic database migration scripts
- Docker Compose: backend + frontend + PostgreSQL + Redis + Celery
- Windows Service wrapper (`win32serviceutil`)
- HTTPS / Nginx reverse proxy
- Rate limiting and CORS hardening
- Multi-tenancy (tenant-isolated data)
- Wazuh SIEM native integration
- Slack / Microsoft Teams notifications
- MISP + OpenCTI threat intel feeds
- Security audit (OWASP Top 10)
- v1.0.0 enterprise release

---

**Author**: KRYA SOLUTIONS PRIVATE LIMITED
**Maintained by**: PRAVEENKUMAR SURESH
