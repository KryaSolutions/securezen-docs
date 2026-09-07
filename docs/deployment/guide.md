# Deployment Guide

Step-by-step for deploying to a new or existing environment. For the *rules* about which environment is allowed to run what, see `docs/deployment/environments.md` first — this page is the *how*, that page is the *why/where*.

## New environment

1. Clone the repo, create `.env` (full variable list: `docs/getting-started/setup.md`).
2. Decide, deliberately, whether this environment is allowed to run the local model (`LOGEM_MODEL_PATH`) — default to **no** unless it's a dedicated test/candidate box with headroom to spare.
3. `docker compose up -d --build`.
4. Verify: `docker compose ps` (all 4 healthy), `curl http://localhost:25000/health`, `curl http://localhost:25000/api/alerts/worker/health`.

## Updating an existing environment

Merging a PR into `stage` or `prod` does **not** update a running server by itself unless the CI/CD deploy workflow ran successfully (`docs/deployment/ci-cd-branching.md`):

```bash
git pull origin stage   # or prod
docker compose build <changed-service>
docker compose up -d --force-recreate <changed-service>
```

## Rolling back

No automated rollback tooling exists. In practice: `git checkout <previous-commit>` on that environment's clone, then repeat the update steps above. There is no blue/green or canary mechanism — a bad deploy means downtime until this manual rollback completes. Worth a real fix if this environment ever needs to guarantee uptime during deploys.
