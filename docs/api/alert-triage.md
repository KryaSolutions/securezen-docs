# API — Alert Triage

> Note on structure: their reference project runs alert-triage as a physically separate microservice with its own API. SecureZen is one monolith backend — there's no separate triage service to document. This page is a topical slice of `docs/api/reference.md`, not a different service.

Endpoints covering an alert's lifecycle once it exists, from `backend/app/routers/alerts/core.py`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/alerts` | main alert list |
| GET | `/api/alerts/with-triage` | list with triage state included |
| POST | `/api/alerts/{alert_id}/triage` | submit a triage action |
| PATCH | `/api/alerts/{alert_id}/assign` | assign to an analyst |
| DELETE | `/api/alerts/{alert_id}/unassign` | unassign |
| PATCH | `/api/alerts/{alert_id}` / `/status` | update status (Open/Acknowledged/Closed) |
| GET | `/api/alerts/{alert_id}/assignment` | current assignment |

Plus the raw pipeline visibility endpoints (`raw_events.py`) that let you see triage state upstream of a finalized alert: `GET /api/alerts/raw-events`, `/pipeline-stats`, `/funnel-stats` — useful for answering "why didn't this event become an alert" during triage review.

Full request/response detail: Swagger UI at `/docs`, or `docs/api/reference.md` for the complete endpoint map.
