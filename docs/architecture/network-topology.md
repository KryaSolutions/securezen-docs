# Network Topology

## Docker Compose services (any environment)

Core app (4 services):

| Service | Container | Host:Container port |
|---|---|---|
| `securezen-db` (Postgres) | `zen-postgres` | `5434:5432` |
| `backend` | `zen-backend` | `25000:5000` |
| `ml-worker` | `zen-ml-worker` | not published — internal healthcheck `:8001/health` only |
| `frontend` | `zen-frontend` | `27000:80` |

Forensic Analysis / embedded OpenSearch (2 services, added October 2026 — see `docs/architecture/forensic-analysis.md`):

| Service | Host:Container port |
|---|---|
| `opensearch` | `9200:9200` |
| `opensearch-dashboards` | `5601:5601` |

Self-hosted Langfuse monitoring stack (6 services, added October 2026 — see `docs/architecture/agentic_architecture.md` §8; every agent run's real cost/token trace lives here, not in a SecureZen-owned table):

| Service | Host:Container port |
|---|---|
| `langfuse-web` | `3001:3000` |
| `langfuse-worker` | not published |
| `langfuse-clickhouse` | not published |
| `langfuse-postgres` | not published |
| `langfuse-redis` | not published |
| `langfuse-minio` | `9095:9000`, `9096:9001` (loopback only) |

12 services total. The frontend does not proxy `/api` through nginx — it's a static build that calls the backend directly at a build-time-baked `VITE_API_URL`. Full detail: `docs/getting-started/setup.md`.

## Server-to-server topology

Three separate hosts, not networked to each other — each runs its own independent copy of the 12-service stack above, all pointed at their own environment's config:

```
Demo/production server (frozen)        Test/candidate server              Local dev machine
  Groq-only, no local model    <-not->   Local model + Groq fallback  <-not->  Optional local model
  Serves real client demo traffic       Real KRYA SIEM traffic, validated     Development only
```

There is no shared network dependency between them — the split is operational policy (what's allowed to run where), not a network topology constraint. Full reasoning: `docs/deployment/environments.md`.
