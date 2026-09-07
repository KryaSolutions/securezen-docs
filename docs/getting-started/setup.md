# Setup & Installation — SecureZen

> Rewritten August 2026. The previous version described a Windows-first, `start_standalone.bat`-driven, SQLite-backed setup — that script doesn't exist in the current repo, and the app is fully Docker Compose + PostgreSQL now.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Docker + Docker Compose | the only supported way to run the full stack |
| Git | |
| (optional, frontend-only local dev) Bun | `frontend/package.json` scripts (`dev`, `build`, `lint`, `preview`) all run via `bun x vite` |

There is no `.bat` startup script and no bare-metal/native install path documented — everything runs as containers defined in the root `docker-compose.yml`.

### API keys you'll need in `.env`

| Purpose | Vars |
|---|---|
| LLM classification (external fallback + copilot) | `GROQ_API_KEY`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_PROVIDER_KEY`, `LLM_TEMPERATURE`, `ZEN_AI_FAST_PROVIDER`, `ZEN_AI_FAST_MODEL`, `ZEN_AI_DEEP_PROVIDER`, `ZEN_AI_DEEP_MODEL` |
| Threat intel enrichment | `VIRUSTOTAL_API_KEY`, `ABUSEIPDB_API_KEY`, `IPQUALITYSCORE_API_KEY`, `MAXMIND_DB_PATH` |
| YETI CTI (optional) | `YETI_URL`, `YETI_USERNAME`, `YETI_PASSWORD`, `YETI_API_KEY` |
| SMTP notifications (optional) | `SMTP_ENABLED`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `NOTIFY_EMAIL` |
| Slack (optional) | `SLACK_BOT_TOKEN` |

There is no `.env.example` checked into the repo — build `.env` from this list and the Postgres/networking vars below, or copy from a server that already has one configured (never paste real key values into chat/docs).

### Database & networking vars

`SZ_PG_HOST`, `SZ_PG_PORT`, `SZ_PG_DB`, `SZ_PG_USER`, `SZ_PG_PASS`, `MINION_DB_URL`, `SECUREZEN_HOST`, `SECUREZEN_PORT`, `PYTHONPATH`.

**Set `JWT_SECRET_KEY` explicitly.** It's not in the default `.env` template and the code falls back to a hardcoded default (`backend/app/utils/auth.py`) if unset — fine for a throwaway local dev box, not acceptable anywhere reachable by anyone else.

### ML worker vars

`LOGEM_MODEL_PATH` — path to the local classifier model. **Do not set this on a shared/production-traffic server that also runs other heavy services** — running the local model on such a box has previously caused CPU contention severe enough to make the login endpoint unresponsive. `MINION_GRPC_HOST`, `MINION_X_API_KEY`, `POLLER_BATCH_SIZE`, `POLLER_INTERVAL_SECONDS`, `ENABLE_SIMULATOR`.

---

## Bring the stack up

```bash
git clone <repo-url>
cd main_folder
# create .env with the vars above
docker compose up -d --build
```

This starts 4 containers:

| Service | Container | Host port → Container port |
|---|---|---|
| `securezen-db` | `zen-postgres` | `5434 → 5432` |
| `backend` | `zen-backend` | `25000 → 5000` |
| `ml-worker` | `zen-ml-worker` | not published — internal healthcheck on `:8001/health` |
| `frontend` | `zen-frontend` | `27000 → 80` |

The frontend is a static build — it does **not** proxy `/api` through nginx. It calls the backend directly at the URL baked in at build time from `SECUREZEN_HOST`/`SECUREZEN_PORT` (`VITE_API_URL` build arg). If you change `SECUREZEN_HOST`/`PORT` after the fact, rebuild the frontend image, not just restart the container.

### Verify it's healthy

```bash
docker compose ps                                    # all 4 should show healthy/running
curl http://localhost:25000/health                   # backend liveness
curl http://localhost:25000/api/alerts/worker/health  # is ml-worker actually processing
```

If `backend` shows `unhealthy` right after a code change that only touched the healthcheck itself, a plain `docker compose up -d backend` may no-op (Compose doesn't always detect healthcheck-only diffs) — force it:

```bash
docker compose up -d --force-recreate backend
```

### Frontend-only local dev (outside Docker)

```bash
cd frontend
bun install
bun x vite   # or: bun run dev
```

Point it at a running backend via the appropriate `VITE_API_URL` env var for your dev setup.

---

## Deployment topology note

This project runs three environments with different rules — see `docs/deployment/environments.md`. In short: don't enable `LOGEM_MODEL_PATH` (the local model) on a shared demo/production box; that combination is what caused the CPU-contention incident referenced above.

---

**Superseded content removed in this rewrite**: UDP syslog listener setup (port 514/5514), `start_standalone.bat`, SQLite paths, Windows-specific PyTorch env var workarounds, Wazuh `ossec.conf` webhook integration steps — none of these reflect the current ingestion path (`POST /api/ingest/*`, see `API_REFERENCE.md`) or current database (PostgreSQL only). If Wazuh forwarding needs documenting again, it should describe the actual current webhook/connector-based ingestion, not the old `hook_url` snippet.
