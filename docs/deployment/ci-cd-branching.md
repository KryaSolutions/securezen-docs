# Branching & CI/CD Pipeline

How code moves from a laptop to the demo server (114) to production (198), and how the three long-lived branches map to that.

## The three branches

| Branch | Role | Auto-deploys to | Protection |
|---|---|---|---|
| `dev` | Active development. All feature/fix work happens here (or on short-lived branches merged into it). | Nowhere — no server watches this branch. | Open |
| `stage` | Pre-production. What's about to go live, sitting on the demo server for validation. | Server **114** | PR-only, no direct push (once org is upgraded to GitHub Team/Enterprise — see note below) |
| `prod` | Production. What clients actually see. | Server **198** | PR-only, no direct push (same note) |

This replaces the old single-`main` model. `main` still exists on GitHub as a leftover — don't push to it, it's not wired to anything anymore.

**Note on branch protection**: the rules are configured (Settings → Branches, on `prod` and `stage`) but GitHub shows them as "Not enforced" — that's because this is a private repo on the free org plan. They'll start being enforced automatically if/when KryaSolutions upgrades to Team or Enterprise. Until then, the rules exist as documentation of intent, not a hard technical block — don't push directly to `stage`/`prod` anyway.

## Day-to-day flow

```
dev  →  PR  →  stage  →  (self-hosted runner on 114 deploys)  →  validate on demo  →  PR  →  prod  →  (self-hosted runner on 198 deploys)
```

1. Do the work on `dev`.
2. Open a PR from `dev` into `stage` (use "Create a merge commit," not "Squash and merge" - see the note below on why). Merging it triggers `.github/workflows/deploy-stage.yml`, which runs `git fetch` + `git checkout -f stage` + `git reset --hard origin/stage` + `docker compose build/up --force-recreate` **directly on 114**.
3. Check the change on the demo server.
4. Once satisfied, open a PR from `stage` into `prod` (same merge-commit rule). Merging it triggers `.github/workflows/deploy-prod.yml`, same steps on 198.

## Why self-hosted runners, not GitHub's cloud runners

The first version of these workflows used `appleboy/ssh-action` to SSH from GitHub's cloud into 114/198. It failed: `dial tcp ***:22: i/o timeout`. Reason — 114/198 sit on a private company LAN (`192.168.x.x`). GitHub's hosted runners are VMs in Microsoft's cloud with no route into that network, no matter how the firewall is configured on the server side; only machines already inside the company network (like your laptop on the office network, or the servers themselves) can reach them.

Fix: install GitHub's runner **agent directly on 114 and 198**. The workflow job then executes locally on that machine — "deploy to 114" becomes a local `git pull`, not a network hop from GitHub's cloud.

## One-time setup: self-hosted runner (per server)

1. Repo → **Settings → Actions → Runners → New self-hosted runner** → Linux/x64. GitHub shows a **Download** command and a **Configure** command, each with a real version number and a token unique to your repo (expires in ~1 hour) — copy them from the page itself, don't reuse an old one.
2. Run the Download command on the target server (114 or 198), then the Configure command (`./config.sh --url ... --token ...`).
   - Runner group: press Enter for Default.
   - Additional labels: `stage-114` on 114, `prod-198` on 198 — the workflow files target these labels (`runs-on: [self-hosted, stage-114]` / `[self-hosted, prod-198]`).
   - Work folder: press Enter for default (`_work`).
3. Install it as a permanent background service (survives reboot/logout — don't use `./run.sh` directly, that dies when your terminal closes):
   ```bash
   sudo ./svc.sh install
   sudo ./svc.sh start
   sudo ./svc.sh status   # confirm "Listening for Jobs"
   ```
4. Confirm it shows up **Idle** (green) under Settings → Actions → Runners on GitHub.

## Repo variables

Each server has its own repo variable, since the two machines use different usernames/paths (repo → Settings → Secrets and variables → Actions → **Variables** tab):

| Name | Value |
|---|---|
| `STAGE_DEPLOY_PATH` | where the repo lives on 114, e.g. `/home/cyberteam/code/securezen` |
| `PROD_DEPLOY_PATH` | where the repo lives on 198, e.g. `/home/praveen/code/securezen` |

**Leftover note**: earlier setup added `STAGE_SSH_HOST`/`_USER`/`_KEY` and `PROD_SSH_HOST`/`_USER`/`_KEY` secrets for the abandoned SSH-based approach, and a single shared `DEPLOY_PATH` variable (replaced by the two above once 114 and 198 turned out to use different paths). All unused now — harmless to leave, safe to delete if you want to tidy up.

## Gotchas hit while setting this up (worth knowing before you debug them again)

- **`git checkout` fails with "local changes would be overwritten"**: happens if the server's clone was ever checked out on a branch that tracked a runtime-generated file (e.g. `backend/data/worker_health.json`, which the running app rewrites constantly). `git checkout -f` before the `reset --hard` handles this - it's why both workflows force the checkout.
- **`pathspec 'stage' did not match any file(s)`**: the server's clone predates that branch existing locally. `git fetch origin` before `git checkout` fixes it permanently.
- **Squash-merging a `dev`→`stage` PR, then merging `dev`→`stage` again later, produces a real merge conflict** even when nothing actually differs - squashing rewrites the commit into a new hash, so the next merge sees two different histories for identical content. Use "Create a merge commit" for these promotion PRs instead.
- **`sz_tenants.description` getting silently reset**: the tenant seed used to run `ON CONFLICT (name) DO UPDATE SET description = ...` on every backend startup, wiping any manual tag (e.g. marking a tenant as a demo tenant) within one redeploy. Fixed to `DO NOTHING` - seeding should only create missing rows, never clobber existing config.

## Rollback

No automated rollback yet — same manual process as before (`git checkout <previous-commit>` on the server, then re-run the deploy steps by hand). See `docs/deployment/guide.md`.
