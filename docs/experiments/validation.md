# Validation Methodology

## The problem this solves

There's no automated way to score this system's real-world accuracy — the dataset that could have supported one (`sz_ground_truth_labels`, cross-referenced by `event_id` against filter decisions) had its link severed by an earlier full `events`/`verdicts` table wipe, and a fallback re-link attempt by exact raw-log text match found zero matches (the wipe removed the rows being matched against too). Full story: `docs/ai-soc/reliability-log.md`.

## What was built instead

A dedicated `sz_ml_filter_validation` Postgres table:

```sql
CREATE TABLE sz_ml_filter_validation (
    id BIGSERIAL PRIMARY KEY, event_id BIGINT NOT NULL,
    rule_level BIGINT, rule_description TEXT, raw_log TEXT,
    got_verdict BOOLEAN NOT NULL, verdict_severity TEXT,
    human_verdict TEXT, human_notes TEXT,
    sampled_at TIMESTAMPTZ DEFAULT NOW(), reviewed_at TIMESTAMPTZ, reviewed_by TEXT
);
```

Populated with a **stratified random sample**: 8 each of LOW-kept, LOW-dropped, MEDIUM-kept, MEDIUM-dropped (32 total) — stratified specifically so both severity tiers and both filter decisions (kept vs. dropped) are represented, rather than a plain random sample that could miss an entire category by chance. Each row manually reviewed by a human and recorded: `correct_drop` (13), `correct_keep` (8), `unnecessary_keep` (7), `not_applicable` (4 — VirusTotal rate-limit noise).

**Result**: zero missed real threats in the sample.

## The honest scope of this

32 samples is a defensible, human-reviewed spot-check — not a statistically powered accuracy estimate. State it that way whenever it's cited. The full design rationale for why this substitution was necessary (and why fabricating a fake accuracy percentage would have been worse than admitting the limitation) is in `docs/research/ml-filter-design.md`.
