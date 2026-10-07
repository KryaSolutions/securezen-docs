# UEBA (User & Entity Behavior Analytics)

## What it does

UEBA is a separate ML system from the alert classification pipeline and the agent fleet. It doesn't ask "is this one alert a threat" — it asks "has this user's or host's whole *day* looked unusual compared to how entities like it normally behave." It runs in three phases against the same per-tenant data: a signal builder that aggregates each entity's daily behavior (login counts/times, data volume, process activity, and more), a deterministic rule engine that works from day one with zero history needed (e.g. "login at an unusual hour," "unusual data volume"), and a real unsupervised machine-learning model — scikit-learn's IsolationForest — trained fresh every day, per tenant, per entity type (`user`/`host`), blended with the rule score into a final risk percentage.

## Why it matters to a SOC

Signature and rule-based alerting only catches what already looks like a known-bad pattern. UEBA catches the things a signature never would: an account's behavior drifting from normal over a whole day even when no single event in that day would trip a rule on its own. Because the rule engine works with zero history, it starts producing explainable findings immediately rather than needing weeks of baseline data before it's useful at all.

## A real, documented result

The system is honest about two real design choices rather than hiding them. First, today's ML model fits one model per entity type, pooling all users (or all hosts) of that type together — not yet a true personal per-entity baseline, since most entities don't have the 2+ weeks of individual history that would require. Second, the model's raw anomaly score is gated on its own `predict()` flag rather than rescaled by percentile alone: an earlier version that used percentile rescaling alone was verified in testing to always make *someone* look "most unusual," even on a day where nothing was actually wrong. Gating on the model's own flag fixed that.

---

For how the signal builder, rule engine, and ML model actually work together, see [Agentic Architecture §7](../architecture/agentic_architecture.md#7-where-ueba-fits).
