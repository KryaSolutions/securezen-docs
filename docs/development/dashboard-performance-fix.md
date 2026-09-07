# Dashboard "Endless Loading" Fix

## Why

User-reported bug, ~4 weeks old, happening on both the local dev setup and the real 198 server: the main dashboard shows a permanent loading spinner and never displays data. Initially suspected CORS (which was a real, separate bug fixed first - `SECUREZEN_HOST` in `.env` only allowed one origin, blocking a local Vite dev frontend entirely), but the user confirmed the loading issue happens on 198 too, where CORS already works - meaning it was a real backend problem, not CORS.

## Investigation

Timed the actual `/api/dashboard-metrics` request against real local data (5,131 alerts): **2 minutes 20 seconds** for a single page load. Two distinct, compounding problems found:

### 1. The dominant cause: an unreachable external DB with no connect timeout

The dashboard's "Events Analyzed" stat queries a separate "Minion DB" (`classifier_lab/src/models.py`, shared by `connector_routes.py`, `ingestion_routes.py`, `ml_worker_daemon.py`, `raw_events.py`, `api_poller_daemon.py`, and more - one module-level SQLAlchemy engine, used everywhere). `.env` points `MINION_DB_URL` at `192.168.217.114:5469`, which is unreachable from this environment. The engine (`create_engine(DATABASE_URL, echo=False, pool_pre_ping=True)`) had **no `connect_timeout`** - psycopg2's TCP connect then hangs for the OS-level default (observed: 2+ minutes) before failing. The existing code already wrapped this in try/except and degraded gracefully to `total_lines=0` - the only actual bug was that "failure" took over two minutes to arrive.

**Fix**: added `connect_args={"connect_timeout": 5}` to the engine. Verified: cold request dropped from 2m20s to 6.3s.

**Also added a circuit breaker** (`dashboard_routes.py`): the dashboard reloads constantly (auto-refresh every 30s, every page navigation), so paying a 5s tax on *every single load* while the Minion DB is down is still a bad, avoidable UX cost. A module-level `_minion_db_last_failure` timestamp now skips the connection attempt entirely for 30s after a failure, returning the same graceful `total_lines=0` fallback instantly. Verified live: request 1 (cold) = 5.5s, request 2 (immediately after) = 29ms, request 3 = 31ms.

This fix benefits every other caller of `get_session()` too (ingestion, connectors, ml_worker_daemon, raw_events, api_poller, realtime_simulator), not just the dashboard - all of them were sharing this same un-timed-out engine.

**Open question, can't verify from here**: whether 198's real network can actually reach `192.168.217.114:5469`. If it can, this Minion DB feature works fine there and this fix is just a safety net. If it can't (matching the "happens on 198 too" report), this fix directly resolves the production symptom. Either way the fix is strictly beneficial - it doesn't change behavior when the Minion DB is reachable, only bounds the failure case.

### 2. Secondary cause: several dashboard sub-queries fetched every matching row into Python just to count them

Found via code reading, not guessing - `async_dashboard_service.py`:

- `get_alerts_age_matrix` - fetched **every alert the tenant ever had** (no time filter applied at all, despite accepting a `time_range` parameter - a real, separate bug now also fixed), then bucketed by age in a Python loop matching status substrings.
- `get_alert_funnel` - fetched every alert's severity into Python **twice** (current + previous period) just to count them.
- `get_alert_trends` - fetched every matching row's date+severity, bucketed by day in a Python loop.
- `get_response_time_stats` - computed the exact same `AVG(...)` expression **3 times** (mtti/mtta/mttr are just that one average divided by 3 different constants), plus **7 sequential day-by-day queries** for the sparkline.

All four rewritten to do the aggregation/grouping in SQL (`GROUP BY`, `SUM(CASE WHEN...)`) instead of Python loops over full row sets - same output shape, verified against real data (radar_stats/funnel numbers cross-checked for internal consistency: prioritized + reprioritized == investigated, etc.).

**Also parallelized independent queries within a function** where safe: `get_alert_funnel`'s curr/prev, `get_radar_stats`'s 5 domain counts, and `get_response_time_stats`'s 3 independent pieces now run via `asyncio.gather` instead of one after another. **Verified this doesn't corrupt results despite sharing one `AsyncSession`** (a documented SQLAlchemy caveat) by running the same request 3 times and confirming `radar_stats` returned 5 genuinely distinct, correct-looking counts each time, and funnel arithmetic (`prioritized + reprioritized == investigated`) held exactly. Did **not** attempt to parallelize the outer ~18-call chain in `dashboard_routes.py` itself (the single biggest theoretical win) - same shared-session risk, and the connect-timeout + SQL-aggregate fixes already address the actual reported symptom; flagged as a possible follow-up, not done blind.

## Real bug fixed as a side effect

`get_alerts_age_matrix` never applied the `time_range` filter - the "age matrix" chart always showed all-time data regardless of what date range the user had selected on the dashboard. Fixed as part of the rewrite.

## Verification

- Timed real request before/after: 2m20s -> 6.3s (cold) -> 29-31ms (warm, circuit breaker).
- Confirmed no concurrency errors in logs across multiple `asyncio.gather` runs.
- Confirmed `radar_stats`/`alert_funnel`/`alert_trends` output shapes and values match what the original Python-loop logic would have produced, cross-checked against real data.
- Confirmed the CORS fix (separate, earlier issue) and this fix are independent - CORS blocked *all* requests including login; this fix only affects how long one specific endpoint takes once a request actually reaches the backend.

## Follow-up: removing fake/decorative dashboard elements

While auditing the dashboard for the performance fix, found several UI elements that looked like real trend/analytics data but were fabricated:

- **Case Management row** ("Cases Opened", "Cases Closed", "Escalated Alerts"): each card showed a "↗ X% / Previous 30 days (N)" trend line and a sparkline chart. The backend always returned `*_change: 0` and a `*_sparkline` array that was six zeros followed by the current total (`[0,0,0,0,0,0,N]`) - a mathematically-guaranteed flat line with one uptick, not a real trend. Removed both the backend fields and the frontend trend/sparkline JSX; the cards now show only the real counts.
- **Case Closure Reasons row** (True/False/Benign Positives): each card had a hardcoded ternary trend (`"100%"`, `"20%"`, `"11%"` respectively, picked arbitrarily) plus a "Previous 30 days" number computed by dividing the current count by an arbitrary constant (`/2`, `*0.8`, `*0.9`). Removed - no real prior-period data exists to compare against.
- **`mtti`/`mtta`/`mttr` computation** in `get_response_time_stats`: grep confirmed the frontend never rendered these fields anywhere. Removed the dead computation entirely; the function now only returns `closure_reasons`.
- **"Incident Age Matrix"** duplicated the exact same `alertsAgeData` array already shown by "Alerts Age Matrix" just above it - the code's own comment called it a "proxy" for that data. Removed, kept the original grid version.
- **"Critical Risk Assets"** duplicated the same `topAssets` array as the "Top Assets" table (top 5 vs top 7, plus one extra Score column). Removed, kept "Top Assets".
- **Not removed, on purpose**: "AI Intelligence" and "Neural Remedies" look like a similar pair but pull from two genuinely different arrays (`aiInsights` = descriptive threat text, `aiFixes` = remediation actions) - kept both.
- **`stats.new_today`** (rendered as "↑ N new today"): computed backend-side as `real_counts["open"] // 10`, which has no relation to "today". Removed the field and the frontend line that rendered it.
- **`mttr`/`avg_mttr`** in the main `/api/dashboard-metrics` response (`dashboard_routes.py`): hardcoded to `0.0` (the `mttr_val` variable was initialized and never reassigned) and never read by the frontend. Removed the fields and the dead `mttr_val` variable. Not to be confused with the real MTTR metric served separately by `soc_insights_routes.py`, which is left untouched.
