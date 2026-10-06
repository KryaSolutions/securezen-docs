# Email Security

> **Expanded — October 2026.** Built against a real competitor gap analysis (Abnormal Security, Microsoft Defender, IRONSCALES, Proofpoint) — closing specifically the gaps that analysis found: manual copy-paste-only intake, zero behavioral/identity signal, no QR/time-of-click/remediation coverage.

## The verdict: a real weighted ensemble, not one model

`backend/app/routers/email_routes.py` combines four independent signals into one phishing score — this is the clearest genuine multi-signal ensemble in the codebase (most other "AI" components in SecureZen are a single model or a single LLM call):

| Signal | Weight | Source |
|---|---|---|
| BERT phishing model | 45% | `ealvaradob/bert-finetuned-phishing` via HuggingFace Inference API |
| DistilBERT email model | 25% | `cybersectony/phishing-email-detection-distilbert_v2.4.1` via HuggingFace Inference API |
| Heuristic engine | 20% | rule-based scoring (urgency language, mismatched links, etc.) |
| Auth failure (SPF/DKIM/DMARC) | 10% | header-level authentication check |

## Intake: from manual copy-paste to live mailbox scanning

The single biggest gap the competitor research found: every competitor auto-ingests mail via API; SecureZen only accepted manually pasted email content. Closed by:

- **`services/graph_mail_client.py`** — a Microsoft Graph client-credentials client (same no-SDK, no-op-safe pattern as the existing Sophos client) that lists new inbox messages and fetches raw MIME.
- **`services/email_mailbox_sync.py`** — a background worker that polls configured mailboxes and runs every new message through the real analysis pipeline automatically. No-ops unless `GRAPH_TENANT_ID`/`CLIENT_ID`/`CLIENT_SECRET` and `EMAIL_SECURITY_MONITORED_MAILBOXES` are actually configured.
- `analyze_email()`'s ~500-line body was extracted into a plain `run_email_analysis()` function so the API route and the mailbox sync worker share the exact same pipeline instead of two copies drifting apart.

## Behavioral/identity signal: sender history

The second gap: zero behavioral or identity signal, which every competitor's identity graph relies on. `email_security_agent.py` adds a **sender_history** tool that flags first-time senders — a first-time sender using urgent financial language is high-risk even with zero malicious link or attachment, a pattern pure ML/heuristic scoring on the message content alone can never catch. The Email Security agent (one of the 18-agent fleet, see `docs/architecture/agentic_architecture.md`) cross-correlates the sender domain/IP against the rest of the SIEM — has this sender shown up in a login alert since? — before finalizing a verdict, rather than judging the email in isolation.

## QR code, time-of-click, and auto-remediation (built, dormant by default)

The last 4 features from the competitor research, all built but inactive until explicitly turned on — safe to ship ahead of activation:

- **QR code (quishing) detection** (`services/qr_scanner.py`) — decodes QR codes in inline email images via OpenCV and feeds any decoded URL into the existing IOC pipeline. Off by default (`EMAIL_SECURITY_ENABLE_QR_SCAN`); fails soft if OpenCV isn't installed in a given deployment.
- **Time-of-click URL protection** (`services/click_protection.py`, `GET /api/email/click-check`) — an HMAC-signed redirect that re-verifies a URL's reputation at the moment it's clicked, not just once at analysis time (matches Microsoft Safe Links). Wired into the downloadable report today (`EMAIL_SECURITY_ENABLE_TIME_OF_CLICK`); rewriting links inside mail actually delivered to a live mailbox is further work once the mailbox connector is fully active. Fails **closed** (blocks) on signature tampering or a failed reputation re-check.
- **Auto-remediation** — when `EMAIL_SECURITY_ENABLE_AUTO_REMEDIATION` is on, mailbox sync calls `EmailSecurityAgent.propose_action()` for a MALICIOUS verdict, writing into the same `sz_agent_actions` human-approval table the Response/SOAR agent uses — not calling `graph_mail_client.move_message()` directly. Nothing auto-deletes an email without a human approving it first, even with the flag enabled.

## Where to look for more detail

- `docs/architecture/agentic_architecture.md` §2 — the Email Security agent's place in the wider fleet
- `docs/changelog.md` — when each phase shipped
