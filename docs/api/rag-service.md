# API — Knowledge & Intelligence Retrieval

> Their reference project has a literal vector-embedding RAG service. SecureZen doesn't run vector retrieval — this page covers the closest equivalent: structured knowledge lookup (MITRE ATT&CK, threat actors, hunting) rather than embedding-based RAG. Don't read "RAG" into this beyond that naming parallel.

From `backend/app/routers/intelligence/`:

| Method | Path | Purpose |
|---|---|---|
| POST | `/mitre/search` | MITRE ATT&CK technique lookup |
| GET | `/mitre/apt-attribution/{technique_id}` | which known threat actors use this technique |
| GET | `/mitre/predicted-next` | likely next techniques given current activity |
| GET | `/mitre/detection-guide/{technique_id}` | detection guidance for a technique |
| GET | `/threat-actors`, `/threat-actors/{ip}` | threat actor lookup/attribution by IP |
| POST | `/hunt/search`, `/hunt/forensic-insight` | threat hunting queries |
| GET | `/hunt/library`, `/hunt/saved` | saved hunt queries |
| POST | `/forensic` | forensic lookup |

If a genuine vector-embedding retrieval layer is ever added (e.g. over runbooks or historical incident write-ups), this is the file to expand — don't retrofit a RAG framing onto the current structured-lookup endpoints above.
