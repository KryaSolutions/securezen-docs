# Alert Classification

## What it does

This is the pipeline that looks at every incoming log line from Wazuh or FortiGate and decides whether it's worth anyone's attention. An unsupervised ML model (Isolation Forest) learns what "normal" looks like for the environment and filters out the bulk of routine traffic before anything more expensive sees it. Deterministic rules catch known attack signatures and brute-force login bursts outright — no AI judgment needed. Whatever's left goes to a local, fine-tuned model (LogEM) first; if it's confidently LOW, that call is trusted, because testing showed its LOW calls are reliable while its other calls aren't. Anything else falls through to an external LLM (Groq) for the real severity call.

## Why it matters to a SOC

A SOC can't have a human read every log line, and a single AI model asked to judge each line in isolation can't see patterns that only exist across many lines, and can be talked out of flagging a known signature the way a rule never can. Splitting the problem this way means each layer only has to be good at the part it's actually suited for — volume filtering, known-pattern matching, or genuine judgment calls — instead of asking one model to be good at all of them at once.

## A real, documented result

A LoRA fine-tune of the local model was tried and tested against real production severities — it confidently called every real HIGH/CRITICAL threat in the test batch "LOW," which is worse than doing nothing. It was shelved rather than shipped, because there isn't enough real high-severity training data yet (genuine attacks are rare by nature). That attempt and its outcome are documented, not hidden.

Accuracy claims aren't taken on faith either: 513 real alerts were reviewed one-by-one by a person to build a human-confirmed ground truth, then scored across all 3 classification systems (LogEM, Groq, and an independent open-weights model, Laya). The result: Groq is clearly the strongest performer (94.9% accuracy, catches 5 of 9 real threats in the set) — meaningfully ahead of the fine-tuned local model (74.3%, 4 of 9) and far ahead of Laya (18.9%, unusable as a filter). This confirms the pipeline's design choice above — trust the local model only when confidently LOW, let Groq handle the real judgment calls — with real measured evidence. Full numbers: `docs/ai-soc/ml-accuracy.md`.

---

For how the pipeline actually works end-to-end — the data model, the rule-override logic, and the deployment topology — see [Architecture Overview](../architecture/overview.md).
