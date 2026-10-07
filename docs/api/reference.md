# API Reference — SecureZen Backend

> Rewritten August 2026 to match the actual FastAPI routers in `backend/app/routers/`. The previous version described endpoints (`/api/dashboard-stats`, `/api/analyze-ioc`, CrewAI 6-agent triggers) and a response schema that no longer exist as documented.

**Base URL**: `http://<host>:25000` (Docker) or `http://localhost:5000` (running the backend directly outside Docker).
**Interactive docs**: `GET /docs` (Swagger UI) — always the source of truth for exact request/response bodies; this page is a map of what exists and where, not a full schema reference.
**Auth header**: `Authorization: Bearer <JWT_TOKEN>` on every route except `/health`, `/api/auth/login`, `/api/auth/register`.

---

## Auth model

JWT (HS256), issued by `POST /api/auth/login`, valid 24h. Token carries `sub` (email), `role`, `tenant`.

Real roles in use: `ROLE_ADMIN`, `ROLE_DEMO`, `ROLE_VIEWER`. (`ROLE_ANALYST` appears in one old check but is never assigned to a real user — treat as vestigial.)

- First user ever registered becomes `ROLE_ADMIN` automatically; everyone after defaults to `ROLE_DEMO`.
- `ROLE_VIEWER` is read-only; write endpoints explicitly reject it.
- Multi-tenant: the `tenant` JWT claim scopes queries; an admin can override via the `X-Tenant-ID` header.

`backend/app/utils/auth.py` is the single source of truth for all of this — read it directly if a route's exact permission check matters.

---

## `auth_routes.py` — `/api/auth`

| Method | Path | Notes |
|---|---|---|
| POST | `/login` | issues JWT |
| POST | `/register` | first user → ADMIN, rest → DEMO |
| GET | `/verify` | validate a token |
| GET | `/me` | current user profile |
| POST | `/change-password` | |

## `admin_routes.py` — `/api/admin` (admin-only unless noted)

Users: `GET/POST /users`, `PUT /users/{email}`, `DELETE /users/{email}/permanent`, `DELETE /users/{email}` (soft toggle)
Roles: `GET/POST /roles`, `DELETE /roles/{name}`
Tenants: `GET /tenants`, `PUT /tenants/{tenant_name}/status`
Directory: `GET /ad-users`, `GET /groups`
Analysts: `GET/POST /analysts`, `DELETE /analysts/{analyst_id}`, `PATCH /analysts/{analyst_id}/toggle`, `GET /analysts/{analyst_id}/alerts`, `GET /analysts/sync`

## `dashboard_routes.py` — `/api`

| Method | Path |
|---|---|
| GET | `/dashboard-metrics` |
| GET | `/dashboard-stats` |
| GET | `/ai/budget-status` |
| GET | `/dashboard-ai-insights` |

## `alerts` package — `/api/alerts` (`routers/alerts/{core,detail_ai,raw_events,verdicts}.py`)

Alert list & lifecycle (`core.py`): `GET /with-triage`, `GET ""` (main list), `POST /{alert_id}/triage`, `GET /{alert_id}/ioc`, `GET /{alert_id}/ir-playbook`, `GET /{alert_id}/apt-attribution`, `GET /{alert_id}/forensics`, `PATCH /{alert_id}/assign`, `DELETE /{alert_id}/unassign`, `PATCH /{alert_id}`, `PATCH /{alert_id}/status`, `GET /{alert_id}/assignment`

Detail & AI (`detail_ai.py`): `GET /{alert_id}`, `GET /{alert_id}/ai-specialists`, `POST /{alert_id}/ai-specialists/analyze`, `PATCH /raw-events/{event_id}/verdict`, `POST /raw-events/{event_id}/confirm-verdict`, `GET /raw-events/{event_id}/feedback`

Raw pipeline visibility (`raw_events.py`): `GET /raw-events`, `GET /pipeline-stats`, `GET /funnel-stats`, `GET /raw-events/histogram`, `GET /db-test` (admin-only)

Verdicts & accuracy (`verdicts.py`): `GET /ai-verdicts`, `GET /benchmark-stats`, `GET /accuracy-stats`, `GET /worker/health` — this is the endpoint to check whether `ml-worker` is alive and processing

## `intelligence` package — `/api/...` (`routers/intelligence/*.py`)

- Triage/MITRE: `POST /triage/analyze/{alert_id}`, `POST /triage/analyze-all`, `POST /mitre/auto-map/{alert_id}`, `POST /ai/investigate`, `POST /mitre/search`, `GET /mitre/health`, `GET /mitre/apt-attribution/{technique_id}`, `GET /mitre/predicted-next`, `GET /mitre/detection-guide/{technique_id}`
- LogAI (local classifier stats/tuning): `GET /logai/datasets`, `POST /logai/run-analysis`, `GET /logai/analysis-status`, `POST /logai/learning-mode`, `POST /logai/feedback`, `GET /logai/suggested-rules`, `POST /logai/promote-rule`, `GET /logai/stats`, `GET /logai/intelligence/stats`, `GET /logai/anomaly-timeline`
- CrewAI forensic investigations (`/crewai/*` prefix retained for compatibility — CrewAI itself was fully removed; these routes are thin wrappers delegating to the `InvestigationAgent`/`AgentRunner` fleet below, see `docs/changelog.md`): `GET /crewai/status`, `POST /crewai/clear-stuck`, `GET /crewai/config`, `POST /crewai/analyze`, `POST /crewai/investigate/{alert_id}`, `GET /crewai/result/{alert_id}`, `GET /crewai/pending`, `GET /crewai/verdicts`, `GET /crewai/reports`, `GET /crewai/logs`, `GET /crewai/stats`, `GET /crewai/history`, `POST /crewai/run-campaign`
- Threat actors: `GET /ai/usage-stats`, `GET /threat-actors`, `GET /threat-actors/{ip}`, `GET /threat-actors/{ip}/timeline`, `GET /threat-actors/{ip}/apt`
- ZEN AI Copilot: `POST /zen/chat`, `GET /zen/suggestions` (also see `copilot_routes.py` below), plus `GET /mitre/stats`, `GET /intelligence/mitre`, `GET /mitre/detections`, `POST /forensic`
- Threat hunting: `POST /hunt/search`, `POST /hunt/forensic-insight`, `GET /hunt/suggestions`, `GET /hunt/library`, `POST /hunt/save`, `GET /hunt/saved`, `POST /hunt/notebook`, `GET /hunt/notebook`
- Misc: `GET /campaigns`, `GET /ioc-enrichment/stats`, `GET /ioc/status`

## Other routers

| Router | Prefix | Purpose |
|---|---|---|
| `copilot_routes.py` | `/api/copilot` | `POST /chat` — the current ZEN AI Copilot chat entry point |
| `asset_routes.py` | `/api/assets` | asset inventory CRUD + `GET /{asset_id}/alerts` |
| `notification_routes.py` | `/api/notifications` | in-app notification feed |
| `source_routes.py` | `/api/sources` | log source (connector) management, key rotation, test-connection |
| `email_routes.py` | `/api/email` | phishing/email analysis, sender analysis, reports |
| `ingestion_routes.py` | `/api/ingest` | `POST /webhook`, `POST /manual`, `POST /raw-siem` — the actual ingestion entry points |
| `connector_routes.py` | `/api/connectors` | SIEM connector CRUD, `POST /{id}/sync-siem` |
| `connected_sources_routes.py` | `/api/connected-sources` | `GET /` — live gRPC-backed source status |
| `system_routes.py` | `/api/system` | `GET /health`, config, API key status, device inventory |
| `reports_routes.py` | `/api/reports` | generate/list/download/delete SOC reports |
| `audit_routes.py` | `/api/audit` | audit log |
| `pg_verdicts_routes.py` | `/api/pg-verdicts` | only mounted behind a feature flag — direct read access to the Postgres `verdicts` table |

## Agent fleet — `/api/agents` (`agents_routes.py`), new October 2026

See `docs/architecture/agentic_architecture.md` for what each agent actually does.

| Method | Path | Notes |
|---|---|---|
| GET | `/runs` | recent agent run history |
| GET | `/activity` | `sz_agent_activity_log` feed |
| GET | `/activity/recent` | same, trimmed for the dashboard widget |
| POST | `/threat-hunt` | kick off a Threat Hunter run |
| POST | `/attack-path` | build an Attack Path graph for an alert/campaign/entity (also used by Blast Radius) |

## Human-approval gate — `/api/agent-actions` (`approval_queue_routes.py`)

| Method | Path | Notes |
|---|---|---|
| GET | `/` | pending/approved/rejected proposed actions (e.g. block-IP from Response/SOAR) |
| POST | `/{action_id}/approve` | approve → `_ACTION_EXECUTORS` actually runs it |
| POST | `/{action_id}/reject` | reject → logged, nothing executes |

## Blast Radius — `/api/blast-radius` (`blast_radius_routes.py`)

See `docs/architecture/blast-radius.md`.

| Method | Path | Notes |
|---|---|---|
| GET | `/graph` | case/entity node-edge graph for the case explorer |
| GET | `/case/{case_id}` | single case detail (for the case report split view) |

## Custom Detection Rules — `/api/detection-rules` (`detection_rules_routes.py`)

| Method | Path | Notes |
|---|---|---|
| GET | `/` | list every rule (AI-drafted or human-authored) |
| POST | `/` | author a new rule directly as a human (no approval gate — no self-approval needed) |
| PATCH | `/{rule_id}` | edit a rule |
| POST | `/{rule_id}/deactivate` / `/{rule_id}/activate` | toggle whether `ml_worker_daemon.py` enforces it |

## Detection Tuning — `/api/detection-tuning` (`detection_tuning_routes.py`)

| Method | Path | Notes |
|---|---|---|
| GET | `/` | rule false-positive-rate recommendations from the Detection Tuning agent |
| POST | `/{recommendation_id}/dismiss` | human dismisses a recommendation without acting on it |

## Incidents — `/api/incidents` (`incident_routes.py`)

| Method | Path | Notes |
|---|---|---|
| GET | `/` | incident list (what Incident Commander has merged/opened) |
| GET | `/{incident_id}/alerts` | member alerts |
| GET | `/{incident_id}/report` / `/report/pdf` | generated incident report |
| POST | `/{incident_id}/status` | allowed values: `open`/`investigating`/`contained`/`resolved` |

## Compliance / Executive Briefing — `/api/compliance`, `/api/executive-briefing`

Single `GET /` on each — the latest report from the respective agent (`compliance_agent.py`, `executive_briefing_agent.py`).

## Forensic Analysis / embedded OpenSearch — `/api/forensics` (`forensics_routes.py`)

See `docs/architecture/forensic-analysis.md`.

| Method | Path | Notes |
|---|---|---|
| POST | `/osd-theme` | sync OSD's global dark/light setting to SecureZen's own toggle |
| GET | `/alert/{alert_id}` | deep-link params for embedding Discover scoped to one alert |

## Resource Governance — `/api/governance` (`governance_routes.py`)

See `docs/architecture/agentic_architecture.md` §6.

| Method | Path | Notes |
|---|---|---|
| GET | `/limits` | AI budget, Groq fallback rate, login limiter, DB pool usage |
| GET | `/agent-health` | per-agent run outcomes from `sz_agent_activity_log` |

## Pluggable LLM providers / threat-intel keys — `/api/admin/llm-providers`, `/api/admin/threat-intel-keys`

Admin-only. `GET /` lists configured providers/keys; `PUT /{id}` saves one (also writes `.env` in parallel so it takes effect without a restart); `POST /{id}/activate` (providers) or `/{provider}/test` (both) validates it works.

## SOC Insights — `/api/soc-insights` (`soc_insights_routes.py`)

| Method | Path | Notes |
|---|---|---|
| GET | `/metrics` | headline SOC KPIs |
| GET | `/confidence-calibration` | is the fleet's self-reported confidence actually correlated with being right |
| GET | `/cost-telemetry` | real Langfuse-backed cost/token numbers |

## UEBA — `/api/ueba` (`ueba_routes.py`)

See `docs/architecture/agentic_architecture.md` §7.

| Method | Path | Notes |
|---|---|---|
| GET | `/overview`, `/entities`, `/entities/{entity_id}` | entity-day risk scores |
| GET | `/anomalies` | flagged anomalies; `PATCH /{id}/acknowledge`, `/assign`, `DELETE /{id}/assign` |
| GET/POST/PATCH/DELETE | `/rules` | the deterministic Phase 2 rule set (not the ML Phase 3 model, which isn't human-editable) |

---

## Health checks

- `GET /health` — bare liveness check, used by the `zen-backend` container healthcheck.
- `GET /api/system/health` — fuller health including DB connectivity.
- `GET /api/alerts/worker/health` — is `ml-worker` actually polling/processing right now.

---

**Note on accuracy**: this reference was built by reading the actual route decorators in `backend/app/routers/`, not by re-deriving from an older doc. If a route here doesn't match what `/docs` (Swagger) shows at runtime, trust Swagger — it reflects the code at that exact moment, this file can drift.
