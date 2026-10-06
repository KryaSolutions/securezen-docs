# SecureZen Agentic AI Architecture

> **Rewritten — October 2026.** The previous version of this doc described the CrewAI-era "Forensic Swarm" (4 crews, hardcoded tool chains). CrewAI has since been fully removed from the codebase. This version describes the system as it actually runs today: an 18-agent fleet built on one shared `AgentRunner` base class, with real tool-calling, real monitoring, and a human-approval gate for anything that touches a live system.

---

## 1. Why this changed

The old crews (`AlertTriageCrew`, `MitreMappingCrew`, `DailyReportCrew`, `TruePositiveCrew`) each had their own hand-rolled pipeline, their own prompt wiring, and no shared audit trail. Every new capability meant copying that wiring again. `AgentRunner` (`backend/app/agents/runner.py`) replaces that pattern once, for every agent:

- **Real LLM tool-calling.** The old crews called tools in a fixed, deterministic sequence — the LLM never decided when/how to call one. Every new agent hands the model a list of real tools via `bind_tools()` and lets the model decide which ones to call, in what order, based on what it's actually looking at.
- **A bounded autonomous loop**, not a fixed node sequence — the agent keeps reasoning/calling tools until it believes the task is resolved or it hits `max_iterations`/a wall-clock timeout, at which point it reports `needs_human` instead of looping forever or guessing.
- **Automatic activity logging** (`sz_agent_activity_log`) around every reasoning step and tool call — no new agent has to hand-roll its own audit trail, and every run shows up in the Agent Fleet Activity feed (dashboard + Daily Report) for free.
- **Real monitoring via Langfuse**, not a second homegrown cost table — every run is one connected trace with exact token/cost numbers computed by Langfuse itself from the LLM provider's own response, not estimated locally (see §8).
- **Any activated LLM provider, not just Groq** — `AgentRunner` asks `llm_provider.py` which provider is Activated on the Integrations page and uses that for the whole fleet, falling back to the original Groq env-var chain only on a fresh install with nothing configured.

The four original crews were migrated onto this base as separate, verified steps (not bundled with new capability, to avoid risking existing verdicts): `TruePositiveCrew` → `InvestigationAgent`, `AlertTriageCrew` → `AlertTriageAgent`, `MitreMappingCrew` → `MitreAttackAgent`, `DailyReportCrew` → `DailyReportAgent`. The old crew classes in `investigation/crew.py` are now thin backward-compatible wrappers delegating to these, so nothing calling them had to change.

---

## 2. The 18-agent roster

A VP-level proposal called for 18 agents. 15 are built and running today; the rest remain planned. Every one of them subclasses `AgentRunner` — differences between them are system prompt, tool list, and whether they can propose a live action.

| # | Agent | File | What it does | Can act on a live system? |
|---|---|---|---|---|
| 1 | **Alert Triage** | `alert_triage_agent.py` | Assigns P1–P5 priority with evidence-based reasoning; hands P1/P2 alerts to Investigation over real A2A | No |
| 2 | **Investigation** (was TruePositiveCrew) | `investigation_agent.py` | Multi-step TP/FP forensics — see §3 | No |
| 3 | **MITRE Mapping** | `mitre_agent.py` | Maps an alert to a MITRE ATT&CK tactic/technique + kill chain stage | No |
| 4 | **Daily Report** | `daily_report_agent.py` | Writes the daily SOC report prose from already-aggregated real metrics | No |
| 5 | **Threat Intelligence** | `threat_intel_agent.py` | Campaign attribution — groups alerts into a coordinated campaign only after checking VirusTotal/AbuseIPDB/Yeti and internal history, not by trusting alert text alone | No |
| 6 | **Email Security** | `email_security_agent.py` | Finalizes a phishing/BEC verdict after cross-correlating the sender domain/IP against the rest of the SIEM (has this sender's domain shown up in a login alert since?) | No |
| 7 | **Detection Tuning** | `detection_tuning_agent.py` | Finds detection rules with a high false-positive rate and writes a specific tuning recommendation, backed by real sample FP alerts | No — writes a recommendation for a human to apply in Wazuh/FortiGate |
| 8 | **Incident Commander** | `incident_commander_agent.py` | On a confirmed real threat, joins it to an existing incident for the same entity or opens a new one — the first place SecureZen ties related alerts into one case | No |
| 9 | **Compliance** | `compliance_agent.py` | Reads real detection/response/approval data and writes an audit-evidence report (SOC 2 / ISO 27001 / PCI-DSS style); does not fabricate control-mapping it doesn't actually have | No |
| 10 | **Attack Path** | `attack_path_agent.py` | Reconstructs an incident as a kill-chain graph (deterministic from alert rows) with an LLM narrative on top | No |
| 11 | **Response / SOAR** | `response_agent.py` | The first agent that can change a live system (block an IP) — always goes through the human-approval gate, never fires automatically | **Yes, gated** |
| 12 | **Executive Briefing** | `executive_briefing_agent.py` | Summarizes posture for a non-technical/executive audience | No |
| 13 | **ZEN Chat** (rebuilt) | `zen_chat_agent.py` | The SOC chatbot — see §4 | No |
| 14 | **Threat Hunter** | `threat_hunt_agent.py` | Proactive hypothesis-driven hunting over the SIEM tool library | No |
| 15 | **Detection Engineering** | `detection_engineering_agent.py` | Drafts new detection rule logic from a confirmed incident's pattern | No |

4 of these (Detection Engineering, Incident Commander, Investigation, Response) also expose a real **Agent2Agent (A2A) protocol** endpoint (`a2a_*_agent.py`) — a standardized interface other agents, or future external systems, can call directly instead of going through SecureZen's own REST API. Alert Triage is the first real A2A *client*: once it assigns a P1/P2 alert, it hands the alert off to Investigation over A2A instead of waiting for a human to click "Investigate."

Not yet built: 3 more agents from the original 18-agent proposal remain planned.

---

## 3. Investigation Agent — the core TP/FP forensics engine

This is `TruePositiveCrew`'s direct successor — still the system's deepest per-alert investigation, now on `AgentRunner`.

```
Alert flagged (P1/P2 by Triage, or CRITICAL from the classification pipeline)
        │
        ▼
Investigation Agent reasons about what it needs, then calls (any order, as needed):
  ├── VirusTotal / AbuseIPDB / Yeti  — external reputation on the IOC (IP, URL, or file hash)
  ├── Internal SIEM telemetry (sz_alerts, last 7 days) — has this IOC fired here before?
  └── Entity timeline — what else did this entity do around the same time?
        │
        ▼
Evidence-weighted verdict: TP/FP + P1–P5 priority + a short executive briefing,
written to the activity log and surfaced on the dashboard
```

The key difference from a single LLM call: the model decides whether external reputation data is even needed, whether internal history changes the read (a first-time anomaly reads very differently from the same IOC's fifth appearance this week), and only then commits to a verdict — instead of judging the alert text in isolation.

---

## 4. ZEN Chat — rebuilt onto the same tool library

The SOC chatbot (`zen_chat_agent.py`) was rebuilt for the same reason the crews were: the old version (`database/services/copilot_service.py`) made one LLM call per message with a hardcoded context dump (top 5 CVEs, top 5 threat actors, 10 recent alerts) glued onto *every* prompt regardless of what was actually asked, plus a separate call that tried to get the LLM to free-write raw SQL against the live database — no tenant-safe boundary, and no way to look up something the hardcoded dump didn't cover.

Now ZEN shares the exact same tenant-scoped, read-only tool library (`agents/tools.py`) as Threat Hunter, Investigation, Compliance, and Executive Briefing, and decides for itself which tools a question needs: a general security question needs zero tool calls; "what happened on WS-01 this week" calls the entity-timeline tool; "are we audit-ready" calls the compliance-evidence tool.

---

## 5. Shared tool library and the human-approval gate

`agents/tools.py` is the one real tool library every tool-calling agent draws from — tenant-scoped, read-only SQL functions the model is handed via `bind_tools()`. No agent can mutate state through a tool call. The **only** way any agent changes anything in a live system is `AgentRunner.propose_action()`:

```
Response/SOAR agent decides an action is warranted (e.g. block this IP)
        │
        ▼
propose_action() inserts a row into sz_agent_actions, status='pending_approval'
        │
        ▼
Approval Queue UI — a human reviews the proposed action and evidence
        │
        ├── Approved  → _ACTION_EXECUTORS actually runs it (e.g. blocks the IP)
        └── Rejected  → nothing happens, decision is logged
```

This closed a real gap: before the Approval Queue router existed, a `pending_approval` row had no way to ever actually be approved, rejected, or executed. It also replaces `ml_utils/response_engine.py`'s old hardcoded `if severity == CRITICAL: block_ip()` auto-fire, which bypassed human review entirely and, separately, had been silently broken (a type mismatch meant it never actually ran, swallowed by a bare `except: pass`).

Scope today: `block_ip` is the only real destructive action wired up. Analysis/bookkeeping agents (Triage, Investigation, MITRE, Incident Commander, Compliance, Attack Path, Threat Intel, Detection Tuning) never call `propose_action()` at all — writing an incident record or a tuning recommendation isn't a risky action on a live system, so those write directly.

---

## 6. Resource Governance

Before this, 7 separate usage/capacity limits existed across the codebase with zero shared visibility and no alerting on any of them — confirmed by grep, zero hits for threshold/notify logic tied to any limit. `services/governance_service.py` is a single place that tracks, with real numbers (no estimates):

- AI monthly call/token budget (`ai_monthly_usage`)
- Groq primary-model fallback rate — how often the fleet is quietly dropping to the smaller fallback model because the primary is rate-limited (`ai_call_log`, last 24h — a proxy metric, since Groq exposes no remaining-quota API)
- Login brute-force limiter saturation
- DB connection pool usage (SQLAlchemy engine's own pool stats)
- **Per-agent health** — derived straight from `sz_agent_activity_log`: every agent's real run outcomes (`completed` / `budget_exceeded` / `timeout` / `llm_error` / `max_iterations_reached`)

Explicitly not covered yet (documented honestly rather than faked): VirusTotal/AbuseIPDB per-day call volume against their real free-tier caps.

---

## 7. Where UEBA fits

UEBA (User and Entity Behavior Analytics) is a **separate ML system from the classification pipeline above** — it doesn't judge "is this one alert a TP/FP," it judges "has this user or host's *day* looked unusual compared to how entities like it normally behave." Three phases, same `sz_ueba_*` tables, same per-tenant scope:

- **Phase 1 — Signal builder**: aggregates each entity's daily behavior into `sz_ueba_daily_signals` (login counts/times, data volume, process activity, etc.)
- **Phase 2 — Rule engine**: deterministic, explainable rules scored against those signals (works from day one, zero history needed — e.g. "login at an unusual hour," "unusual data volume")
- **Phase 3 — ML engine**: a real unsupervised `IsolationForest` (scikit-learn, `contamination=0.05`), trained fresh daily per tenant per entity-type (`user`/`host`), blended with the Phase 2 rule score via `max(rule_score, model_score)` into the final `risk_pct`

Documented honestly in the code itself: this fits one model **per entity type**, pooling all users/hosts of that type together — not yet a personal per-entity baseline, since most entities don't yet have the 2+ weeks of individual history a true personal model would need. It also gates the raw percentile score on the model's own anomaly flag (`predict() == -1`), because an ungated percentile rescale always makes *someone* look "most unusual" even on a day where nothing is actually wrong — verified directly in testing before shipping.

See `docs/development/ueba-plan.md` for the full phase-by-phase build spec.

---

## 8. Real monitoring (Langfuse), not a second homegrown system

`AgentRunner.run()` wraps every agent run in one Langfuse trace — this is a real, deployed monitoring tool, not a look-alike database table. `services/langfuse_sync.py` backfills Langfuse's real cost/token numbers back into SecureZen's own tables (`ai_monthly_usage`, `sz_agent_activity_log.cost_usd`) so the DB stays a synced cache of Langfuse's real values, not a second, independently-estimated source of truth. `AgentRunner` no longer computes `cost_usd` itself at all.

---

## 9. Pluggable LLM providers

`services/llm_provider.py` lets an admin activate any OpenAI-compatible provider from Settings → Integrations, not just Groq. Every adapter returns the same `(text, model_used)` shape `call_groq_with_fallback()` already returned, so none of the ~19 existing call sites across the codebase needed to change. If nothing is explicitly activated, the fleet falls back to the original hardcoded Groq env-var chain unchanged — this is additive, not a replacement. This also fixed a real bug: `AgentRunner` previously hardcoded `ChatGroq()` regardless of what was activated on the Integrations page, so activating e.g. OpenAI silently did nothing for the agent fleet.

---

## 10. Where to look for more detail

- `docs/architecture/overview.md` — the per-alert classification pipeline (rules, ML filter, LogEM, Groq) that feeds alerts to this agent layer
- `docs/development/ueba-plan.md` — full UEBA phase-by-phase build spec
- `docs/ai-soc/ml-accuracy.md` — real accuracy numbers for every classification/judgment component in the system
- `docs/ai-soc/architecture.md` — the plain-language version of the whole pipeline, including this agent layer
- `docs/changelog.md` — when each piece of this shipped
