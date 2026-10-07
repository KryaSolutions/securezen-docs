# ZEN Chat

## What it does

ZEN Chat is SecureZen's SOC chatbot — a conversational way to ask questions about the environment instead of navigating dashboards. It's been rebuilt onto the same shared, tenant-scoped, read-only tool library (`agents/tools.py`) used by the Investigation, Threat Hunter, Compliance, and Executive Briefing agents, and now decides for itself which tools, if any, a given question actually needs.

## Why it matters to a SOC

The previous version glued the exact same hardcoded context — top 5 CVEs, top 5 threat actors, 10 recent alerts — onto *every* message regardless of what was asked, and separately let the LLM free-write raw SQL against the live database with no tenant-safe boundary. That meant irrelevant context bloated simple answers, and anything the hardcoded dump didn't happen to cover was simply unreachable. Letting the model choose from a fixed set of tenant-scoped tools instead means a general security question costs zero tool calls, while a specific question gets the specific data it needs — safely, since no tool can write or mutate anything.

## A real, documented example

A general security question needs no tool calls at all. Asking "what happened on WS-01 this week" calls an entity-timeline tool. Asking "are we audit-ready" calls a compliance-evidence tool. Each question only pulls in the data it actually requires, instead of every question paying for the same fixed context dump.

---

For how the shared tool library and the rebuilt agent fit into the fleet, see section 4 of [SecureZen Agentic AI Architecture](../architecture/agentic_architecture.md).
