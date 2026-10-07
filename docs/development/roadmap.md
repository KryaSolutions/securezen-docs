# Roadmap

Real open items being tracked, not aspirational sprint fiction (see `docs/CHANGELOG.md` for why the old "Sprint 5-8" roadmap style is being retired).

| Item | Status |
|---|---|
| Fortigate `crlevel`-based deterministic fallback for when both local and external LLM classification fail | Open, not started |
| Building confidence in the test/candidate environment's real-traffic classification before considering it for promotion | Ongoing |
| Deciding the test/candidate server's long-term role (stay test-only vs. become production) | Open decision, not yet made |
| Passively accumulating real HIGH/CRITICAL ground-truth examples | Ongoing — this is the actual blocker on revisiting fine-tuning (see `docs/architecture/overview.md` §3) |
| Office 365 / native Windows Security Event connector fix (currently ingesting with 100% empty log bodies) | Open, tracked in `docs/ai-soc/reliability-log.md` item 34 |
| Observability stack (Prometheus/Grafana or equivalent) | Not started — a real gap, no formal monitoring stack exists yet |
| Production hardening checklist | ✅ JWT secret enforcement, CORS scoping, login rate limiting done. Monitoring, automated rollback, credential rotation still open — see `docs/deployment/production.md` |
| MISP integration for community threat intel | Under consideration, not started |
| Case management (TheHive-style) vs. current dashboard status tracking | Open architectural decision, not started — would replace, not complement, current Case Management cards |

This file should be updated when an item's status actually changes — not on a fixed schedule, and not with invented target dates.
