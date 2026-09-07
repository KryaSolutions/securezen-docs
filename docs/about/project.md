# About SecureZen

**Product by**: KRYA SOLUTIONS PRIVATE LIMITED

SecureZen is an AI-augmented SOC platform: it ingests real SIEM/security logs, filters out routine noise with an unsupervised ML anomaly detector, applies deterministic rules for known-shape threats, classifies everything else with a local LLM backed by an external LLM fallback, and surfaces the result on a triage dashboard — with an on-demand CrewAI forensic layer for deeper investigation.

Full technical detail starts at `docs/architecture/overview.md`.

## Documentation ownership

This documentation set was restructured in August 2026 after an audit found large sections describing an obsolete architecture (SQLite, UDP syslog ingestion, a BERT classifier, a 6-agent CrewAI pipeline with SMTP notifications) that no longer matches the running system. See `docs/CHANGELOG.md` for what actually shipped in its place.

Keeping this accurate going forward is easier than the one-time cleanup was: when a doc's concrete claim (a file path, an endpoint, an env var) stops matching the code, fix the doc in the same change that changes the code, rather than letting it drift and requiring another full audit later.
