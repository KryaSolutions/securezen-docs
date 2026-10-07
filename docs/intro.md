---
sidebar_position: 1
slug: /
title: SecureZen Documentation
---

# SecureZen AI SOC Dashboard — Documentation Centre

> **Product by KRYA SOLUTIONS PRIVATE LIMITED**

SecureZen ingests real SIEM/security logs (Wazuh + Fortigate today) and turns them into triaged, severity-labeled alerts on a SOC dashboard. An unsupervised ML anomaly filter and deterministic rules decide what's worth AI attention; a local classifier and an external LLM (Groq) decide severity for what gets through; a 15-agent fleet (`AgentRunner`, CrewAI's successor) can investigate, triage, hunt, and — only with human approval — act on anything that needs to go deeper.

Start here: [Architecture Overview](./architecture/overview.md).

## Quick Start

```bash
git clone <repo-url>
cd main_folder
# create .env — see Getting Started > Setup for the full variable list
docker compose up -d --build
```

| URL | Purpose |
|---|---|
| `http://<host>:27000` | SOC Dashboard |
| `http://<host>:25000/docs` | FastAPI Swagger UI |
| `http://<host>:25000/health` | Backend health check |

Full walkthrough: [Getting Started > Setup](./getting-started/setup.md).

## Tech Stack

| Layer | Technology |
|---|---|
| Ingestion | Webhook/connector-based (`POST /api/ingest/*`), plus a dedicated real-time poller feeding `ml_worker_daemon.py` |
| ML anomaly filter | Isolation Forest (unsupervised, online) |
| Classification | Local LLM (LogEM, trust-LOW-only policy) → Groq LLM fallback |
| Agent fleet | 15 agents on a shared `AgentRunner` base (real tool-calling, A2A hops, human-approval gate for live actions) |
| Database | PostgreSQL (async, via SQLAlchemy + asyncpg) — no SQLite in the running app |
| Backend API | FastAPI + Uvicorn |
| Frontend | React + Vite (built with Bun) |
| Deployment | Docker Compose — 12 services: 4 core app (`securezen-db`, `backend`, `ml-worker`, `frontend`) + 2 Forensic Analysis/OpenSearch + 6 self-hosted Langfuse monitoring |
| Monitoring | Langfuse (self-hosted) — real per-agent cost/token traces, not a homegrown estimate |

## Keeping this accurate

Fix the relevant doc in the same change that changes the code it describes — don't batch documentation updates for later. See [About > Project](./about/project.md) for why this matters.

---

**Developed By**: KRYA SOLUTIONS PRIVATE LIMITED © 2026
