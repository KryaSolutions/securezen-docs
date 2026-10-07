# Tech Stack & Real Workflow — Verified October 2026

> **How this doc was built, and why it exists separately from `overview.md`**: every other doc on this site was written by reading *other docs* or by reading the code once, months ago. This one was built by reading the actual source files fresh — `pyproject.toml`/`uv.lock`, `package.json`, `docker-compose.yml`, every `Dockerfile`, `main.py`, `ml_worker_daemon.py`, `agents/runner.py`, the UEBA services, and the frontend's real entry point — with instructions to report what's actually there, not what a prior doc claimed. It caught real drift other docs had, including one wrong claim this site itself made earlier. Treat this as the most current ground truth; if something here ever contradicts another doc, trust this one (or re-verify against the code directly) until that doc is fixed.

---

## 1. Real tech stack (verified against `pyproject.toml` + `uv.lock`, not `requirements.txt`)

**`backend/requirements.txt` is dead.** It still lists `crewai`, but `crewai` is not in `pyproject.toml`/`uv.lock`, and `python3 -c "import crewai"` fails in the real venv (`ModuleNotFoundError`). `pyproject.toml` + `uv.lock` are what the Docker build actually installs from (`uv sync --frozen`) — that's the real list below.

| Layer | Technology | Notes |
|---|---|---|
| Package manager | **uv** | Not just a local convenience — `backend/Dockerfile` runs `uv sync --frozen --no-install-project --no-dev` and the container's actual `CMD`/`command` is `uv run ...`. |
| Web framework | FastAPI 0.115, Uvicorn | |
| Database (app) | PostgreSQL, SQLAlchemy (async, `asyncpg`) **and** a separate synchronous `psycopg2` pool | Two real, parallel connection mechanisms — see §4. |
| Agent LLM orchestration | **LangChain** (`langchain`, `langchain-groq`, `langchain-openai`) | Confirmed real and used throughout `agents/runner.py`. |
| Agent LLM orchestration | **NOT LangGraph**, despite `runner.py`'s own docstring claiming otherwise | See §5 — this is a real correction to a wrong claim. |
| Graph-based orchestration | **LangGraph** (`langgraph>=1.2.1`) | Real, but used in exactly one place — a standalone subprocess tool, not the agent fleet. See §5. |
| Agent-to-agent protocol | `a2a-sdk[fastapi]` | 6 real A2A servers mounted on the backend FastAPI app. |
| Monitoring | **Langfuse**, self-hosted (6 Docker services) | Real per-agent cost/token traces, not a homegrown estimate. |
| Local classifier | `transformers`, `torch` (CPU), `peft` (LoRA) | LogEM — HassanShehata/logem base, with a shelved LoRA fine-tune attempt. |
| ML anomaly filter (per-event) | `scikit-learn` | `ml_utils/anomaly_detector.py` |
| ML anomaly filter (UEBA, per-entity-day) | `scikit-learn` `IsolationForest` | `services/ueba/ml_engine.py` — a second, separate model from the one above. |
| Other ML/NLP libs present | `spacy`, `hdbscan`, `pyod`, `drain3`, `faiss-cpu`, `sentence-transformers` | Present in the dependency set; not all are wired into a currently-described pipeline — worth a direct check before assuming any one of these is load-bearing. |
| Search/forensics | OpenSearch 2.19, OpenSearch Dashboards (rebranded) | `opensearch-py` client |
| External integrations | `groq`, `geoip2`, `python-whois`, `slack-sdk`, Microsoft Graph (via `requests`), Sophos EDR client | |
| Frontend framework | React 18, Vite, built with **Bun** | `bun install --frozen-lockfile && bun run build` in the Dockerfile — Bun is real, not just mentioned. |
| Frontend routing | `react-router-dom` (`BrowserRouter`) | Installed and partially used — see §6 for a real caveat about how routing actually works. |
| Frontend charts/graphs | `recharts`, `react-force-graph-2d/3d`, `three`, `react-simple-maps` | |
| Frontend serving (prod) | Static build served by **nginx**, not a dev server | `frontend/Dockerfile` final stage is `nginx:stable-alpine`; SPA fallback via `try_files ... /index.html` in `nginx.conf`. |

### Docker Compose — 12 real services

| Group | Services |
|---|---|
| Core app (4) | `securezen-db` (Postgres 16), `backend` (FastAPI), `ml-worker` (**same image as `backend`**, different `command` — see §3), `frontend` (nginx) |
| Forensic Analysis (2) | `opensearch` 2.19, `opensearch-dashboards` (rebranded via a custom Dockerfile that strips 15 plugins and relabels the UI) |
| Monitoring — self-hosted Langfuse (6) | `langfuse-web`, `langfuse-worker`, `langfuse-clickhouse`, `langfuse-postgres`, `langfuse-redis`, `langfuse-minio` |

---

## 2. The real request lifecycle — file by file

This is the actual, currently-live path, confirmed by reading the code, not inferred from a diagram. It is **not one straight pipeline** — there are 3 separate ingestion paths, and one of them is dead code. Don't assume a single mental model covers all of it.

**Path A — polled SIEM connectors (the main, documented pipeline):**
1. `backend/app/core/preprocessing/api_poller_daemon.py` (`poll_api_connectors()`, a background thread started in `main.py`) polls every active row in `sz_connectors WHERE category='Inbound SIEM'` every 60s and `INSERT`s into the **Minion Postgres DB**'s `events` table.
2. The **`ml-worker`** Docker service (`backend/app/ml_utils/ml_worker_daemon.py::process_anomalies_loop()`) — note: this is **not started inside the `backend` FastAPI container at all**; `main.py` has it explicitly commented out with the note that it "runs inside its own dedicated standalone docker container." It polls `events` for rows with no matching `verdicts` row (`FOR UPDATE SKIP LOCKED`, so multiple replicas can't double-process), runs the Isolation Forest anomaly filter + deterministic rule overrides, then local LogEM → external Groq fallback, and writes the verdict back to Minion's `verdicts` table.
3. Still inside that same loop, `classifier_lab/src/pg_sync.py::sync_verdicts_to_securezen()` joins Minion's `events`+`verdicts` and `INSERT ... ON CONFLICT ... INTO sz_alerts` — **this is the actual moment an alert starts existing for the dashboard**. On a genuinely new row, it synchronously calls `agents/alert_triage_agent.py::triage_alert()` right there and writes the `triage_*` columns onto that same row.
4. `investigation/auto_trigger.py`'s alert scanner (a background thread) polls `sz_alerts` afterward and can dispatch deeper investigation/notifications.
5. The frontend reads `sz_alerts` (and the raw Minion `events` table for raw-feed views) through `routers/alerts/*.py`.

**Path B — direct webhook ingestion (parallel, different classification entirely):**
`POST /api/ingest/webhook` → `core/sensors/orchestrator.py::analyze_and_route()` classifies inline with its own rule engine + `HybridClassifier`, and writes straight into `sz_alerts` via `AsyncAlertStorage`. This bypasses the Minion DB, `ml-worker`, and the local/external LLM severity triage entirely — a genuinely different code path from Path A, not a detail of it.

**Path C — manual ingestion:** `POST /api/ingest/manual` writes into Minion's `events` table directly, then spawns a separate `classifier_lab/main.py` subprocess to classify it — a third, distinct mechanism not yet fully traced end-to-end.

**Dead path, confirmed:** `POST /api/ingest/raw-siem` inserts into `sz_raw_siem_events`, then tries to import `app.core.sensors.siem_poller` to process it further — **that file does not exist anywhere in the repository**. The `try/except` swallows the `ImportError` and logs a warning. Rows inserted here are never processed by anything else. This is a verified dead/broken path, not a guess.

---

## 3. `ml-worker` is the `backend` image, not a separate build

`docker-compose.yml`'s `ml-worker` service uses `build: ./backend` — the identical build context and Dockerfile as the `backend` service — but overrides the command to `uv run python -m app.ml_utils.ml_worker_daemon` instead of the Dockerfile's default `uvicorn` `CMD`. It deliberately has no `container_name` so it can be horizontally scaled (`docker compose up --scale ml-worker=N`); the Minion-DB row locking (`FOR UPDATE SKIP LOCKED`) is what makes that safe.

---

## 4. Two real, separate database connection mechanisms (plus a third, easy to conflate)

- **Async**: `backend/app/database/session.py` — SQLAlchemy + `asyncpg`, one process-wide engine (`pool_size=10, max_overflow=20`), used by essentially all FastAPI request-handling code.
- **Sync, pooled**: `_sz_conn()` in `backend/app/utils/helpers.py` — a `psycopg2.pool.ThreadedConnectionPool`-backed helper, consolidating what used to be 6+ duplicated connection snippets. Used by `ml_worker_daemon.py`, `auto_trigger.py`, and the `backend/scripts/*.py` CLI tools.
- **A third, separate, un-pooled `_sz_conn()`** exists inside `classifier_lab/src/pg_sync.py` — same name, different module, different implementation (plain `psycopg2.connect()` per call, re-reading env vars live each time). Easy to assume these are the same function by name alone; they aren't.

Both the pooled and unpooled versions, and the async engine, ultimately point at the same physical SecureZen Postgres instance — the duplication is about connection *mechanism*, not about there being multiple databases.

---

## 5. Correction: the agent fleet does not use LangGraph

`backend/app/agents/runner.py`'s own module docstring says `AgentRunner` "wraps the same LangGraph/ChatGroq mechanics already proven in `investigation/crew.py`'s `TruePositiveCrew`." **This is not what the code does.** A direct search (`grep -rn "langgraph" app/agents app/investigation`) returns zero matches. What `AgentRunner` actually does is a hand-written, bounded ReAct-style loop (`for iteration in range(1, max_iterations+1): ...`) calling `ChatGroq` (or whichever provider is active, via `services/llm_provider.py`) with LangChain's plain `bind_tools()`/`ToolMessage` primitives — real LangChain, not LangGraph.

The **only genuine LangGraph usage in the entire repository** is `classifier_lab/src/graph.py` — a real 2-node `StateGraph` (`init` → `consolidated` → `END`), but it's invoked out-of-process, via `subprocess`, from `routers/alerts/detail_ai.py` for one specific path (`POST /api/ingest/manual`'s classification). It plays no role in the 15-agent `AgentRunner` fleet or the A2A system described in `architecture/agentic_architecture.md`.

**A2A mechanics, confirmed real**: 6 agents (Threat Hunter, Threat Intel, Response, Investigation, Detection Engineering, Incident Commander) each stand up a real `a2a-sdk` server (`DefaultRequestHandlerV2` + `InMemoryTaskStore`), mounted on the backend FastAPI app at `/a2a/<agent>/`. Calling agents use `a2a.client.create_client` to POST a `SendMessageRequest` — e.g. Alert Triage hands a P1/P2 alert to Investigation this way; Threat Hunter hands a confirmed threat's IOC to Threat Intel and Response the same way.

---

## 6. Frontend: a real routing caveat

`src/main.jsx` mounts `AuthProvider` → `ThemeProvider` → `BrowserRouter` → `App.jsx`, and `react-router-dom` is genuinely installed and used — but **not the way `src/routes.jsx` suggests**. `routes.jsx` defines a full `<Routes>/<Route>` tree (`AppRoutes`), but `App.jsx` never imports or renders it. Instead, `App.jsx` keeps its own `activeView` state, syncs it to `location.pathname` via a `resolveViewKey`/`resolveRoute` pair (also from `routes.jsx`), and renders the page body as a long chain of `{activeView === 'x' && <Component/>}` conditionals. `react-router-dom` is really only providing `BrowserRouter`, `useLocation`, `useNavigate`, and (in a few leaf pages) `useSearchParams` — the declarative route tree in `routes.jsx` is dead code, confirmed by a direct comment in `features/forensics/ForensicDashboard.jsx` itself.

There is also **no shared API client** (`src/api/` or `src/services/` doesn't exist). Each feature folder either calls `axios` inline or defines its own private `fetchWithAuth` wrapper around `fetch()` — the same small pattern re-implemented independently in at least 5 different `hooks/useX.js` files (`intelligence`, `reports`, `copilot`, `system`, `email`). Not a bug, just a real inconsistency worth knowing about before assuming there's one obvious place to add a new API call.

---

## 7. UEBA: confirmed scheduling mechanism

All 3 UEBA phases (`signal_builder.py`, `rule_engine.py`, `ml_engine.py`) run as plain `threading.Thread(daemon=True)` loops started from `main.py`, each sleeping 3600 seconds (hourly) — not cron, not APScheduler, just a `while True` + `time.sleep(3600)`. Each processes both tenants (`KRYA Solutions`, `FintrustCapital`) for both today and yesterday every cycle. The ML phase requires at least 20 training rows (`MIN_TRAINING_SAMPLES`) per tenant/entity-type or it skips scoring for that cycle, and blends scores via `risk_pct = GREATEST(rule_score, model_score)` — the max, not an average, by deliberate design.

---

## 8. Full list of real background workers (from `main.py`'s startup event)

`start_alert_scanner`, `start_threat_intel_worker`, `start_detection_tuning_worker`, `start_compliance_worker`, `start_executive_briefing_worker`, `start_governance_worker`, `start_sophos_asset_sync_worker`, `start_opensearch_sync_worker`, `start_langfuse_sync_worker`, `start_email_mailbox_sync_worker`, `start_ueba_signal_worker`, `start_ueba_rule_worker`, `start_ueba_ml_worker`, `start_agent_fleet`, `start_simulator`, `start_live_telemetry_daemon`, `start_api_poller`, plus an inline hourly `background_shifter()` asyncio task for demo-date shifting. 18 independent workers, each started in its own try/except so one failing to start doesn't take down the rest.

---

## Where to look for more detail

- `docs/architecture/overview.md` — higher-level narrative version of the classification pipeline (Path A above)
- `docs/architecture/agentic_architecture.md` — the agent fleet roster and what each agent does (now consistent with the LangChain-not-LangGraph correction above)
- `docs/architecture/network-topology.md` — full port table for all 12 Docker services
- `docs/getting-started/setup.md` — environment variables and bring-up steps
