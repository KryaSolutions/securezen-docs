# User Guide

A first walkthrough for an analyst using the dashboard, based on the actual frontend feature set (`frontend/src/features/`).

1. **Log in** — `ROLE_ADMIN`/`ROLE_DEMO`/`ROLE_VIEWER` determine what you can see and do; `ROLE_VIEWER` is read-only.
2. **Dashboard** (`features/dashboard/`) — overview metrics and AI-generated insights first; this is the "what's happening right now" view.
3. **Alerts** (`features/alerts/`) — the actual triage queue. Each alert carries the full context the pipeline denormalized onto it (source/destination IP, country, device, rule description) — you shouldn't need to jump elsewhere to understand why something was flagged.
4. **Intelligence** (`features/intelligence/`) — MITRE ATT&CK mapping, threat actor attribution, CVE lookups, and threat hunting queries for digging deeper into a specific IP or pattern.
5. **Copilot** (`features/copilot/`, ZEN AI Copilot) — ask it a direct question about current alerts rather than manually filtering the alert list.
6. **Blast Radius / Case Explorer** — groups related HIGH/CRITICAL alerts into cases and graphs shared entities (IP/user/host) between them, so lateral movement across separately-alerted events becomes visible instead of hidden across unrelated-looking alerts.
7. **UEBA (Behavior Analytics)** — per-entity (user/host) daily risk scores and flagged anomalies, for the slow/low-and-slow patterns that never trip a single alert threshold.
8. **Forensic Analysis** — an embedded OpenSearch Discover view, deep-linked to a specific alert's time window and host/user, for raw log-level digging beyond what the alert's own denormalized context shows.
9. **Approval Queue** — pending actions the agent fleet has proposed (e.g. Response/SOAR wanting to block an IP) and is waiting on a human to approve or reject before anything actually executes.
10. **Reports** (`features/reports/`) — generated SOC reports, for anything that needs to leave the dashboard as a document.
11. **Administration** (`features/administration/`) — user/role/tenant/asset management; admin-only.

For what each underlying API call actually does: `docs/api/reference.md`. This page describes the *workflow*, not the endpoints — if something here goes stale relative to the actual UI, trust the running app over this page and flag it for a fix.
