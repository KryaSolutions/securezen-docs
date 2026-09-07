# Requirements

## To run it

Docker + Docker Compose, Git. (Optional, frontend-only local dev: Bun.)

## `.env` variables you'll need

| Purpose | Vars |
|---|---|
| Database | `SZ_PG_HOST`, `SZ_PG_PORT`, `SZ_PG_DB`, `SZ_PG_USER`, `SZ_PG_PASS`, `MINION_DB_URL` |
| Auth | `JWT_SECRET_KEY` — **set this explicitly**, it silently falls back to an insecure hardcoded default otherwise |
| LLM / classification | `GROQ_API_KEY`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_PROVIDER_KEY`, `LLM_TEMPERATURE`, `ZEN_AI_FAST_PROVIDER`, `ZEN_AI_FAST_MODEL`, `ZEN_AI_DEEP_PROVIDER`, `ZEN_AI_DEEP_MODEL`, `AI_MONTHLY_BUDGET_CALLS`, `AI_MONTHLY_BUDGET_TOKENS`, `AI_CACHE_TTL_DAYS` |
| Threat intel | `VIRUSTOTAL_API_KEY`, `ABUSEIPDB_API_KEY`, `IPQUALITYSCORE_API_KEY`, `MAXMIND_DB_PATH`, `YETI_URL`, `YETI_USERNAME`, `YETI_PASSWORD`, `YETI_API_KEY` |
| Local model (test/candidate server only) | `LOGEM_MODEL_PATH` — do **not** set on a shared/demo server, see `docs/deployment/environments.md` |
| Notifications (optional) | `SMTP_ENABLED`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `NOTIFY_EMAIL`, `SLACK_BOT_TOKEN` |
| Networking | `SECUREZEN_HOST`, `SECUREZEN_PORT`, `PYTHONPATH` |

No `.env.example` exists in the repo — build `.env` from this list (never paste real values into chat or docs).
