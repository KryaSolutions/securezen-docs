# Security Configuration Guide

Practical steps when setting up a new environment — see `baseline.md` for what's already true, `hardening.md` for what's still missing.

1. **Set `JWT_SECRET_KEY` explicitly** in `.env`. `backend/app/utils/auth.py` falls back to a hardcoded default if it's unset — fine for a disposable local dev box, never acceptable anywhere else. Use a different value per environment.
2. **Don't reuse the demo/production server's `.env` values anywhere else** — if a key needs rotating, rotate it everywhere it was copied to, not just the one place the leak was found.
3. **Restrict `LOGEM_MODEL_PATH` to the dedicated test/candidate server only** — this is a capacity/availability control as much as a security one (`docs/deployment/environments.md`), but the effect (an unresponsive login endpoint) is a real availability incident either way.
4. **Before exposing any environment beyond internal/demo use**: tighten CORS (currently a wide-open regex), add rate limiting (currently none), and complete the checklist in `docs/deployment/production.md`.
5. **If you ever find a real credential in a doc, script, or commit**: don't just delete the file. Flag it for rotation immediately — deleting the file does not invalidate a credential already in git history. See `incident-response.md` for how this played out the one time it happened here.
