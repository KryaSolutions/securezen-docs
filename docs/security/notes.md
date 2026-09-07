# Security Notes

## Auth model

JWT (HS256), issued by `POST /api/auth/login`, 24h expiry, implemented entirely in `backend/app/utils/auth.py`. Real roles: `ROLE_ADMIN`, `ROLE_DEMO`, `ROLE_VIEWER`. First-ever registered user becomes `ROLE_ADMIN` automatically; everyone after defaults to `ROLE_DEMO`. `ROLE_VIEWER` is explicitly blocked from write endpoints. Multi-tenant scoping comes from the `tenant` JWT claim; an admin can override it via `X-Tenant-ID`.

Full endpoint-level detail: `docs/api/reference.md`.

## Known hardening gaps — fix before this is internet-facing beyond controlled demo use

- **`JWT_SECRET_KEY` is not set in the current `.env`.** `backend/app/utils/auth.py` falls back to a hardcoded default string if it's unset. Acceptable for a throwaway local dev box; not acceptable anywhere else. Set it explicitly, and rotate it per-environment.
- **CORS is wide open**: `backend/app/main.py` uses `allow_origin_regex="https?://.*"` — that matches literally any origin, not an allowlist. Fine for active development across shifting server IPs; needs tightening to actual known frontend origins before this is exposed beyond internal use.
- **No rate limiting** on auth or any other endpoint currently exists in the codebase (checked — no rate-limit middleware found).

## Response engine's IP-blocking safety check

`backend/app/ml_utils/response_engine.py`'s `block_ip()` explicitly refuses to block private/internal IP ranges (`10.*`, `192.168.*`, `172.16-31.*`, `127.*`, `0.0.0.0`) before ever calling `iptables`/Windows Firewall — this exists specifically so a false-positive verdict on an internal address can't take down internal infrastructure. Don't remove or weaken this check without a very deliberate reason.

## Credential exposure incident (resolved by deletion, rotation still owed)

A now-deleted doc (`backend/docs/claude.md`) contained a plaintext, live-looking Groq API key and an admin password, checked into git history. The file itself has been removed as part of the docs cleanup, but **removing the file does not invalidate the credentials** — they're still recoverable from git history if anyone has access to it. Rotating the exposed Groq API key and admin password is an outstanding action item for whoever owns those credentials; this doc rewrite can't do that part.

## Response override design (relevant to auditability, not just accuracy)

Rule-based severity overrides in `ml_worker_daemon.py` (signature match, repeat-login count) are deliberately escalate-only — they can raise a verdict's severity but never lower one already set by the AI classifiers. This is a security-review-relevant property: it means the deterministic rule layer can't be used to accidentally (or maliciously) suppress a real AI-flagged threat.
