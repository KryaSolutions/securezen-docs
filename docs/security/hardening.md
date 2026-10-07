# Hardening Gaps

Confirmed against current code (not assumed). Status as of this writing — several fixed, some still real and open.

| Gap | Detail | Status |
|---|---|---|
| `JWT_SECRET_KEY` unset | Used to fall back to a hardcoded, publicly-known default string | ✅ Fixed — `backend/app/utils/auth.py` now raises at startup if unset, forcing every environment to set a real one |
| CORS wide open | `backend/app/main.py` used `allow_origin_regex="https?://.*"` — matched any origin | ✅ Fixed — scoped to `SECUREZEN_HOST`, or `CORS_ALLOWED_ORIGINS` if explicitly set |
| No rate limiting | No rate-limit middleware existed anywhere | ✅ Basic fix — `/api/auth/login` and `/register` limited to 5 attempts/60s per IP (in-memory; doesn't cover other endpoints or multiple replicas) |
| No monitoring/alerting | Health is checked manually via `/health` and `/api/alerts/worker/health`; nothing pages anyone automatically | ❌ Still open |
| No automated rollback | A bad deploy requires manual `git checkout` + redeploy; see `docs/deployment/environments.md` | ❌ Still open |
| Exposed credentials from deleted `claude.md` not yet rotated | A real Groq API key and admin password were committed in plaintext; the file is deleted but the credentials are still recoverable from git history until rotated | ❌ Still open — real action item, owed to whoever owns those credentials |

Remaining priority order: rotate the exposed credentials first (active compromise risk, not something fixable from code), then monitoring, then automated rollback.
