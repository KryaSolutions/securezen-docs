# User Guide

A first walkthrough for an analyst using the dashboard, based on the actual frontend feature set (`frontend/src/features/`).

1. **Log in** — `ROLE_ADMIN`/`ROLE_DEMO`/`ROLE_VIEWER` determine what you can see and do; `ROLE_VIEWER` is read-only.
2. **Dashboard** (`features/dashboard/`) — overview metrics and AI-generated insights first; this is the "what's happening right now" view.
3. **Alerts** (`features/alerts/`) — the actual triage queue. Each alert carries the full context the pipeline denormalized onto it (source/destination IP, country, device, rule description) — you shouldn't need to jump elsewhere to understand why something was flagged.
4. **Intelligence** (`features/intelligence/`) — MITRE ATT&CK mapping, threat actor attribution, CVE lookups, and threat hunting queries for digging deeper into a specific IP or pattern.
5. **Copilot** (`features/copilot/`, ZEN AI Copilot) — ask it a direct question about current alerts rather than manually filtering the alert list.
6. **Reports** (`features/reports/`) — generated SOC reports, for anything that needs to leave the dashboard as a document.
7. **Administration** (`features/administration/`) — user/role/tenant/asset management; admin-only.

For what each underlying API call actually does: `docs/api/reference.md`. This page describes the *workflow*, not the endpoints — if something here goes stale relative to the actual UI, trust the running app over this page and flag it for a fix.
