# FAQ & Troubleshooting

This page collects the questions that come up most often when running or evaluating SecureZen,
with honest answers grounded in real incidents and real design decisions — not generic
troubleshooting advice. If a question isn't here, the full incident-by-incident history is in
`docs/ai-soc/reliability-log.md`.

---

### A container's health check passes, but is that actually telling me anything?

It depends on when you're asking. For a while, the answer was genuinely no: both the main
backend's and the AI worker's health-check endpoints always reported "healthy" regardless of
what was actually happening underneath — the backend's check never even tried a database query,
and the AI worker's check correctly calculated whether it was stuck but still always returned a
success response code either way. On top of that, Docker's automatic-restart safety net wasn't
even watching these checks — it only knew to restart the database container if that broke.

This has since been fixed: the backend's health check now runs a real database query and
honestly reports failure if it can't reach it, the AI worker's check now actually fails (not just
notes "stale" in the response body) when it's been stuck for over a minute, and both are wired
into Docker's automatic restart. If you're on a build from before this fix, treat a "healthy"
status with suspicion and check the actual logs.

---

### I changed a setting in `.env` but it doesn't seem to be taking effect — why?

This has a known, specific root cause. Several files reload the `.env` file when imported, and
were configured to let it overwrite *any* setting already in place — including values Docker had
already set correctly for that environment, like the real database address. Because Python loads
a file like this just by importing it, one unrelated part of the code importing another was
enough to silently trigger an overwrite, with no obvious connection between the two. The visible
symptom in one real incident was the alert-sync process failing to write new alerts to the
dashboard, with a database-address error, even though nothing about the database address had been
touched directly.

The fix (now applied in four files) changes the behavior so `.env` can only fill in values that
aren't already set, never overwrite ones that are. If you hit something that looks like this in a
newer file that wasn't part of that fix, it's the same pattern to look for.

---

### My backend container shows "unhealthy" right after a deploy, even though the app seems to work fine. What's going on?

This happened for real after a fix that corrected which port the backend's health check looks at.
The container kept reporting "unhealthy" anyway, and a normal restart didn't help. The cause: the
deployment tool doesn't always notice when *only* the health-check or command directive changed
(as opposed to actual application code) — so it kept running the old, already-broken health check
inside the container instead of picking up the fix.

The fix is to force a full rebuild of that specific container rather than just restarting it:

```bash
docker compose build backend
docker compose up -d --force-recreate backend
```

`--force-recreate` is the important part — a plain `docker compose up -d` can no-op on a
healthcheck-or-command-only change and leave the stale container running with misleading health
status.

---

### I ran `docker compose up -d` after a code change and nothing seems to have updated — why?

If the change only touched a healthcheck or command directive (not the application code itself),
`docker compose up -d` can legitimately no-op and leave the old container running. The fix is to
rebuild the specific service and force recreation:

```bash
git pull origin stage   # or prod, on that server
docker compose build ml-worker   # or backend, whichever changed
docker compose up -d --force-recreate ml-worker
```

More generally: restarting a running container in this project does not pick up code changes —
only a full rebuild does. This has bitten the project more than once, including one case where a
large refactor was "verified" by restarting the server, which silently re-tested the old,
unchanged code the whole time; the real problem (a routing bug that would have taken down two
major sections of the app) was only caught once a genuine rebuild was done.

---

### How many containers should actually be running, and what are they?

12 total: 4 core application services (`securezen-db` on Postgres, `backend`, `ml-worker`,
`frontend`), 2 for Forensic Analysis/OpenSearch, and 6 for the self-hosted Langfuse monitoring
stack. Check with `docker compose ps` — all 12 should show healthy. If you're only expecting the 4
core app containers, the other 8 aren't optional extras; they're OpenSearch and Langfuse, and
their absence means forensic search or AI observability tracing isn't running.

---

### Enabling the local AI model made the whole app unresponsive, including login. Why?

This happened for real: the local, fine-tuned classification model (LogEM) was enabled on a
server that also runs several other unrelated services. CPU usage on that box jumped to 97%+, and
the login endpoint became slow enough to look completely stuck.

The fix was not to make the model lighter — it was to remove the local-model configuration
(`LOGEM_MODEL_PATH`) from that server entirely, which brought CPU back to normal immediately. The
project now enforces a strict split: the demo/production server is frozen and Groq-only, with no
experimentation of any kind, and the local model only runs on a separate test/candidate server
that has capacity to spare. If you're deciding whether to enable the local model on a given box,
the rule is simple: don't run experimental AI workloads on the server a live client demo depends
on, regardless of how efficient any future version of the model is.

---

### LogEM (the local model) and Groq (the external model) sometimes give different answers on the same log. Is that a bug?

No — it's the intended design, not a disagreement to be "fixed." The pipeline only trusts LogEM's
verdict outright when it confidently says LOW; ground-truth testing showed its LOW calls are
reliable. Anything LogEM is less confident about, or flags as anything other than LOW, is
deliberately not trusted on its own and gets escalated to Groq, the more capable external model,
for the real severity call. So seeing LogEM and Groq land on different answers for a non-LOW case
is exactly what's supposed to happen — it's the escalation path working, not two models
contradicting each other on equal footing.

---

### Can I use a different LLM provider instead of Groq?

Yes. `services/llm_provider.py` lets an admin activate any OpenAI-compatible provider from
Settings → Integrations, not just Groq. Every provider adapter returns the same response shape
Groq's own call path already used, so switching providers doesn't require touching the ~19
existing call sites across the codebase that call the LLM. If nothing is explicitly activated in
Integrations, the system falls back to the original hardcoded Groq environment-variable chain
unchanged — this is purely additive, not a replacement of the default path.

---

### What happens if an AI agent gets a verdict wrong, or proposes the wrong action?

For anything that actually changes a live system — currently, blocking an IP is the only such
action wired up — no agent can act unilaterally. The Response/SOAR agent can only *propose* an
action, which is inserted as a pending row awaiting human review. A human then approves or rejects
it through the Approval Queue; only on approval does the system actually execute it. Rejecting it
means nothing happens, and the decision is logged either way.

Agents that only produce analysis or bookkeeping — Triage, Investigation, MITRE Mapping, Incident
Commander, Compliance, Attack Path, Threat Intel, Detection Tuning — don't go through this
approval gate, because writing an incident record or a tuning recommendation isn't a destructive
action against a live system. The underlying principle is the same one that shows up elsewhere in
the project: a wrong AI output should be reviewable and reversible before it has any real-world
effect, not something that fires automatically.

---

### Why does SecureZen struggle to classify my Office 365 or Windows Security alerts well?

This is a known, documented, and currently unfixed gap. Every Office 365 event ever ingested
(18,820 of them, across every category) was found to have a completely empty log body — only the
category label survives, not the actual event details (who did it, from where, what device, what
changed). The same is true for native Windows security alerts like "Domain Admins Group Changed."
Every other log source checked (firewall traffic, file integrity checks, server command history)
does carry real detail — this gap is specific to these two connectors.

The practical consequence: a real Office 365 account takeover and a routine, harmless Office 365
login currently look identical to any analyst or any AI looking at this data, because the
distinguishing information was never captured at ingestion in the first place. No amount of
better prompting, smarter models, or fine-tuning can fix this — it has to be fixed at the
ingestion connector itself, by capturing the real event details that Microsoft's own audit log
already provides. This is tracked as an open roadmap item, not yet started.

---

For the full incident-by-incident history behind these answers — including items not summarized
here — see `docs/ai-soc/reliability-log.md`.
