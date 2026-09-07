# Network Topology

## Docker Compose services (any environment)

| Service | Container | Host:Container port |
|---|---|---|
| `securezen-db` (Postgres) | `zen-postgres` | `5434:5432` |
| `backend` | `zen-backend` | `25000:5000` |
| `ml-worker` | `zen-ml-worker` | not published — internal healthcheck `:8001/health` only |
| `frontend` | `zen-frontend` | `27000:80` |

The frontend does not proxy `/api` through nginx — it's a static build that calls the backend directly at a build-time-baked `VITE_API_URL`. Full detail: `docs/getting-started/setup.md`.

## Server-to-server topology

Three separate hosts, not networked to each other — each runs its own independent copy of the 4-service stack above, all pointed at their own environment's config:

```
Demo/production server (frozen)        Test/candidate server              Local dev machine
  Groq-only, no local model    <-not->   Local model + Groq fallback  <-not->  Optional local model
  Serves real client demo traffic       Real KRYA SIEM traffic, validated     Development only
```

There is no shared network dependency between them — the split is operational policy (what's allowed to run where), not a network topology constraint. Full reasoning: `docs/deployment/environments.md`.
