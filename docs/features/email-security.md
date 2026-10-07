# Email Security

## What it does

Email Security scores phishing and business-email-compromise risk by combining four independent signals — two HuggingFace phishing models, a rule-based heuristic engine, and SPF/DKIM/DMARC authentication checks — into one weighted verdict. The real upgrade over a content-only scorer is what the Email Security agent does on top of that score: it cross-correlates the suspicious email's sender domain and IP against the rest of the SIEM (has this sender's domain also shown up in, say, a failed-login alert a few days later?), and checks sender history — has this address emailed here before, and with what prior verdicts. A first-time sender using urgent financial language is high-risk even with no malicious link or attachment at all, a pattern content-only scoring can never catch on its own.

## Why it matters to a SOC

Phishing content scoring alone judges a message in isolation. Correlating the sender against the rest of the SIEM, and against this sender's own history in the environment, gives much stronger evidence than the email text by itself — the same reasoning the Investigation agent already applies to IOCs elsewhere in SecureZen (a first-time anomaly reads differently from a repeat offender). This also closed the biggest gap found in a real competitor review (Abnormal Security, Microsoft Defender, IRONSCALES, Proofpoint): those products auto-ingest mail via API, while SecureZen previously only accepted manually pasted email content — now closed with a Microsoft Graph mailbox sync worker.

## A real, documented result

The four-signal ensemble weights are documented exactly: BERT phishing model 45%, DistilBERT email model 25%, heuristic engine 20%, SPF/DKIM/DMARC auth failure 10%. Beyond the core verdict, three more advanced features from that same competitor review are built and available but dormant by default: QR/quishing code detection, time-of-click URL re-verification, and auto-remediation — which, even when turned on, only proposes moving/deleting an email through the same human-approval queue the Response/SOAR agent uses, never acting on its own.

---

For how the ensemble, mailbox sync, and dormant features actually work, see [Email Security architecture](../architecture/email-security.md).
