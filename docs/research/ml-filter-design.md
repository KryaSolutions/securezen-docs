# ML Anomaly Filter — Design Rationale & Validation

This expands on `docs/architecture/overview.md` §3 with the full reasoning, for anyone who needs to defend these choices (design review, interview, audit) rather than just know what they are.

## Why Isolation Forest, specifically

The candidates were the standard unsupervised anomaly-detection family: One-Class SVM, Local Outlier Factor (LOF), DBSCAN, Autoencoders, Isolation Forest.

The deciding constraints, in order:

1. **No ground truth, no fixed dataset.** This isn't "split data into train/test and measure accuracy" — there is no labeled attack/benign dataset to train against. The model has to learn "what's normal" purely from the shape of live traffic, online, as it arrives (`.update()` then `.score()` per event, no retraining pass).
2. **Runs continuously on CPU, no GPU.** Rules out Autoencoders as the primary mechanism — feasible, but heavier than justified here.
3. **Mixed categorical + continuous features**, no natural distance metric between them. Distance/density-based methods (LOF, DBSCAN, One-Class SVM) all fundamentally rely on "how far apart are these two points" — that's a strong, often wrong assumption when your features are things like `srcip`, `country`, `device`, `rule_description` mixed with counts and timestamps.
4. **The actual shape of the problem** — real attacks are rare, everything else is common. Isolation Forest's core assumption ("anomalies are few and different, so they isolate in fewer random partitions than normal points") maps directly onto that, rather than needing a notion of density or distance to work.
5. **Scalability**: O(n log n) vs. O(n²) for the distance-based methods, at the event volume this pipeline actually sees.

None of the alternatives is "wrong" in general — they're standard tools for other shapes of anomaly-detection problem. They just don't fit *this* problem's constraints as well.

## How to explain "how I used ML in this project" when your only prior ML experience is train/test/accuracy

The honest framing: classic supervised ML (what most courses teach) assumes you already have labeled correct answers and are trying to predict them on new data. This project has neither labels nor a fixed dataset — it's **unsupervised, online learning**. The model isn't being told "this is an attack, this isn't"; it's continuously building its own notion of "normal" from the traffic itself, and flagging anything that doesn't fit. There's no train/test split because there's no fixed data to split — the "test set" is literally whatever traffic shows up next, forever.

## What the filter actually decides — and what it doesn't

The filter answers **"is this statistically unusual relative to what this system has seen so far?"** — not **"is this severe?"** and not **"is this an attack?"**. Those are answered downstream (rule overrides for known-shape threats, then the LLM classifiers for everything else).

This distinction showed up concretely in a rule_level-tier proxy check on real data: Wazuh-labeled MEDIUM-severity events had a *higher* drop rate (93.5%) by the ML filter than LOW-severity events (80.7%) — not because MEDIUM events are less important, but because MEDIUM was simply the far more common label in this traffic (45,937 events vs. 20,280 LOW), so more of them looked "normal" to a model learning from volume. Severity label and statistical rarity are genuinely different axes.

## How the filter's real-world accuracy was validated

No automated ground-truth accuracy score is possible for this filter — the only dataset that could have supported one (`sz_ground_truth_labels`, cross-referenced against filter decisions by `event_id`) had its link severed by an earlier full `events`/`verdicts` table wipe (see `docs/ai-soc/reliability-log.md`), and attempting to re-link by exact raw-log text match found zero matches, since the wipe removed the very rows being matched against.

Substituted a manual validation methodology instead: a dedicated `sz_ml_filter_validation` table, populated with a stratified random sample (8 each: LOW-kept, LOW-dropped, MEDIUM-kept, MEDIUM-dropped — 32 total), each row manually reviewed and recorded with a human verdict. Result: zero missed real threats found in the sample. This is a smaller, human-reviewed sample, explicitly not a comprehensive statistical accuracy figure — stated honestly, not inflated, when reporting it.

This is also the right general answer for "how do you know an unsupervised model is working" when there's no ground truth: don't fabricate a metric you can't actually support — build the smallest defensible human-in-the-loop check that answers the real question ("are we missing real threats"), and be explicit about its scope.
