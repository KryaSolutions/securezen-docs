# Development Guide

## Backend structure

Routes live under `backend/app/routers/`, split into packages once a single file gets unwieldy — `alerts/{core,detail_ai,raw_events,verdicts}.py` and `intelligence/*.py` are both post-split packages, not single files. If you're adding a new endpoint to an area that's still a flat file, adding it there is fine; splitting is a "file got too big" trigger, not a rule to apply upfront.

The live classification pipeline (`backend/app/ml_utils/ml_worker_daemon.py`) is a standalone daemon process (its own container, `ml-worker`), not something invoked from a request handler — it polls the database in a loop. Don't confuse it with `backend/app/core/sensors/orchestrator.py` and `backend/app/core/triage/rule_engine.py`, which are a separate, older batch-classification path.

Database access is exclusively PostgreSQL via `backend/app/database/session.py`'s async `get_db_session()` dependency (SQLAlchemy + asyncpg). Any `sqlite3` import you see elsewhere in the tree is dead code from before the Postgres migration — don't extend it, and feel free to flag it for removal if you're already touching that file.

## Frontend structure

`frontend/src/` is feature-folder organized: `features/{alerts,intelligence,reports,copilot,system,email,administration,dashboard,common}/`, each holding the pages/components for that domain. There's no shared `api/` client directory — check an existing feature folder for the current pattern for calling the backend before inventing a new one.

Tooling is Bun, not npm: `bun install`, `bun x vite` (dev), `bun x vite build`, `bun x eslint .`.

## The `load_dotenv(override=True)` trap

This has caused a real, hard-to-diagnose production bug more than once in this codebase: any module that calls `load_dotenv(some_path, override=True)` at import time will silently overwrite already-correct environment variables (like the Postgres host Docker set) with whatever's in a stale local `.env` file — and because Python executes a package's `__init__.py` on any import from that package, this can trigger from a completely unrelated import several files away. If a module needs to load its own `.env`, never pass `override=True` unless you have a specific, deliberate reason and have checked what else imports that module.

## Local dev loop

```bash
docker compose up -d --build          # full stack
docker compose logs -f ml-worker      # watch the live classification pipeline
docker compose up -d --force-recreate backend   # after a healthcheck-only change (plain `up -d` can no-op)
```

For frontend-only iteration, run Bun/Vite directly against a running backend rather than rebuilding the frontend container each time.

## Git conventions

- Never work directly on `main`. Create a feature/fix branch.
- Before any destructive git operation (`reset --hard`, `checkout .`, force-push), run `git status` and `git branch --show-current` — confirm you're on the branch you think you're on and that nothing uncommitted (yours or a colleague's) is about to be discarded.
- If you discover uncommitted work on a branch that isn't yours mid-task, stop and ask — don't touch it, don't stash with `-u` (which can sweep up untracked files you didn't mean to touch).
