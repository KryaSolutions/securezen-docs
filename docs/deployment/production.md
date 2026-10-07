# Production Readiness Checklist

What's confirmed done vs. still open before this should be treated as hardened production infrastructure (not just "currently running and demoed successfully"). Detail on each gap: `docs/security/hardening.md`.

| Item | Status |
|---|---|
| PostgreSQL as system of record | ✅ Done |
| Containerized deployment | ✅ Done (Docker Compose) |
| JWT auth + RBAC | ✅ Done |
| `JWT_SECRET_KEY` explicitly set (not the hardcoded fallback) | ✅ Fixed — backend now refuses to start if unset, instead of silently using a known default. **Action needed per environment**: set a real `JWT_SECRET_KEY` in each `.env` (114/198/local) before deploying this, or the backend won't boot |
| CORS restricted to known origins | ✅ Fixed — scoped to `SECUREZEN_HOST`, or an explicit `CORS_ALLOWED_ORIGINS` list if set |
| Rate limiting on auth/API | ✅ Basic fix — `/api/auth/login` and `/register` now rate-limited (5 attempts/60s per IP, in-memory). Doesn't cover other endpoints, and in-memory won't hold up across multiple backend replicas — good enough for now |
| Automated rollback on bad deploy | ❌ None — manual `git checkout` + redeploy only |
| Exposed-credential rotation (Groq key, admin password from deleted `claude.md`) | ❌ Flagged, owed to whoever owns those credentials |
| Monitoring/alerting (Prometheus/Grafana or equivalent) | ❌ None — health is checked by manually hitting an endpoint |
| Load testing / capacity planning | ❌ Never done |

None of this blocks the current demo/test usage — it blocks treating any environment as hardened, unattended production infrastructure. Work through the ❌ rows before making that claim about any environment.

**Before deploying the `JWT_SECRET_KEY` fix to any environment**: generate one (`openssl rand -hex 32`) and add it to that environment's `.env` first — the backend will fail to start otherwise, by design.
