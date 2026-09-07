# UEBA (User & Entity Behavior Analytics) Plan

## Why

SecureZen currently only reacts to signature/rule-based alerts (Wazuh, FortiGate) — something has to already look like a known-bad pattern to get flagged. There's no concept of "is this normal for this specific user or device." UEBA fills that gap: build a behavioral baseline per user/host from data we already have, then flag deviations from it — catching things a signature never would (a normal admin account suddenly logging in from a new country at 3am, a laptop suddenly moving 10x its usual data volume).

## Where the design comes from

Two references were evaluated (see conversation history for the full comparison):

- **[OpenUBA](https://github.com/GACWR/OpenUBA)** (open-source, Kubernetes-native UEBA framework) — its actual risk-scoring code (`core/risk.py`, `core/riskmanager.py`, `core/rule.py`) is empty stubs; its "7 installed models" are one blank template per ML framework (sklearn/pytorch/tensorflow/keras/networkx), not real trained detectors. **Not usable as code** — the repo (backend + Kubernetes + Elasticsearch + Spark + Next.js/GraphQL frontend) is the wrong shape for SecureZen entirely. But its **UI layout and conceptual model are the blueprint for this plan**: a dashboard with a Risk-Over-Time chart, an anomaly-severity breakdown, a cases-by-severity chart, and stat tiles (Monitored Users, High Risk Users, Total Models/Rules), backed by a concept of Entities + Rules + pluggable Models + a Risk Score.
- **Seceon** (commercial AI SOC product, live demo reviewed) — has a working, structured UEBA module split into User Behavior Analytics and Host Behavior Analytics. Its **UI structure is not being copied**, but three signal ideas from it are folded into this plan: **email behavior anomalies** (unusual send/receive volume, unusual sender counts), **host-level network behavior** (unusual incoming/outgoing bytes, connection count/duration), and a **normalized 0-100 "risk %"** framing.

Net result: OpenUBA's dashboard shape + full entity/rule/model concept, actually finished and built natively in SecureZen's own FastAPI/Postgres/React stack, enriched with Seceon's signal ideas. No forked code, no new infrastructure (no Kubernetes, Spark, or Elasticsearch — everything runs against the Postgres we already have).

## Core concept

- **Entity** — a `User` (identified via `sz_alerts.dstuser`) or a `Host` (identified via `sz_assets` / `sz_alerts.agent_name`/`agent_ip`, now populated with real data via the Sophos sync).
- **Signals** — behavioral features computed per entity per day: login count, failed-login count, distinct source IPs/countries, off-hours activity ratio, alert count, high-severity alert count, (later) email send/receive volume, (later) network byte/connection volume for hosts.
- **Rules** — simple, explainable, deterministic checks (e.g. "5+ failed logins in 10 minutes," "first-ever login from a new country," "access to a Critical-severity-tagged asset outside business hours"). These work from day one with zero historical data — this is what OpenUBA's `core/rule.py` was supposed to be but never became.
- **Model** — an Isolation Forest (unsupervised anomaly detection, scikit-learn) trained per entity type on the accumulated daily signal vectors, flagging statistically unusual days once enough history exists (needs some baseline period — rules cover the cold-start gap).
- **Risk score** — rule hits + model anomaly score blended and rescaled to a 0-100 "Standardized Risk %" (naming borrowed from Seceon), bucketed into Low/Medium/High/Critical.

## Data already available (no new ingestion needed to start)

| Signal | Source |
|---|---|
| Login/auth events, failed logins, source IP/country | `sz_alerts` (`dstuser`, `srcip`, `src_country`, `event_type`, `severity`, `timestamp`) |
| Host identity, owner, OS, live status | `sz_assets` + `sz_asset_ip_history` (Sophos-synced) |
| Alert volume/severity per entity | `sz_alerts` joined by `dstuser`/`agent_name`/`agent_ip` |
| Email send/receive behavior (Phase 5, optional) | `email_analysis` table (`email_routes.py`) |

## New schema

```sql
sz_ueba_entities       (id, entity_type ['user'|'host'], entity_key, display_name, tenant, first_seen, last_seen)
sz_ueba_daily_signals  (entity_id, date, login_count, failed_login_count, distinct_ips,
                        distinct_countries, off_hours_ratio, alert_count, high_sev_alert_count, ...)
sz_ueba_risk_scores    (entity_id, date, rule_score, model_score, risk_pct, risk_level,
                        contributing_rules JSON)
sz_ueba_rules          (id, name, description, enabled, severity_weight)
```

## Backend components

- `backend/app/services/ueba/signal_builder.py` — aggregates `sz_alerts`/`sz_assets` into daily per-entity signal rows.
- `backend/app/services/ueba/rule_engine.py` — evaluates the static rule catalog against each entity's latest signals.
- `backend/app/services/ueba/risk_engine.py` — Isolation Forest per entity type (once enough history exists) + blends with rule score into the final risk %.
- `backend/app/services/ueba/ueba_worker.py` — background thread, same pattern as `sophos_asset_sync.py`/`campaign_attribution.py`, runs signal_builder → rule_engine → risk_engine on an interval.
- `backend/app/routers/ueba_routes.py` — `/api/ueba/overview`, `/api/ueba/entities`, `/api/ueba/entities/{id}`, `/api/ueba/rules`.

## Frontend (OpenUBA-shaped, SecureZen-styled)

New sidebar section, pages:
- **Overview** — Risk Over Time chart, Anomaly Severity breakdown, Cases-by-Severity chart, stat tiles (Monitored Users, Monitored Hosts, High Risk Entities, Active Rules).
- **Entities** — table of all users/hosts with current risk %, sortable and filterable using the same per-column filter-drawer pattern already built for the Assets page.
- **Entity Detail** — risk trend over time, which signals/rules contributed, related alerts (reuses the asset-alert-drawer pattern).
- **Rules** — list of active detection rules (read-only to start).

## Phased rollout

1. **Phase 1 ✅ done — Signals**: schema (`sz_ueba_entities`, `sz_ueba_daily_signals`) + `backend/app/services/ueba/signal_builder.py`, wired into `main.py`'s startup as an hourly background worker (rebuilds today-so-far + finalizes yesterday, same pattern as the Sophos sync worker). Verified against real data:
   - `event_type` has no clean "login" category in practice (`wazuh_api`, `signature`, `urlfilter`, `ftgd_blk`) — login/auth detection uses `rule_description` text matching instead (`ILIKE '%login%'`/`'%auth%'`/`'%fail%'`), confirmed against real values like `"Fortigate: SSL VPN user failed login"`, `"PAM: Login session opened"`, `"sshd: authentication success"`.
   - Host entities are matched by **IP** (`srcip` against `sz_assets.ip_address` + `sz_asset_ip_history`), not by `agent_name`/hostname — FortiGate `urlfilter`/`ftgd_blk` events put the *blocked destination's* domain in `agent_name`, not a real internal host (same finding as the Assets page correlation work). Matching by hostname produced 0 host entities every time until this was fixed.
   - Spot-checked output against real alert counts (8-62 alerts/entity/day, sensible `distinct_ips`/`distinct_countries`/`off_hours_ratio` values, real login events correctly detected for a handful of SSH users) - numbers are sane, not garbage.
2. **Phase 2 ✅ done — Rules**: `backend/app/services/ueba/rule_engine.py`, 6 deterministic rules (`failed_login_burst`, `multi_country_same_day`, `high_severity_volume`, `heavy_off_hours_activity`, `many_distinct_ips`, `new_country_seen`), writing to `sz_ueba_risk_scores` (`rule_score`/`risk_level`; `model_score` stays 0 until Phase 3). Wired into `main.py` as a second hourly worker. `risk_level` buckets: Critical 90+, High 70-89, Medium 40-69, Low 0-39.
   - Verified against real data: most days in the recent window scored uniformly Low (real max `failed_login_count`/`high_sev_alert_count` were 0 in that window - genuinely quiet traffic, not a bug). Found a real anomalous day (2026-08-13) with 105 scored users, many correctly hitting `risk_level: High` (score 85) with 3 rules firing together (`failed_login_burst` + `high_severity_volume` + `heavy_off_hours_activity`) - confirms the engine actually catches real anomalies, not just quiet days.
3. **Phase 3 ✅ done — ML layer**: `backend/app/services/ueba/ml_engine.py`. Isolation Forest trained per `(tenant, entity_type)`, pooling that type's daily signal rows from the trailing 90 days (needs 20+ rows to attempt training - below that, scoring is skipped for that entity type, logged clearly, not silently faked). Writes `model_score` into the existing `sz_ueba_risk_scores` row, `risk_pct = max(rule_score, model_score)`.
   - **Design simplification (documented, not hidden)**: this is one shared model per entity type, pooling all entities together - not yet one personal model per individual entity (that needs 2+ weeks of history per entity, which a fresh dataset doesn't have). It currently answers "is this entity's day unusual for entities of this type in general," not yet "unusual for this exact entity specifically." Revisit once enough per-entity history accumulates.
   - **Real bug found and fixed during testing**: the first implementation rescaled the raw Isolation Forest score via percentile rank alone. Percentile rank always spreads results across the full 0-100 range - *someone* is always "most unusual of the bunch," even on a day where nothing is actually wrong. Verified directly: a day Phase 2's rules scored as calm (max rule_score 20) still produced a 90-99 model_score for several unrelated users. Fixed by gating on the model's own `predict()` boundary (which uses `contamination=0.05` to call only the genuinely most-isolated ~5% of rows anomalous) - only rows the model itself flags (`-1`) keep the full percentile score; everyone it calls normal (`1`) is capped at ≤30, so relative noise alone can never reach High/Critical without either real model conviction or rule support. Re-verified after the fix: the previously-anomalous quiet day dropped from 8 inflated Medium/Critical entries to 1 genuine Critical; the known-anomalous day (2026-08-13) was unaffected (still 45/109 High or Critical).
4. **Phase 4 ✅ done — Frontend**: `backend/app/routers/ueba_routes.py` (`/api/ueba/overview`, `/api/ueba/entities`, `/api/ueba/rules`) + `frontend/src/features/ueba/UebaOverviewPage.jsx` (stat tiles, Risk Over Time area chart, current risk-distribution donut, Top Risky Entities table) + `UebaEntitiesPage.jsx` (full entity list, reusing the exact per-column filter-drawer pattern already built for the Assets page). New "Behavior Analytics" sidebar section with "Behavior Overview"/"Entity Risk" nav items.
   - Adapted OpenUBA's "Cases by Severity" widget into a **Top Risky Entities** ranked table instead (Seceon-inspired) - there's no "case" concept in our data model yet, and a ranked table is more directly actionable than a redundant severity bar chart.
   - Verified with a real production build (`bun run build`) - both pages compile and code-split cleanly as separate lazy-loaded chunks, and all 3 API endpoints were exercised directly against real data (159 entities, 221 scores) before wiring in the UI.
   - Found and worked around a local-sandbox-only quirk during testing: `_sz_conn()` (sync, psycopg2) and `AsyncSessionLocal` (async, asyncpg) resolved to what claimed to be the same server/database but showed different table visibility in this dev sandbox - unrelated to the actual code, and not expected to occur on 198's real single-container deployment (`docker-compose` injects the same env vars into the same process there, unlike ad-hoc local test scripts that never load `.env`).
5. **Phase 5 ✅ done — Drill-down**: `GET /api/ueba/entities/{id}` (30-day signal/risk history + related alerts, matched the same way `asset_routes.py` matches host alerts) + a slide-over drawer on the Entities page (click a row) showing that history and the related alerts, reusing the drawer pattern already built for the Assets page. Plus `GET/PATCH /api/ueba/rules/{name}` + a new `UebaRulesPage.jsx` with an admin-only enable/disable toggle per rule.
   - **Real bug found and fixed before building the management UI**: `rule_engine.py` was reading rule weights from a hardcoded Python constant (`_RULE_CATALOG`), completely ignoring the `enabled`/`weight` columns already sitting in `sz_ueba_rules`. A "Rules management" toggle would have silently done nothing. Fixed by having the scoring pass fetch live `enabled`/`weight` state from the table every run; verified directly - disabling `heavy_off_hours_activity` and rescoring a day where it was the only rule that fired correctly dropped that day's scores to 0, re-enabling it restored them.
   - All new endpoints (entity detail, rule toggle, 404 on an unknown rule name) verified against real data before wiring into the UI; both new pages verified with a real `bun run build` (clean, separate lazy chunks).

### Phase 5.1 - polish + rule extensibility (post-review fixes)

Found via real screenshots after Phase 5 shipped:

- **Invisible text in the entity-detail drawer**: several columns (Date, Rule, Model, Risk %) and the alert card's title had no explicit text color. The drawer renders via `ReactDOM.createPortal` straight to `document.body`, so it never inherited the page's `color: var(--text-primary)` the way normal in-tree content does. Fixed by setting the color explicitly on the drawer's outer container.
- **Invisible toggle knob on the Rules page**: the switch's white knob relied on an implicit default `left` position instead of an explicit one, which didn't render reliably. Fixed with an explicit `left-0.5` base position.
- **Rules were static, no way to add one**: added `rule_type`/`field`/`operator`/`threshold` columns to `sz_ueba_rules` (the original 6 stay `rule_type='built_in'`, evaluated by hardcoded checks as before). New `POST /api/ueba/rules` lets an admin add a "simple" rule (pick a signal field, an operator, and a threshold from a whitelist) that `rule_engine.py` now evaluates generically alongside the built-in checks. `DELETE /api/ueba/rules/{name}` removes a custom rule (built-in ones can only be disabled, not deleted). New "Add Rule" form + delete button on `UebaRulesPage.jsx`. Verified end-to-end: added a real test rule, confirmed it fired for the right entities with the right weight, confirmed duplicate-name and delete-built-in both correctly reject.
- **Stat tiles and Top Risky Entities weren't clickable**: Overview page's 4 stat tiles and each Top Risky Entities row now navigate to the Entities page, pre-filtered (Monitored Users -> Type=user, Monitored Hosts -> Type=host, High Risk Entities -> Risk Level=High/Critical, Active Rules -> the Rules page) or, for a specific entity row, opens that entity's detail drawer directly - same `deepLink`/`onDeepLinkConsumed` prop pattern already used by the Assets page.
6. **Phase 6 ✅ done (partial, by design) — network signals**: extended `signal_builder.py` with 4 new signal columns (`total_bytes_sent`, `total_bytes_received`, `distinct_sessions`, `distinct_dst_ports`) sourced from FortiGate's `sentbyte`/`rcvdbyte`/`sessionid`/`dstport` fields on `sz_alerts`. Verified real data availability first (~70% of alerts have these populated) before building anything - checked `email_analysis` too and found it doesn't have a single real row yet (the table doesn't even exist), so **email behavior signals are explicitly skipped for now**, not built against a table with nothing to test against.
   - Added 2 new default rules (`high_data_sent`, `high_data_received`, 100KB/day threshold each) seeded via the same "simple" (field/operator/threshold) mechanism Phase 5.1 built for custom rules - not hardcoded checks. Threshold picked from the real p95 of observed daily byte totals (~29KB) with a comfortable margin, not guessed.
   - The 4 new fields were also added to `SIMPLE_RULE_FIELDS`, so an admin can build their own custom network-volume rules via the Rules page too.
   - **Real bug found and fixed while testing**: `run_rule_engine_once`'s SQL query and `signal` dict never included the 4 new columns, so `high_data_sent`/`high_data_received` silently never fired even when a real entity's data (383KB sent in one day) was far past the threshold - `field not in signal` was quietly skipping the check. Fixed by adding the columns to both the SELECT and the signal dict; re-verified the same entity correctly fires the rule now, and re-ran the existing "quiet day" regression check to confirm nothing else broke.
   - Email signals remain the one explicitly deferred item, to be picked up once `email_analysis` has real production data to build and verify against.

Each phase gets tested against real data (like the prompt-externalization and asset-sync work) before moving to the next — not built blind end-to-end.

## What this does NOT do

- No Kubernetes, Spark, or Elasticsearch — everything runs against the existing Postgres.
- No live per-event streaming score — batch/interval-based, matching the existing worker pattern (Sophos sync, campaign attribution).
- No user-facing "install your own model" plugin marketplace like OpenUBA's — fixed, built-in scoring only.
- No forked/copied code from OpenUBA or Seceon — algorithm and layout *ideas* only, implemented natively.
