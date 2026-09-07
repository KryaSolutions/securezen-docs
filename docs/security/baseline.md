# Security Baseline

The current, verified-against-code security posture. For what's *wrong* with it, see `hardening.md`; for the exposed-credential incident, see `incident-response.md`.

- **Auth**: JWT (HS256), 24h expiry, issued by `POST /api/auth/login`. Roles: `ROLE_ADMIN`, `ROLE_DEMO`, `ROLE_VIEWER`.
- **First-user bootstrap**: the first user ever registered becomes `ROLE_ADMIN` automatically; everyone after defaults to `ROLE_DEMO`.
- **Write protection**: `ROLE_VIEWER` is explicitly blocked from write endpoints (`verify_write_permission()` in `backend/app/utils/auth.py`).
- **Multi-tenancy**: scoped via the `tenant` JWT claim; an admin can override via `X-Tenant-ID`.
- **Automated response safety check**: `response_engine.py`'s `block_ip()` refuses to block private/internal IP ranges before ever touching `iptables`/Windows Firewall — a false-positive verdict on an internal address can't take down internal infrastructure.
- **Rule-override auditability**: escalate-only design means the deterministic rule layer can never be used to silently suppress an AI-flagged threat.

This is the baseline as it verifiably exists in code today — not a target state.
