# Quickstart

After `docker compose up -d --build` (see `installation.md`):

```bash
docker compose ps                                     # all 4 services should show healthy
curl http://localhost:25000/health                    # backend is up
curl http://localhost:25000/api/alerts/worker/health   # ml-worker is actively processing
```

Then open the dashboard at `http://<host>:27000` and log in. If you registered the very first user on this instance, that account is `ROLE_ADMIN` automatically (`docs/api/reference.md`).

If `backend` shows `unhealthy` right after a change that only touched its healthcheck, `docker compose up -d --force-recreate backend` — a plain `up -d` can no-op on healthcheck-only changes.
