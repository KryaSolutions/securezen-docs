# Fix Client-Side-Only Search Across 4 Pages

## Why this exists

Confirmed via direct investigation: 4 pages in SecureZen have a search box that only filters whatever
page of data is already loaded in the browser (150-200 rows), not the full dataset (24,000+ events in
some cases). Searching for a real alert ID that exists but isn't on the currently-loaded page finds
nothing — even though the data is genuinely there. None of the 4 backend endpoints already have a
usable search parameter sitting unused; each needs new backend query logic, not just frontend wiring.

**Scope:** 4 backend endpoints + 4 frontend pages, 8 tasks total. Do them in order — backend for an area
before its frontend, so each frontend change has something real to call. Give each task to Antigravity
one at a time, same process as before.

| # | Area | Backend endpoint | Frontend page |
|---|---|---|---|
| 1-2 | Raw events (shared) | `get_raw_events`, `alert_routes.py` | `CCCorrelatedAlerts.jsx` + `CCRawLogs.jsx` |
| 3-4 | Main Alerts | `get_alerts_endpoint`, `alert_routes.py:64` | `AlertAnalysis.jsx` |
| 5-6 | AI Verdicts | `list_pg_verdicts`, `pg_verdicts_routes.py:44` | `AIVerdictsPage.jsx` |
| 7-8 | Audit Logs | `get_audit_logs`, `audit_routes.py:13` | `AuditLogViewer.jsx` |

---

## Task 1 — Backend: add search to `get_raw_events`

**File:** `backend/app/routers/alert_routes.py`, function `get_raw_events` (~line 730+).

**Important — don't confuse two different things already in this function:** there's already a
`search_pattern`/ILIKE filter on `agent_name`/`hostname`/`devname`/`profile`/`full_log`, but it's built
from a **hardcoded tenant-name lookup** (`tenant_search_map`) for multi-tenant scoping — it has nothing
to do with user search input. Do not remove or repurpose it. Add a **new, separate** `search` query
parameter alongside it.

**Required behavior:**
1. Add `search: str = None` to the function signature (query param, same style as existing `page`/
   `page_size`/`target_tenant`).
2. If `search` is provided: if it's numeric (`search.isdigit()`), add a filter for
   `PGEvent.id == int(search)` (exact alert ID lookup — this is the case that's been failing). If not
   numeric, add an `ilike` filter across the same text fields already used for tenant scoping
   (`full_log`, `hostname`, `devname`, `agent_name`) using `or_(...)`, combined with `AND` against the
   existing tenant-scoping filter (don't let a user search bypass tenant isolation).
3. Keep pagination (`page`/`page_size`) working as-is on top of the search filter — search should
   still return a paginated result, not dump everything at once.

**Verify:** call the endpoint directly with `?search=230854` (or whatever a currently-buried alert ID is)
and confirm it returns that exact event regardless of its position in the full unsearched ordering.

---

## Task 2 — Frontend: wire search into `CCCorrelatedAlerts.jsx` and `CCRawLogs.jsx`

**Files:** `frontend/src/components/CCCorrelatedAlerts.jsx` (search state ~line 455,
`filteredAlerts` client-side filter ~line 208-238) and `frontend/src/components/CCRawLogs.jsx`
(same pattern, its own `filteredData` useMemo ~line 188-233).

**Required behavior:**
1. When the user types in the search box, instead of (or in addition to) filtering the already-loaded
   `alerts`/`filteredData` array, call `fetchData`/the raw-events fetch function with the new `search`
   query param from Task 1. Debounce this (e.g. 300-400ms after the user stops typing) so it doesn't
   fire a request per keystroke.
2. Keep the existing client-side filtering as a fallback/refinement on top of the server response if you
   want instant feedback while the debounced request is in flight — but the actual "can I find alert
   230854" case must go through the backend call, not rely on what's already loaded.
3. Do this for both files — they share the same backend endpoint and the same broken pattern.

**Verify:** in the browser, type a real alert ID that is *not* on the currently-loaded page/table and
confirm it now appears after the debounce fires.

---

## Task 3 — Backend: add search to `get_alerts_endpoint`

**File:** `backend/app/routers/alert_routes.py`, function `get_alerts_endpoint` (~line 64-107). This
is the backend for the main **Alerts** page — arguably the most important of the 4, since it's the
primary alert-review surface.

**Required behavior:**
1. Add `search: str = None` to the function signature, alongside the existing `severity`/`src_ip`/
   `status` params.
2. If `search` is numeric, filter `Alert.id == int(search)`. If not numeric, `ilike` across relevant
   text fields already present on the `Alert` model (check `backend/app/database/models.py`'s `Alert`
   class for the right columns — likely `rule_description`, `agent_name`, `srcip`/`src_ip`/`dstip`).
   Apply this as an additional `.where(...)` on both `stmt` and `count_stmt` (both need it, same as the
   existing `severity`/`src_ip`/`status` filters do — don't forget `count_stmt`, or pagination totals
   will be wrong).
3. Keep existing tenant scoping and other filters composable with the new search filter (`AND`, not
   replacing them).

**Verify:** call with `?search=<a real alert id>` and confirm it returns the correct row, and that the
`total` count in the response also reflects the filtered count, not the unfiltered one.

---

## Task 4 — Frontend: wire search into `AlertAnalysis.jsx`

**File:** `frontend/src/features/alerts/AlertAnalysis.jsx` (or wherever the main Alerts page search
input actually lives — confirm the exact file/component first if the path differs).

**Required behavior:** same pattern as Task 2 — debounced call to the backend with the new `search`
param from Task 3, instead of only filtering `combinedAlerts` (the current in-memory array, which is
only the current page plus up to 200 CLOSED + 200 ESCALATED alerts, not the full dataset).

**Verify:** search for an alert ID known to be outside the currently-loaded set and confirm it's found.

---

## Task 5 — Backend: add search to `list_pg_verdicts`

**File:** `backend/app/routers/pg_verdicts_routes.py`, function `list_pg_verdicts` (~line 44+). This
one currently has no filtering at all beyond `limit`/`offset`.

**Required behavior:**
1. Add `search: str = None` (or `event_id: int = None` if you want a more explicit param name — pick
   one, don't add both) to the function signature.
2. If numeric, filter `Verdict.event_id == int(search)`. If not numeric, consider filtering on
   `Verdict.reason` or `Event` fields via the existing join (check what text fields would be useful to
   search here given this page shows AI verdicts specifically — reason/rationale text is probably the
   most useful non-numeric search target).
3. Apply the filter before `.offset(offset).limit(limit)`.

**Verify:** call with `?search=<event id>` and confirm the specific verdict is returned.

---

## Task 6 — Frontend: wire search into `AIVerdictsPage.jsx`

**File:** `frontend/src/features/intelligence/AIVerdictsPage.jsx`.

**Required behavior:** same debounced-call pattern as Task 2, replacing the current `.filter()` over the
`verdicts` array (currently capped at 200 rows via `limit=200`) with a call to `/api/pg-verdicts` using
the new `search` param from Task 5.

**Verify:** search for a verdict/event ID outside the current 200-row window and confirm it's found.

---

## Task 7 — Backend: add search to `get_audit_logs`

**File:** `backend/app/routers/audit_routes.py`, function `get_audit_logs` (~line 13-43).

**Important — this one builds its SQL as a string.** The existing `action` filter is already done
safely with a bound parameter (`:action`) — follow that exact same pattern for the new search param.
**Do not concatenate user input directly into the SQL string** — that would be a SQL injection
vulnerability. Use a bound parameter the same way `action` already does.

**Required behavior:**
1. Add `search: Optional[str] = None` to the function signature.
2. If provided, add `AND (details ILIKE :search OR action ILIKE :search OR user_email ILIKE :search)`
   (check `sz_audit_logs`'s actual columns first — adjust field names to match what really exists in
   that table) to the query string, with `params["search"] = f"%{search}%"` — same bound-parameter style
   already used for `action`.

**Verify:** call with `?search=<a term known to exist in an old audit log entry beyond the default 50-row
window>` and confirm it's found.

---

## Task 8 — Frontend: wire search into `AuditLogViewer.jsx`

**File:** `frontend/src/features/administration/AuditLogViewer.jsx`.

**Required behavior:** same debounced-call pattern as Task 2, calling `/api/audit/logs` with the new
`search` param from Task 7 instead of only filtering the currently-loaded 50 rows.

**Verify:** search for a log entry known to be outside the current 50-row window and confirm it's found.

---

## After all 8 tasks

Test each of the 4 pages by searching for something you know exists but is *not* on whatever page is
currently loaded — that's the actual failure mode being fixed. A search that only ever finds things
already visible on screen hasn't been fixed, even if it doesn't error.
