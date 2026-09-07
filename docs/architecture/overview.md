# SecureZen AI SOC Dashboard — System Architecture

> **Last rewritten**: August 2026, after the router package refactor and the ML worker rule-override / local-classifier work.
> The previous version of this doc described a directory layout (`ip-intel-crewai/secure_zen_core/...`, `api/server.py`, SQLite-only storage) that no longer exists anywhere in the codebase. This version reflects the system as it actually runs today.

---

## 1. Product Overview

SecureZen ingests real SIEM/security logs (Wazuh + Fortigate today) and turns them into triaged, severity-labeled alerts on a SOC dashboard, with AI doing the classification work a tier-1 analyst would otherwise do manually.

The system deliberately splits "things a rule can decide" from "things that need judgment":
- **Deterministic code** handles known-shape threats (attack signatures, brute-force login bursts) — no AI involved, no ambiguity.
- **AI (local model, then external LLM fallback)** handles everything else — the actual judgment calls a rule can't cover.

---

## 2. High-Level Pipeline

```
Real SIEM traffic (Wazuh/Fortigate)
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│  Minion DB (shared, external service)                      │
│  events table — raw logs, one row per log line              │
└───────────────────────────┬───────────────────────────────┘
                             │ polled continuously, newest-first
                             ▼
┌───────────────────────────────────────────────────────────┐
│  ml_worker_daemon.py — process_anomalies_loop()             │
│  (runs forever, never exits)                                 │
│                                                               │
│  Phase 1 — _phase1_poll()                                    │
│  ├── ML filter: Isolation Forest anomaly score                │
│  │     (self-training online, no fixed train/test dataset)   │
│  └── Rule overrides (deterministic, run regardless of ML):    │
│        ├── signature match → escalate                        │
│        └── repeat-login count in 24h → escalate               │
│      → event proceeds only if ML flags it OR a rule fires     │
│                                                               │
│  Phase 2 — _phase2_infer()                                    │
│  ├── Local LLM (LogEM) tries first                             │
│  │     trusted ONLY when confidently LOW (proven unreliable    │
│  │     at escalating — see docs/research/)                     │
│  └── Otherwise → external LLM (Groq, multi-model fallback)     │
│      Rule overrides re-applied here too (escalate-only,        │
│      never downgrade a local/external answer)                  │
│                                                               │
│  Phase 3 — _phase3_save()                                     │
│  └── Write verdict (severity, reasoning, full denormalized     │
│      event context — IPs, country, device, rule description)  │
│                                                               │
│  Phase 4 — sync                                                │
│  └── classifier_lab/src/pg_sync.py → sz_alerts (SecureZen DB)  │
└───────────────────────────┬───────────────────────────────┘
                             ▼
                    Dashboard (React frontend)
```

**Events that never get flagged by the ML filter or a rule are silently dropped — no verdict is ever written for them.** This is intentional: most real SOC traffic is routine, and classifying every single log line would be both expensive and noisy.

---

## 3. Why These Specific Design Choices

**Isolation Forest for the ML filter, not One-Class SVM / LOF / DBSCAN / Autoencoders:**
Needed something that scales to live streaming volume (10k+ events/hour), doesn't rely on distance/density metrics (our features mix categorical and continuous signals), and matches the actual shape of the problem — rare anomalies in mostly-normal traffic, no GPU, running continuously on CPU.

**Rules for signature/brute-force detection, not AI:**
If a rule can fully describe a pattern (a named attack signature appearing verbatim, N failed logins for one account in 24h), write it as code. An LLM re-deriving something a `COUNT(*)` query already answers perfectly is a reliability risk, not a feature. Rule overrides are escalate-only — they can push severity up, never down, so they can't accidentally suppress something the AI already flagged correctly.

**Local model only trusted when confidently LOW:**
Ground-truth validation (60 real samples) found the local model's non-LOW calls were unreliable — 12/12 sampled HIGH calls were on genuinely benign logs, and it failed to produce a parseable answer at all ~44% of the time. Its LOW calls, however, were accurate enough to trust. So: local model filters out the obviously-benign cheaply; anything else always gets confirmed by the external LLM. Same logic that keeps rules deterministic — don't trust a component for calls it's been shown to get wrong.

**Fine-tuning tried, not currently used:**
A LoRA fine-tune of the local model was built, trained, and shadow-tested against real production severities. It confidently called LOW on 100% of real HIGH/CRITICAL threats in the test batch — worse than the untouched base model, because there's almost no real CRITICAL/HIGH training data to fine-tune on (near-zero real CRITICAL events exist in this environment; genuine attacks are rare by nature). Shelved, not abandoned — revisit once enough real high-severity examples accumulate naturally. Full history in `docs/research/fine-tuning.md`.

---

## 4. Data Model

Two separate databases, two separate purposes:

| Database | Table | Purpose |
|---|---|---|
| **Minion** (external, shared) | `events` | Raw ingested logs — one row per log line, full context (IPs, country, device, rule description) |
| **Minion** | `verdicts` | AI/rule classification result per event — now includes denormalized event context, not just `event_id` |
| **SecureZen** (`securezen-db`) | `sz_alerts` | What the dashboard actually reads — synced from `verdicts` + `events` via `pg_sync.py` |
| **SecureZen** | `sz_ground_truth_labels` | Manually human-labeled real events, used to measure real classifier accuracy |
| **SecureZen** | `sz_shadow_predictions` | Shadow-deployment comparison data (candidate model vs. production, never influences real verdicts) |
| **SecureZen** | `sz_ml_filter_validation` | Manually reviewed samples validating the ML filter's keep/drop decisions |

`events`/`verdicts` are shared across every environment that runs `ml-worker` — it's the same live SIEM feed regardless of which server is polling it.

---

## 5. Deployment Topology

This project currently runs across three distinct environments, each with a different job:

| Environment | Role | Local model? |
|---|---|---|
| **Production/demo server (114)** | Client-facing demos only. Frozen deliberately — no experimentation. | **No** — Groq-only. Running the local model here once caused CPU contention severe enough to make the login endpoint unresponsive. |
| **Test/candidate server (198)** | Where the real classification pipeline (local model + rule overrides + sync) actually runs and gets validated against real traffic. | Yes |
| **Local dev machine** | Development, testing fixes before they touch either server above. | Optional, for testing |

The demo tenant (FintrustCapital) on the demo server is populated by an internal simulator generating synthetic threat bundles directly — it never touches the real Minion-based classification pipeline, which is why the demo stays stable even when the real pipeline is being actively worked on.

---

## 6. Backend Code Structure (current, `backend/app/`)

```
backend/app/
├── core/
│   ├── config/settings.py       # env var loading (SZ_PG_HOST/PORT correction logic)
│   ├── sensors/orchestrator.py  # batch log-file ingestion path (Wazuh rule engine)
│   └── triage/rule_engine.py    # WazuhRuleEngine (batch classification, separate from ml-worker)
├── ml_utils/
│   ├── ml_worker_daemon.py      # the live pipeline described in §2
│   ├── anomaly_detector.py      # Isolation Forest — the ML filter
│   ├── ai_cost_tracker.py
│   ├── ip_enricher.py
│   └── response_engine.py
├── routers/
│   ├── alerts/                  # split from a single alert_routes.py (Aug 2026)
│   │   ├── core.py, raw_events.py, verdicts.py, detail_ai.py
│   └── intelligence/            # split from a single intelligence_routes.py
│       ├── ai_mitre.py, crewai.py, hunt.py, threat_actors.py, ...
├── database/                    # SQLAlchemy models, session management
├── investigation/                # CrewAI/LangGraph forensic agent pipelines
└── utils/helpers.py              # call_groq_with_fallback(), shared DB connection helpers
```

Two known trip-ups worth remembering when touching this structure:
- **`load_dotenv(override=True)`** in `anomaly_detector.py`, `ip_enricher.py`, `response_engine.py` used to silently corrupt `SZ_PG_HOST`/`PORT` back to host-side dev values for the rest of the process's life — fixed by removing `override=True`, but any *new* module doing its own `.env` reload needs the same care.
- **Container healthchecks pointing at the wrong port** (backend healthcheck accidentally checking ml-worker's port) will make a container show "unhealthy" even though the app inside is working fine — always verify the actual healthcheck command, not just the reported status.

---

## 7. Where To Look For More Detail

- `docs/ai-soc/reliability-log.md` — incident/postmortem log of specific bugs found and fixed, with root cause
- `docs/research/fine-tuning.md` — full fine-tuning attempt history and why it's shelved
- `docs/research/ml-filter-design.md` — full rationale for the ML filter's design choices and how it was validated
- `docs/deployment/environments.md` — the 3-environment operational split in detail
- `docs/architecture/agentic_architecture.md` — the CrewAI/LangGraph forensic investigation layer (separate from the classification pipeline above)
