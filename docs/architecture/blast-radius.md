# Blast Radius — Case Explorer

> **New — October 2026.** Built in 6 stages, modeled on Seceon's "Case Explorer" reference screenshots. Backend: `backend/app/routers/blast_radius_routes.py`. Frontend: `frontend/src/features/blastradius/BlastRadiusView.jsx`.

## What problem this solves

The classification pipeline (`docs/architecture/overview.md`) produces one verdict per alert. But a real attacker rarely touches just one thing — the same compromised account or host often shows up across several *separate* alerts that nothing upstream ever explicitly links together. Blast Radius is a graph view purpose-built to surface that: "which alerts/cases share an entity, and does that reveal lateral movement a flat alert list never would?"

## How a case is built (Stage 1 — deterministic, no LLM)

`GET /api/blast-radius/graph` groups recent HIGH/CRITICAL alerts into **cases**:
- If Threat Intelligence already grouped alerts into a `campaign_id`, that whole group is one case.
- Otherwise, each alert is its own single-alert case (`case_id = "single-<alertId>"`).

Every case node and every entity node (IP/user/host) it involves gets connected in the graph. Two cases that share no direct relationship still end up linked *through* a shared entity — that's the actual lateral-movement signal this view exists to show, without ever computing a fabricated case-to-case edge.

Verdict is honest about its own evidence: a case only ever shows **Malicious/Clean** when a real agent investigation actually ran for it; otherwise it shows a severity-based **Suspicious/Inconclusive** estimate. Verdicts were later matched to Seceon's real 6-tier taxonomy: **Malicious / Suspicious / Inconclusive / False_positive / Benign / Degraded** (replacing an earlier invented 4-tier set), with graph colors driven by verdict rather than raw severity.

Verified live against real data at launch: 150 alerts correctly grouped into cases, 30 entities found touching multiple cases — one user account alone appeared across 19 separate cases.

## The view itself (Stages 2–6)

- **Force-directed graph canvas** (`react-force-graph-2d`) — case nodes sized by alert count and colored by verdict; entity nodes colored by type (ip/user/host), with a bright ring on any entity shared across 2+ cases. A day-range selector (7/14/30/90d) and a live stat bar (case/entity counts, verdict breakdown, shared-entity count) sit above it.
- **Case list sidebar** — search + filter tabs (All/Suspicious/Malicious/Inconclusive/Clean/Shared), each with a live count. Clicking a case re-centers and zooms the graph onto it.
- **Detail panels** — a case panel (verdict, case ID, investigated/pending state — never fabricated, derived from whether a real confidence score exists — and how many of its entities are shared with other cases) and an entity panel (a scrollable list of every case that entity touches). Both panels expose a **"View Attack Path"** button that auto-opens the existing Attack Path panel pre-seeded from the case (`seed_type=alert|campaign`) or entity, instead of requiring a separate manual lookup.
- **Timeline replay scrubber** — a play/pause + range slider that progressively reveals cases whose `first_seen` falls before the playhead; entities and links filter to match, so the graph genuinely grows over time rather than just dimming nodes. The rest of the UI (sidebar, stats, graph) reads from the same playhead-filtered data automatically.
- **Case report** — a right-docked split view (not a full-screen modal), so the graph stays visible and interactive while reviewing a case's report.

Entities share one neutral color with per-type icon glyphs (billboarded via canvas-texture sprites so badges never flatten at grazing camera angles), with a zoom-based halo scale so nodes stay legible fully zoomed out.

## Where it sits in the product

Sidebar entry under Threat Intelligence. Reuses the existing "View Agent Activity" permission (already granted to every role) rather than adding a new one.

## Where to look for more detail

- `docs/architecture/agentic_architecture.md` §2–3 — the agent fleet and Investigation agent that produce the real verdicts/confidence this view displays
- `docs/architecture/forensic-analysis.md` — the AI Analysis dashboard, which reuses this same verdict taxonomy for consistent coloring app-wide
- `docs/changelog.md` — stage-by-stage shipping history
