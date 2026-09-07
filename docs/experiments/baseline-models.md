# Baseline Models

## Why this is a short file

A "baseline" implies a labeled comparison point — the accuracy a naive/simple model gets, that a better model needs to beat. This project's ML filter is unsupervised with no fixed labeled dataset (`docs/research/ml-filter-design.md`), so there isn't a conventional train/test baseline to report.

## The closest thing to a baseline that actually exists

A rule_level-tier proxy check: comparing the ML filter's drop rate against Wazuh's own `rule_level` severity tiers, on real live data. Result: MEDIUM-tier events had a *higher* drop rate (93.5%) than LOW-tier (80.7%) — not because the filter is wrong, but because MEDIUM was simply the more common label (45,937 vs 20,280 events), so more of it looked statistically normal. This isn't a baseline in the ML sense, but it's the real check that exists for "does this filter's behavior make sense relative to an existing severity signal."

## For the local/external LLM classifiers

The closest baseline is "the unmodified base model's behavior before any prompt/rule-override fix" — e.g. the local classifier's 8.0% real accuracy before the fix described in `docs/ai-soc/reliability-log.md` item 32 is the "before" state that later fixes are measured against.
