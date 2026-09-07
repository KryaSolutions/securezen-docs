# Testing Guide: ff-2 branch fixes

Step-by-step verification for the 4 fixes on `ff-2` before merging. Assumes local backend (`uvicorn --reload`, port 5001) + frontend dev server running, logged in, browser DevTools open (Network + Console tabs).

## 1. Page flickering fix (`App.jsx`)

**What was broken:** clicking between pages (or the sidebar) could trigger a redundant URL navigation right after the real one, causing a visible flicker/re-render.

**Steps:**
1. Open DevTools Console, clear it.
2. Click through several sidebar items in quick succession: Dashboard → Alert Analysis → MITRE → Command Center → Dashboard.
3. Watch the page transitions — each should be a single clean switch, no double-flash or momentary flash of the previous page's content.
4. Use the browser's back/forward buttons a few times after navigating around. Same check: no flicker, no double-navigation.
5. **Pass criteria:** no visible flicker, and the URL in the address bar matches the page shown after every click (not one step behind or briefly wrong).

## 2. Server-side filters expansion (`CCRawLogs.jsx` / `raw_events.py`)

**What changed:** Command Center → Raw Logs now has 5 new server-side dropdown filters (Agent, Dst User, Rule Level, Verdict, Status) in addition to the existing Decoder/Event Type ones, plus a double-fetch-on-mount bug fix.

**Steps:**
1. Go to **Command Center → Raw Logs**.
2. Open the Network tab, filter by `raw-events`.
3. **Double-fetch check:** reload the page fresh. You should see exactly **one** `GET /api/alerts/raw-events?...` request fire (previously it may have fired twice on mount — this is the bug that got fixed). Also check `GET /api/alerts/raw-events/histogram` fires once.
4. In the filter bar, you should now see 7 dropdowns total: **Decoder, Event Type, Agent, Dst User, Rule Level, Verdict, Status**.
5. Pick a value in the **Agent** dropdown. Confirm:
   - A new `GET /api/alerts/raw-events?...&agent_name=...` request fires.
   - The table only shows rows matching that agent.
   - **Total Records** count updates to reflect the filtered count, not the full dataset.
6. Repeat for **Dst User**, **Rule Level**, **Verdict**, **Status** one at a time — each should add its own query param and correctly narrow the results.
7. Combine 2-3 filters at once (e.g. Agent + Status) — confirm the result set is the intersection, not just the last filter applied.
8. Clear all filters back to "ALL" — confirm the full dataset returns.
9. **Known overlap to be aware of:** the table's column headers for "Event Origin" and "User Name" still have the older per-column filter icon (▼) from a separate fix — that's now a redundant second way to filter the same two columns. Not broken, just double UI; flag it and I'll clean it up.

**Pass criteria:** each new dropdown correctly filters server-side (check the network request has the right param and the result count actually changes), only one request fires per page load, filters combine correctly.

## 3. Profile popup readability

**What changed:** the profile dropdown menu (top-right, click your avatar) had a background color (`--bg-panel`) that was hard to read against; changed to `--bg-card`.

**Steps:**
1. Click your user avatar/name in the top-right header to open the profile dropdown.
2. Check the dropdown background is now clearly distinguishable from the page behind it, with good contrast against the "Platform Settings" / "Switch another account" text.
3. Toggle light/dark theme (if available) and repeat — check both themes look right, since this is a CSS variable, not a hardcoded color.

**Pass criteria:** dropdown text is easily readable in both themes, no low-contrast text-on-background issue.

## 4. Fan-out / N+1 reduction

Three separate things bundled in this commit — test each:

### 4a. MITRE page — instant render + capped attribution requests

**What was broken:** the MITRE page blocked on an external API call (up to 10s) then a CDN fallback (up to 30s) before showing anything, and fired one APT-attribution request **per detected technique** (~100 concurrent requests).

**Steps:**
1. Open DevTools Network tab, throttle to "Slow 3G" (optional but makes the difference obvious) or just use normal speed.
2. Navigate to the **MITRE / Adversary Tactics** page.
3. **Instant render check:** the page should show technique data immediately (built-in dataset), not a blank loading state for several seconds. It may silently upgrade to live MITRE API/CDN data a moment later — you won't necessarily see this, it's a background swap.
4. **Capped attribution check:** in the Network tab, filter by whatever endpoint backs "APT attribution" (likely `apt-attribution` or similar). Count the requests fired — should be **at most 12**, not one per detected technique.

**Pass criteria:** page is interactive almost instantly, attribution requests capped at 12.

### 4b. Verdicts N+1 fix (`verdicts.py`)

**What was broken:** resolving `alert_id` for each AI verdict did one DB query per verdict (up to 200 sequential queries per request).

**Steps:**
1. Find wherever AI verdicts are listed in the UI (likely under Zen AI Dashboard or a verdicts panel — ask if unsure which page calls `GET /api/alerts/... verdicts` equivalent).
2. Open Network tab, load that page, find the request that returns the verdicts list.
3. Check the response time — should be fast (well under a second) even with up to 200 verdicts, not something that visibly hangs.
4. This is mostly a backend-internal fix — the visible signal is just "the verdicts list loads quickly," there's no separate UI toggle to test.

**Pass criteria:** verdicts list loads fast, no multi-second delay.

### 4c. Dashboard polling scoped to dashboard views only

**What was broken:** the 30-second auto-refresh interval fired on every page (including Alert Analysis, a record-list page), re-triggering a per-row `crewai/result` fetch fan-out every 30 seconds even when not looking at a dashboard.

**Steps:**
1. Go to **Alert Analysis** (the alert list page).
2. Open Network tab, clear it, then wait 35-40 seconds without touching anything.
3. **Pass criteria:** you should NOT see a burst of `GET /api/crewai/result/{id}` requests (one per visible row) appear automatically. The list should stay static until you manually refresh or change a filter.
4. Now go to the **Performance Dashboard** and repeat: wait 35-40 seconds.
5. **Pass criteria:** here, auto-refresh SHOULD still fire (dashboard stats update automatically every 30s) — this confirms polling is scoped to dashboard-like views (`dash`, `zen-ai-dashboard`, `command-center`), not removed entirely.

## Reporting back

For each of the 4 items, a quick "✅ works" or "❌ saw X instead" is enough — I'll dig into specifics for anything that fails.
