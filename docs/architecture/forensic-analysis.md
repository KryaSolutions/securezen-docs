# Forensic Analysis & AI Analysis Dashboards

> **New — October 2026.** Two related but distinct views, both built on a real embedded OpenSearch Dashboards (OSD) instance rather than custom React charting.

## Forensic Analysis — real Discover, embedded

Seceon's own "Forensic Analysis" nav item turned out to be stock OpenSearch Dashboards **Discover**, embedded under their shell — confirmed directly against their reference screenshots (exact "Lucene" toggle, empty-state copy, field panel layout). SecureZen built the same thing for real, not a lookalike:

- New `opensearch` + `opensearch-dashboards` Docker Compose services.
- A sync worker (`services/opensearch_sync.py`) indexing `sz_alerts` into a `securezen-alerts` index, tracking its own cursor rather than doing a full refresh every cycle.
- A "Forensic Analysis" sidebar entry whose page embeds Discover via iframe, deep-linking to a specific alert's ±2-day window and host/user whenever it's opened from a case.

**Rebranding, the hard way.** OSD has no config flag to disable most of its plugins — some plugin schemas don't even expose an "enabled" key — so a custom Dockerfile strips every OSD plugin outside the core Discover/Dashboards/Visualize/Management stack (Observability, Alerting, ML Commons, Security Analytics, etc.) by removing the plugin directory at build time, the only reliable method found. Logo/branding text is patched via `sed` across the built JS bundles for the same reason — OSD's `branding.applicationTitle` config doesn't reach every hardcoded "OpenSearch Dashboards" string (e.g. the nav category label, the Overview page heading).

**Theme sync.** OSD has one global `theme:darkMode` setting, not a per-session one — the frontend calls a new `GET /api/forensics/osd-theme` endpoint on every SecureZen theme toggle and remounts the iframe once OSD's setting lands. The initial sync runs in the background rather than blocking first paint, after an earlier version that gated the iframe behind it (with no request timeout) could hang the page indefinitely on a slow/failed call.

## AI Analysis dashboard — native OSD visualizations, not custom charts

Raw logs (Discover) and AI-investigated data are kept in **separate indices and views** rather than mingled into one search. A new `securezen-ai-analysis` index is synced from `sz_crewai_tasks` **left-joined** with `sz_alerts` (verdict, confidence, severity, agent, MITRE techniques as a real array field for terms aggregation).

Rather than a custom React charting page, the dashboard itself is built from OSD's own saved-objects API — 6 native visualizations bundled into one "AI Analysis" dashboard, auto-provisioned (`services/osd_dashboard_builder.py`) on every backend startup so it self-heals on redeploy instead of being a one-off manually-built object:

- Verdict donut
- Confidence histogram
- Investigations-over-time line
- Severity bar
- Top MITRE techniques bar
- Agent breakdown bar

Colors reuse Blast Radius's verdict taxonomy (`docs/architecture/blast-radius.md`) so the same verdict means the same color everywhere in the product.

**A real data bug found while wiring this up**: every existing `sz_crewai_tasks` row referenced an `alert_id` already purged by the demo's 60-day alert cleanup job, so an inner join against `sz_alerts` silently returned zero rows. Fixed by switching to a left join, so historical investigations aren't lost just because their source alert rotated out of retention.

## Where to look for more detail

- `docs/architecture/blast-radius.md` — the verdict taxonomy these dashboards share
- `docs/architecture/network-topology.md` — the OSD/OpenSearch Docker Compose services
