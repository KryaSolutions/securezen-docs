# SOC Insights Dashboard (AiSOC-Inspired)

## Why

Comparing SecureZen's dashboard against AiSOC's (a real, actively-maintained open-source AI SOC, verified by reading its actual backend code, not its marketing) surfaced a genuine gap: SecureZen has plenty of charts already (alert trends, MITRE radar, severity donuts) but lacks the **named operational KPI framing** — MTTD/MTTR/FP-rate as an explicit scorecard — that makes a SOC platform feel like it's tracking itself, not just displaying data.

Verified AiSOC's version is real (not decorative) before copying anything: read the actual `services/api/app/api/v1/endpoints/metrics.py` formulas, confirmed against their own `docs/audit/REALITY_REPORT.md` (which honestly flags several *other* AiSOC claims as overclaimed) that this specific metrics endpoint is real SQL, not mocked.

## Real-data audit before writing any formula

Queried SecureZen's actual local data before designing anything (this project's standing discipline — verify, don't assume):

| Field | Real data? |
|---|---|
| `sz_alerts.timestamp`, `.received_at` | Yes — 5131/5131 populated |
| `sz_alerts.triage_verdict`, `.confidence`, `.false_positive_chance`, `.triage_priority` | **No — empty on all 5131 rows in this sandbox** |
| `sz_alerts.severity`, `.rule_level` | Yes — well populated |
| `sz_alerts.assigned_analyst_id`, `.analyst_justification` | No — 0/5131, nobody's used analyst assignment here |
| `sz_crewai_tasks` (verdict, confidence_score, timestamps) | Yes, but thin — 10 rows total in this sandbox |
| `ai_call_log` (model, tokens, cost) | Yes — 106 real rows, fully usable now |

This changes the plan: several AiSOC formulas assume fields SecureZen doesn't actually populate yet. Rather than fake it, each metric below is defined against what's *actually* real, with the substitution documented — same transparency AiSOC's own team practices in their reality report.

## Metric definitions (SOC Performance Metrics tile)

- **MTTD** = `AVG(received_at - timestamp)` — real, well-covered field, means "how long between the event happening and SecureZen ingesting it."
- **MTTR** = `AVG(investigated_at - timestamp)` — **`investigated_at` is a new column**, since nothing currently timestamps when an alert left "Open" status. Set whenever an alert's status is updated away from Open (in `update_alert_status_generic`/`update_alert_status`). Will be NULL for all 5078 historical "Investigated" rows (they were closed before this column existed) and genuinely populate going forward — same honest-zero-then-fills-in precedent as UEBA's `acknowledged_at`.
- **MTTC** = same as MTTR, filtered to alerts where a joined `sz_crewai_tasks.verdict = 'TRUE POSITIVE'` exists — AiSOC does the identical thing (MTTC = MTTR filtered to true-positive disposition) because neither platform has a true "contained_at" concept.
- **False Positive Rate** = `count(sz_crewai_tasks.verdict='FALSE POSITIVE') / count(verdict IN ('FALSE POSITIVE','TRUE POSITIVE'))` — real CrewAI verdict data, thin locally but genuinely real.
- **Escalation Rate** = `count(severity='HIGH') / count(*)` in window — SecureZen has no escalation-decision log (AiSOC's `RemediationGateLog` equivalent doesn't exist here), so this substitutes the closest real signal (severity), documented as a proxy, not hidden as if it were a true escalation-workflow metric.
- **Analyst Overrides (7d)** = `count(assigned_analyst_id IS NOT NULL AND alert updated in window)` — real column, will show 0 until analysts actually get assigned to alerts (true today, not a bug).

## Agent Confidence Calibration

Buckets `sz_crewai_tasks.confidence_score` (0-100) into 5 bins, compares against `verdict = 'TRUE POSITIVE'` actual rate per bin — same shape as AiSOC's calibration chart. Sparse on this sandbox (10 rows) by definition of real data, not a bug in the query.

## Investigation Cost Telemetry

Reads directly from the existing `ai_call_log` table (already real, 106 rows, `model`/`total_tokens`/`cost_usd`) — no new backend needed, purely a new dashboard panel.

## Connected Sources

Revised from the original plan (grouping `sz_alerts` by provider/manager_name) after finding two real, structured source inventories already exist and are a better fit:

- `sz_connectors` (inbound/outbound integrations — Slack, Email/SMTP, Wazuh SIEM, etc.), exposed via `/api/connectors`.
- The Minion gRPC "sources" service (registered scan agents — host/os/active/`last_connected_at`), exposed via `/api/sources`.

Added `sz_connectors.last_sync` (new column, same smart-migration pattern as `investigated_at`) — set only when a connector's `/test` or `/sync-siem` call actually succeeds, never backfilled. Freshness (fresh/stale/dead/unknown) is computed from this real timestamp, or from the Minion agent's `last_connected_at`; a source with no timestamp ever reports "unknown," not a fake status.

**Found a real bug while wiring this up, before it could ship**: the Minion gRPC source service (`MINION_GRPC_HOST=192.168.217.114:50051`) is the *same unreachable host* (`192.168.217.114`) as the Minion DB that caused the original multi-minute dashboard hang (see `dashboard-performance-fix.md`) — and the existing `source_routes.py` `list_sources()` call has no timeout, so it would have reintroduced that exact bug the moment this widget polled it. Fixed by calling the gRPC stub with an explicit `timeout=3` plus an `asyncio.wait_for` backstop, run off the event loop via `asyncio.to_thread`, and degrading to an honest `"Minion agent service unreachable"` message instead of hanging or fabricating agent data. Verified live: the call now fails in ~4s (`DEADLINE_EXCEEDED`) instead of hanging.

New endpoint: `GET /api/connected-sources` (`backend/app/routers/connected_sources_routes.py`), merging both inventories into one response; new panel `ConnectedSourcesWidget.jsx`.

## Command Palette (Cmd+K)

Pure frontend, no new backend — built on the existing `PAGE_ACCESS_MAP` (`frontend/src/constants/pagePermissions.js`, already the single source of truth for page labels + permissions) rather than inventing a second nav list. Ctrl/Cmd+K opens `CommandPalette.jsx`; recent-pages history persisted to `localStorage`; quick actions (refresh dashboard, toggle theme, log out) call the same handlers already threaded through `App.jsx`.

## Live Feed

No WebSocket/SSE infrastructure exists anywhere in this codebase (confirmed by search), so this follows the same polling pattern already used by `NotificationBell.jsx` and `SOCInsightsPanel.jsx` rather than introducing new real-time infra. `LiveFeedPanel.jsx` polls the existing `GET /api/alerts?page_size=10&sort_by=timestamp&sort_dir=desc` every 8s, diffs by alert id to animate new entries, and shows an honest "No recent alerts" empty state — not AiSOC's synthetic demo-events fallback.

## Rollout

- [x] **Phases 1-3 — SOC Performance Metrics, Confidence Calibration, Cost Telemetry.** Shipped together as one `SOCInsightsPanel.jsx` on the main dashboard (`backend/app/routers/soc_insights_routes.py`, 3 endpoints).

  **Real data audit found what was actually populated** before writing formulas (see table above) - `sz_alerts.triage_verdict`/`.confidence`/`.false_positive_chance` are empty on all 5131 rows in this sandbox; real verdict/confidence data instead lives in `sz_crewai_tasks` (thin here - 10 rows - but genuinely real, not fake). Formulas built around what's actually there, not an idealized schema.

  Added `sz_alerts.investigated_at` (new column, both in `init.sql` for fresh installs and in `main.py`'s existing smart-migration list for already-running databases) - set once, the first time an alert's status leaves "Open", via the two real status-change endpoints (`update_alert_status_generic`, `update_alert_status`) using `COALESCE(investigated_at, NOW())` so re-opening/re-closing doesn't reset the clock. NULL for all 5078 pre-existing "Investigated" rows (honest - they closed before this existed), populates going forward.

  **3 real bugs found and fixed while wiring the async queries**, all through live testing against the running backend, not caught by static analysis:
  1. Passing a Python `timedelta` as a bound SQLAlchemy/asyncpg parameter against `NOW() - :param` failed outright (`UndefinedFunctionError: timestamp with time zone >= interval`) - asyncpg doesn't coerce it. Fixed by switching to `NOW() - make_interval(days => :days)` with a plain int parameter.
  2. A literal `%` in bucket labels (`'0-20%'`) collided with psycopg2's `%s`-style parameter substitution (`IndexError: tuple index out of range` - a non-obvious symptom for what was actually an unescaped-`%` bug). Fixed by doubling to `%%` in the raw SQL string.
  3. `ai_call_log.called_at` is stored as `TEXT` in ISO-8601 format (`2026-08-12T06:46:04...`) - a naive `::text` comparison against `NOW()`'s different string format would have silently returned wrong results. Fixed by casting `called_at::timestamp` for the comparison instead.

  Verified live end-to-end: real MTTD (0.04h) and FP rate (88.9%, matching the known 8-false-positive/1-true-positive `sz_crewai_tasks` distribution exactly) on first load; manually closed a real alert via the actual status-change endpoint and confirmed `investigated_at` populated and MTTR immediately reflected it (774.5h, correct for a deliberately-aged test alert), then reverted the test alert back to Open/NULL. Confidence calibration buckets matched the known real verdict/confidence-score distribution exactly (8 items in the 20-40% bucket at 0% actual TP rate, 1 item in 80-100% at 100% actual TP rate). Cost telemetry showed the real 106-call, $0.0235 ledger immediately, no new instrumentation needed. All 3 endpoints and the new frontend panel confirmed compiling through Vite's real transform pipeline.

  Also found, incidentally, a real pre-existing bug unrelated to this work: `update_alert_status` returns `{"status": "success"}` even when the tenant-scoped WHERE clause matches zero rows (wrong-tenant token), instead of checking `result.rowcount`. Not fixed here - out of scope for this feature, noted for later.

- [x] **Phase 4 — Connected Sources widget.** New `sz_connectors.last_sync` column + `GET /api/connected-sources` merging connectors and Minion agents, `ConnectedSourcesWidget.jsx`. Caught and fixed a real bug before shipping: the Minion gRPC source call had no timeout and hit the same unreachable host that caused the original dashboard hang — now bounded to ~4s with a graceful fallback (see Connected Sources section above).

- [x] **Phase 5 — Command Palette (Cmd+K).** `CommandPalette.jsx`, built off the existing `PAGE_ACCESS_MAP`/permission model, mounted globally in `App.jsx`. No new backend.

- [x] **Phase 6 — Live Feed panel.** `LiveFeedPanel.jsx`, polls the existing alerts endpoint every 8s (no WebSocket infra exists in this codebase), honest empty state instead of fake demo events.

All three verified: backend image rebuilt and container recreated (this project's backend bakes `app/` into the Docker image at build time — `docker compose restart` alone does *not* pick up code changes, only `docker compose build` + `up -d` does), new `/api/connected-sources` route confirmed reachable and fast, the gRPC timeout fix confirmed live inside the running container, and all new/changed frontend files confirmed compiling through both a direct esbuild transform and a full `npm run build` production build with zero errors. UI click-through in an actual browser was not performed in this session — only compile/runtime verification.

Each phase verified against real running backend before being marked done, same discipline as every other feature in this project.
