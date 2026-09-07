# Data Flow

Expands the ASCII diagram in `docs/architecture/overview.md` §2 into a step-by-step walkthrough of one event's life.

1. **A real log line arrives** — via `POST /api/ingest/webhook`, `/manual`, or `/raw-siem` (`backend/app/routers/ingestion_routes.py`), and lands as a row in the shared `events` table (Minion DB).
2. **`ml_worker_daemon.py` picks it up** — polls `events` newest-first, `FOR UPDATE OF e SKIP LOCKED` so multiple replicas can poll safely without double-processing.
3. **The ML anomaly filter scores it** — Isolation Forest's `.update()` then `.score()`, purely from the event's own features, no external label needed.
4. **Rule overrides run regardless of the ML score** — signature match, repeat-login count in 24h. Either the ML filter flagging it OR a rule firing is enough to proceed; if neither, the event is dropped — no verdict row is ever written for it.
5. **Local LLM (LogEM) takes a first pass** — if it's confidently LOW, that's trusted and used directly.
6. **Otherwise, external LLM (Groq) decides severity** — rule overrides are checked again here, escalate-only, never downgrading what the LLM already decided.
7. **The verdict is written with full denormalized context** — srcip, dstip, country, device, hostname, rule description copied directly onto the `verdicts` row, so nothing downstream needs to join back to `events`.
8. **`classifier_lab/src/pg_sync.py` syncs it into `sz_alerts`** — the table the dashboard actually reads.
9. **The dashboard shows it** — React frontend, polling/reading from the backend API.
10. **Optionally, a human or an auto-trigger kicks off deeper forensics** — the CrewAI investigation pipeline (`backend/app/investigation/`), independent of the steps above.

Every arrow above is a real, currently-running code path — none of it is aspirational. If a future change breaks one of these hops, this is the list to check step by step to find where it broke.
