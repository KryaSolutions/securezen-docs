# Blast Radius — Case Explorer

## What it does

Blast Radius groups recent HIGH and CRITICAL alerts into "cases" — either a whole campaign Threat Intelligence already linked together, or a single alert standing on its own — and then graphs those cases alongside the entities (IP, user, host) they involve. Two cases that share nothing directly still end up visually connected *through* a shared entity, which is exactly the lateral-movement signal a flat alert list never shows. It was built in six stages: the shared-entity graph engine, a force-directed canvas to view it, a filterable case list, detail panels wired into Attack Path, a timeline replay scrubber, and a 6-tier verdict taxonomy (Malicious, Suspicious, Inconclusive, False_positive, Benign, Degraded) with a split-view case report.

## Why it matters to a SOC

An attacker rarely touches just one thing, but the classification pipeline produces one verdict per alert, so related activity can sit scattered across separately-triaged events with nothing tying them together. Blast Radius makes that connection visible directly: clicking a case re-centers the graph on it, the timeline scrubber replays how a cluster of cases actually grew over time, and every case or entity panel can open straight into Attack Path instead of requiring a separate manual lookup.

## A real, documented result

At launch, verified against real data, Blast Radius correctly grouped 150 alerts into cases and found 30 entities touching more than one case — with one user account alone appearing across 19 separate cases. Verdicts are also honest about their own evidence: a case only shows Malicious or Clean when a real agent investigation actually ran against it, otherwise it shows a severity-based Suspicious/Inconclusive estimate rather than a fabricated confident verdict.

---

For how the graph engine, case verdicts, and timeline replay actually work, see [Blast Radius — Case Explorer architecture](../architecture/blast-radius.md).
