# Agent Fleet

## What it does

Once the classification pipeline flags an alert as real, a fleet of specialized AI agents takes over to work out what it actually means. 15 agents (of an 18-agent plan) are built today — Alert Triage, Investigation, MITRE Mapping, Daily Report, Threat Intelligence, Email Security, Detection Tuning, Incident Commander, Compliance, Attack Path, Response/SOAR, Executive Briefing, ZEN Chat, Threat Hunter, and Detection Engineering — all built on one shared foundation (`AgentRunner`). Each agent is handed a list of real tools and reasons for itself about which ones a given alert actually needs, rather than following a fixed script.

## Why it matters to a SOC

Real tool-calling means an agent like Investigation decides for itself whether it needs outside reputation data on an IP or file hash, and whether this exact thing has shown up in the environment before — a first-time anomaly and a repeat offender get treated differently, instead of every alert getting the same canned lookup. The one place this autonomy stops is anywhere it could touch a live system: Response/SOAR is the only agent that can propose blocking an IP, and it always goes through a human-approval gate before anything actually executes — it never fires on its own. Every agent's run is also monitored through a real, self-hosted observability tool (Langfuse), giving exact token/cost numbers computed from the LLM provider's own response rather than a homegrown estimate.

## A real, documented result

Detection Tuning actively hunts for detection rules that generate false positives rather than waiting to be told — in this environment it found one rule that was wrong 100% of the time across 195 alerts, with the specific sample evidence to back it up rather than a vague "this rule seems noisy."

---

For how the agent framework actually works — the shared tool library, the A2A protocol, and the approval-gate mechanics — see [Agentic Architecture](../architecture/agentic_architecture.md).
