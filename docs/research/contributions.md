# Design Contributions

Specific, non-obvious choices made in this project that are worth calling out on their own — not because they're academically novel, but because each one solved a real problem this project actually hit.

**Denormalized verdict context** — copying event context (IPs, country, device, rule description) directly onto the `verdicts` row instead of requiring a join back to `events` for every read. Small idea, but it's what let the dashboard and every downstream consumer stop needing to know anything about the raw ingestion schema.

**Escalate-only rule overrides** — deterministic rules (signature match, repeat-login count) can raise a verdict's severity but never lower one an LLM already set. This means the rule layer can't be used, even accidentally, to suppress a real AI-flagged threat — a property that matters for auditability as much as accuracy.

**Trust-tiered local/external LLM split** — rather than trusting a local model's full output, only its confidently-LOW calls are trusted; anything else always gets a second opinion from a more capable external model. This came directly out of measuring the local model's actual failure mode (unreliable non-LOW calls, ~44% unparseable), not a generic best practice.

**Manual validation in place of a fabricated metric** — when the automated ground-truth path was severed by a data wipe, the response was a defensible, honestly-scoped manual review (`docs/experiments/validation.md`), not an invented accuracy percentage. The methodology itself — stratify by both severity and filter decision, review by hand, report the scope honestly — is the actual contribution here, independent of the specific numbers it produced.

**Doc-drift diagnosis as a repeatable method** — the docs cleanup this file is part of (`docs/about/project.md`) worked by cross-referencing every concrete doc claim against the current code, not by trusting the doc's own framing. That method — verify claims against code, not against other docs — is reusable the next time this doc set needs an audit.
