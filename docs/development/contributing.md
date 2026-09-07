# Contributing

## Branch & commit conventions

- Never work directly on `main`. Create a feature/fix branch per change.
- If you find uncommitted work on a branch that isn't yours, stop — don't touch it, don't stash with `-u` (sweeps up untracked files too). Ask whose it is.
- Before any destructive git operation, run `git status` and `git branch --show-current` first.
- Commit messages in this repo lean toward `type(scope): what and why` (e.g. `fix(ml-worker): classify newest events first...`) — match that style rather than inventing a new convention.

## Code conventions

- Backend: PostgreSQL only, via `backend/app/database/session.py`'s async session — never add a new `sqlite3` call site.
- Never call `load_dotenv(path, override=True)` — see `docs/development/guide.md` for why this specific mistake has caused real production incidents more than once.
- New endpoints: add to the relevant router package (`routers/alerts/`, `routers/intelligence/`), splitting into a new file only once the existing one gets unwieldy — don't split prematurely.
- Frontend: match the existing `features/<domain>/<Page>.jsx` convention; there's no shared API client module, follow whatever pattern the nearest existing feature uses.

## Before opening a PR

- Update the relevant doc in the same change, not as a follow-up — this whole doc set drifted for months because "update the docs later" never happened. See `docs/about/project.md`.
- If you touched anything in `docs/ai-soc/reliability-log.md`'s subject area (a real bug, a real incident), add an entry there — that log is the project's actual institutional memory, more so than any design doc.
