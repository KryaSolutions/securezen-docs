# Deployment & Environments

This project runs across three environments with deliberately different rules. Getting this wrong (running the local model on the wrong box) has already caused a real production incident — see `docs/ai-soc/reliability-log.md` #37.

## The three environments

| Environment | Role | Local model (`LOGEM_MODEL_PATH`) enabled? |
|---|---|---|
| **Demo/production server** | Client-facing demos only. Deliberately frozen — no experimentation happens here. | **No** — Groq-only. |
| **Test/candidate server** | Where the real classification pipeline (local model + rule overrides + Postgres sync) actually runs and gets validated against real traffic before anything is promoted. | Yes |
| **Local dev machine** | Development and testing fixes before they reach either server above. | Optional |

The demo server hosts other unrelated, resource-heavy services on the same box. Enabling the local classifier there once drove CPU to 97%+ and made the login endpoint unresponsive. The fix was removing the local-model config from that server, not making the model lighter — the rule stands regardless of how efficient any future model is: **don't run experimental AI workloads on the box a client demo depends on.**

## Bringing the stack up (any environment)

```bash
docker compose up -d --build
```

12 containers total (4 core app + 2 Forensic Analysis/OpenSearch + 6 self-hosted Langfuse monitoring — full breakdown in `docs/architecture/network-topology.md`). The 4 core: `securezen-db` (Postgres, `5434:5432`), `backend` (`25000:5000`), `ml-worker` (internal only, healthcheck on `:8001/health`), `frontend` (`27000:80`). Full env var list and health-check commands: `docs/getting-started/setup.md`.

## New environment setup

1. Clone the repo, create `.env` (full variable list: `docs/getting-started/setup.md`).
2. Decide, deliberately, whether this environment is allowed to run the local model (`LOGEM_MODEL_PATH`) — default to **no** unless it's a dedicated test/candidate box with headroom to spare.
3. `docker compose up -d --build`.
4. Verify: `docker compose ps` (all 12 healthy), `curl http://localhost:25000/health`, `curl http://localhost:25000/api/alerts/worker/health`.

## Rolling back

No automated rollback tooling exists. In practice: `git checkout <previous-commit>` on that environment's clone, then repeat the update steps above. There is no blue/green or canary mechanism — a bad deploy means downtime until this manual rollback completes. Worth a real fix if this environment ever needs to guarantee uptime during deploys.

## Promoting a fix across environments

Branch roles (`dev` → `stage` → `prod`) and the CI/CD auto-deploy pipeline are documented in `docs/deployment/ci-cd-branching.md`. Until that pipeline is fully wired up (or if it fails), each server needs an explicit manual pull + rebuild:

```bash
git pull origin stage   # or prod, on that server
docker compose build ml-worker   # or backend, whichever changed
docker compose up -d --force-recreate ml-worker
```

`--force-recreate` matters specifically when only a healthcheck or command changed — a plain `up -d` can no-op and leave the old container running, showing misleadingly stale health status.

## Scaling ml-worker when the classification queue backs up

`ml-worker` classifies events from the Minion `events` table one at a time in a plain loop, so if real-time ingestion (`scribe`) outpaces classification (e.g. 55 events land, only a handful get classified in the same window), the fix is more workers, not a faster loop. The polling query uses `FOR UPDATE SKIP LOCKED`, so this is safe by design — multiple replicas split the queue without double-classifying the same event:

```bash
docker compose up -d --scale ml-worker=3
```

Check all replicas picked it up: `docker compose ps ml-worker` should show 3 containers. Scale back down with `--scale ml-worker=1` once the backlog clears, since more replicas means more concurrent Groq API calls against the same daily token quota.

## Frontend note

The frontend is a static build, not a reverse proxy — it does not route `/api` through nginx. It calls the backend directly at a URL baked in at *build time* (`VITE_API_URL`, derived from `SECUREZEN_HOST`/`SECUREZEN_PORT`). Changing those env vars after the fact requires rebuilding the frontend image, not just restarting the container.
