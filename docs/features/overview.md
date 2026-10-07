# Features Overview

SecureZen doesn't run one big model over every log line. It uses several different AI/ML techniques, deliberately, because alert triage isn't one question — it's many different kinds of questions stacked on top of each other: is this log line even worth a second look, is it a known attack signature, is it actually dangerous, is it part of something bigger, has this user's whole day looked unusual, and did the AI actually get it right? Each of those is answered by a different tool, chosen for what it's actually good at. The pages below describe each piece from the outside — what it does and why it matters to a SOC — without re-explaining the internals.

## Alert Classification

The core pipeline that decides, for every incoming log line, whether it's a real threat (true positive) or noise (false positive). An unsupervised ML filter drops most routine traffic before anything expensive ever looks at it, deterministic rules catch known-shape attacks with no ambiguity, and a local fine-tuned model handles the cheap, reliable calls while an external LLM handles the rest. See [Alert Classification](./alert-classification.md).

## Agent Fleet

Once an alert looks real, a 15-agent fleet (of an 18-agent plan) takes over — investigating, mapping it to MITRE ATT&CK, correlating it against threat intel, merging related alerts into one incident, and, for the one agent allowed to touch a live system, proposing an action a human has to approve first. See [Agent Fleet](./agent-fleet.md).

## Behavior Analytics (UEBA)

A separate ML system that asks a different question than the pipeline above: has this specific user or host's whole *day* looked unusual, even if nothing they did would have tripped a single alert on its own. See [Behavior Analytics](./ueba.md).

## Blast Radius / Case Explorer

Groups related alerts into cases and graphs the entities (IPs, users, hosts) they share, so a lateral-movement pattern spread across separately-alerted events becomes visible instead of hidden. See [Blast Radius](./blast-radius.md).

## Email Security

Phishing/BEC detection that cross-correlates a suspicious email's sender domain and IP against the rest of the SIEM, instead of judging the email's content in isolation. See [Email Security](./email-security.md).

## Forensic Analysis

A real embedded OpenSearch Discover view, deep-linked to a specific alert's time window and host/user, for raw log-level digging beyond what the alert's own summarized context shows. See [Forensic Analysis](./forensic-analysis.md).

## Compliance & Reporting

Audit-evidence reporting built from real detection/response/approval data, plus the daily SOC report with real structured data and real PDF/email/case-report exports. See [Compliance & Reporting](./compliance-reporting.md).

## ZEN Copilot

The SOC chatbot, rebuilt to decide for itself which real, tenant-scoped tools a question needs, instead of dumping the same fixed context into every answer. See [ZEN Copilot](./zen-copilot.md).

---

For the full technical picture — pipeline internals, data model, deployment topology, and the agent framework's architecture — start at [Architecture Overview](../architecture/overview.md).
