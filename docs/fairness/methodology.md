# Fairness Methodology

## Why this file is short

Fairness/bias auditing matters when an ML model makes decisions that affect people differently based on protected attributes (race, gender, age, etc.) — think lending, hiring, or facial recognition. SecureZen's ML component (`docs/research/ml-filter-design.md`) is an unsupervised anomaly filter operating on network/log features (source IP, rule description, event counts, timestamps) — it doesn't classify people or use demographic attributes as inputs at all.

## Where a fairness concern *could* still arise here

- **Geographic bias via `srccountry`/`dstcountry`**: if the anomaly filter or a rule override effectively treats "traffic from country X" as inherently suspicious independent of actual behavior, that's a fairness-adjacent problem worth catching (over-flagging entire regions rather than actual anomalous behavior). Not currently audited for this specifically — worth a dedicated check if the filter's false-positive rate is ever broken down by source geography.
- **Whose logs get investigated**: if IP-block/response actions (`docs/security/baseline.md`) disproportionately affect certain source ranges due to how private-IP exemptions or asset ownership are defined, that's an operational fairness question, not an ML one.

## Current status

No formal fairness audit has been performed, because the ML use case as currently scoped doesn't classify people or use protected attributes. Revisit this file seriously if the ML component's scope ever expands to user-behavior profiling (e.g. flagging specific employees as risky) rather than event/traffic anomaly detection.
