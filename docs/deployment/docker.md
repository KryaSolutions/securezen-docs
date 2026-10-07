# Docker Compose Reference

The full `docker-compose.yml` (repo root) defines 12 services — 4 core app, 2 Forensic Analysis/OpenSearch, 6 self-hosted Langfuse monitoring — see `docs/architecture/network-topology.md` for the full port table. This page covers the operational details.

## Bringing it up / updating a running deployment

```bash
docker compose up -d --build          # first-time or after a Dockerfile change
git pull origin stage                 # or `prod` on the prod server — see docs/deployment/ci-cd-branching.md
docker compose build ml-worker        # or backend — whichever changed
docker compose up -d --force-recreate ml-worker
```

**`--force-recreate` matters** when only a healthcheck or command directive changed, not application code — plain `up -d` can no-op and leave the stale container running with misleading health status. This has bitten this project before (`docs/ai-soc/reliability-log.md`, item 36).

## Healthchecks

- `securezen-db`: `pg_isready`
- `backend`: curls `http://localhost:5000/health`
- `ml-worker`: internal `:8001/health`, not published externally
- `frontend`: none defined at the container level — it's a static file server

## `.env` mounting

The root `.env` is bind-mounted into both `backend` and `ml-worker` containers. There's no `docker-compose.override.yml` in this repo — environment-specific values (which server, which host/port) live in that one `.env` file per environment, not in compose overrides.
