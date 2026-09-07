# Installation

Pure install steps. Full context (why Docker-only, what changed from the old SQLite-era setup): `docs/getting-started/setup.md`.

```bash
git clone <repo-url>
cd main_folder
# create .env — see requirements.md for the full variable list
docker compose up -d --build
```

That's the entire install — there is no separate native/bare-metal install path, no `.bat` launcher script (checked, doesn't exist in the current repo).
