# Compliance & Reporting

## What it does

Two separate pieces cover the "can we prove this" side of the SOC.

The **Compliance agent** reads real detection, response, and human-approval data already in the system and writes a periodic audit-evidence report, styled around what SOC 2 / ISO 27001 / PCI-DSS style audits actually ask for. It deliberately does not invent specific numbered control mappings (e.g. claiming "this satisfies PCI-DSS 10.2.1") it doesn't actually have evidence for — that's a scope limit the agent holds to on purpose, not a missing feature.

The **Daily Report** is the automated daily SOC summary. It now reads real structured per-section JSON rather than re-parsing generated prose, includes a real Agent Fleet Activity section reflecting actual agent run data, and its PDF, email, and case-report exports are all real rather than partially stubbed.

## Why it matters to a SOC

An auditor doesn't want a narrative that sounds confident — they want evidence that traces back to something real. An agent that writes a plausible-looking control mapping it can't actually back up would be worse than one that says "not covered yet," because it would quietly undermine trust in everything else the report claims. On the daily-report side, a report built from the same agent activity that actually ran (not a rewritten summary of it) means what a SOC lead reads each morning reflects what the fleet actually did overnight.

## A real, documented detail

The Daily Report overhaul also fixed the Agent Fleet Activity section specifically so it reflects real agent run data, and made the PDF/email/case-report export paths real — previously some of those exports were only partially stubbed.

---

For the Compliance agent's role in the 18-agent fleet, see the roster table and section 2 of [SecureZen Agentic AI Architecture](../architecture/agentic_architecture.md).
