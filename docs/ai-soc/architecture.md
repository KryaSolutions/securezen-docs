# SecureZen, In Plain Language

> **Expanded — October 2026** to cover the full picture: the original per-alert pipeline, plus everything built on top of it since (the agent fleet, UEBA, and the feedback loop that measures whether any of this is actually working).

The technical version of the pipeline is `docs/architecture/overview.md`; the technical version of the agent fleet is `docs/architecture/agentic_architecture.md`. This page is all of it, described the way you'd explain it to a non-engineer.

**The problem**: a SOC gets thousands of log lines a day. Almost all of them are routine. A human can't read all of them, and treating every single one as equally important either burns out analysts (too much noise) or misses real threats (they get lost in the noise). SecureZen uses several *different* AI/ML techniques — not one big model — because each part of this problem is a different kind of question, and one tool isn't good at all of them.

---

## Part 1 — The core pipeline: deciding if one alert is real (TP) or noise (FP/benign)

This runs on every incoming log line, automatically, with no human involved until the end.

1. **A cheap first pass, not AI** — an unsupervised ML model (Isolation Forest) watches the stream and learns what "normal" looks like for this specific environment, over time, without ever being told what an attack looks like. Anything that doesn't fit gets a closer look; everything else is dropped before it ever reaches anything expensive. This is the main false-positive *volume* filter — it's what stops 95%+ of routine traffic from ever reaching an AI model at all.
2. **A safety net, not AI either** — separately, if a log matches a known attack signature by name, or the same account has too many failed logins in a day, that's escalated automatically by a plain rule. No AI judgment call is needed for something a `COUNT(*)` query can already answer correctly, and a rule can never be talked out of flagging a known signature the way an LLM sometimes can.
3. **A cheap AI opinion, checked, not trusted blindly** — what's left goes to a local, fine-tuned AI model (LogEM). If it's confidently LOW, that's trusted — ground-truth testing showed its LOW calls are reliable. If it says anything else, or isn't confident, that verdict isn't trusted on its own, because the same testing showed its non-LOW calls are not reliable yet.
4. **A stronger AI opinion, when needed** — anything the local model didn't confidently clear goes to a more capable external AI model (Groq) for the real severity call.
5. **The result, with context attached** — whatever severity comes out gets written down along with everything a human would need to judge it themselves (source IP, country, device, which rule matched), not just a bare severity label.

**Why this is built as a pipeline and not "just ask an AI"**: an AI reading one log line at a time can't see a pattern that only exists across many log lines (a slow brute-force attempt), and can be talked into second-guessing a known attack signature a rule would never miss. Rules and AI are used for what each is actually good at.

---

## Part 2 — When a real threat shows up: the agent fleet digs deeper

Steps 1–5 above produce a severity label fast, for every alert. But a severity label alone doesn't tell you *why* it's dangerous, whether it's part of something bigger, or what to actually do about it. That's what the agent fleet is for — 15 specialized AI agents (of an 18-agent plan), each built on one shared foundation (`AgentRunner`), each handed a specific set of real tools and told to reason about which ones it actually needs:

- **Alert Triage** assigns P1–P5 priority and hands the most urgent alerts straight to Investigation — agent to agent, no human has to notice and click a button first.
- **Investigation** (the system's deepest per-alert check) decides for itself whether it needs outside reputation data (VirusTotal/AbuseIPDB/Yeti) on the IP/URL/file hash involved, and whether this exact thing has shown up in this environment before — a first-time anomaly and a repeat offender get judged differently.
- **Threat Intelligence** only calls a group of alerts a "coordinated campaign" after checking real threat intel and internal history — not by trusting whatever story the alert text alone suggests.
- **Email Security** checks whether a suspicious email's sender domain or IP shows up anywhere *else* in the SIEM (like a login alert three days later) before finalizing a phishing verdict — judging the email in isolation was the old, weaker approach.
- **Detection Tuning** actively looks for *rules* that cause false positives — real example found in this environment: one rule was wrong 100% of the time across 195 alerts, another 97.4% of the time across 1,196 alerts — and writes a specific fix recommendation with real sample evidence, not just "this rule seems noisy."
- **Incident Commander** notices when several alerts are really the same attack on the same entity and merges them into one incident, instead of showing an analyst five separate alerts for one event.
- **Response/SOAR** is the only agent allowed to actually touch a live system (blocking an IP) — and even then, it never acts on its own. It proposes the action, and a human has to approve it first.
- **Compliance, Attack Path, Executive Briefing, MITRE Mapping, Daily Report, ZEN Chat, Threat Hunter, Detection Engineering** round out the fleet — turning the same underlying real data into audit evidence, kill-chain graphs, plain-English briefings, and a chatbot that only looks up what a question actually needs instead of dumping the same fixed context into every answer.

Every agent's work is logged automatically and shows up in the Agent Fleet Activity feed and the Daily Report — nothing an agent does is invisible.

---

## Part 3 — Watching behavior over time, not just judging one alert at a time (UEBA)

Everything above judges one alert (or one small group of related alerts) at a time. UEBA asks a different question: **has this specific user or host's whole day looked unusual**, even if no single thing they did would have triggered an alert on its own? This is a second, separate ML system:

1. Each entity's day gets summarized into real signals (login times/counts, data moved, processes run).
2. A set of plain, explainable rules scores obviously-unusual patterns (login at 3am, unusual data volume) — this works from day one, no history needed.
3. A real unsupervised ML model (another Isolation Forest, trained fresh every day) scores how unusual an entity's day is *compared to other similar entities* right now, and the stronger of the rule-based and ML-based scores wins.

This catches the kind of slow, low-and-slow behavior that never trips a single alert threshold but adds up to something worth a human's attention.

---

## Part 4 — Measuring whether any of this is actually working

An AI system that sounds confident isn't the same as one that's actually correct — SecureZen doesn't just build classifiers, it builds ways to check them:

- **Human-confirmed ground truth**: 513 real alerts, reviewed one-by-one by a person and recorded as the real answer, used to measure whether the AI's severity call was actually right (not just whether two AI models agreed with each other, which only proves agreement, not correctness). See `docs/ai-soc/ml-accuracy.md` for the real numbers this produced, including a serious miscalibration it caught and the fix that followed.
- **The verdict feedback loop** (`sz_verdict_feedback`): lets an analyst confirm or correct the AI's verdict on any real alert as they work, building up a live, ongoing accuracy signal instead of a one-time study — broken down by severity, by which model answered (local vs. external), and by how confident the model said it was.
- **An independent 3-way benchmark**: the local fine-tuned model (LogEM), the external LLM fallback (Groq), and a third, independently-built open-weights model (Laya) are all run against the same 513 human-confirmed alerts and scored the same way (precision/recall/F1 per class, not just raw accuracy, because real threats are rare and raw accuracy alone can hide that). This is what settles "is our own fine-tuned model actually better than just calling an external LLM every time" with real evidence instead of a guess.
- **Fine-tuning was tried and honestly shelved**: a LoRA fine-tune of the local model was built and tested, but it called every real HIGH/CRITICAL threat in the test set "LOW" — worse than doing nothing, because there isn't enough real high-severity training data yet (genuine attacks are rare by nature). Documented and parked rather than shipped, to be revisited once more real high-severity examples accumulate.

**The honest summary, carried over from `ml-accuracy.md`**: this system has never claimed one single clean accuracy percentage, because that requires a stable labeled test set and a model that isn't actively changing — neither holds here yet. What exists instead is a growing set of specific, real checks, each scoped to exactly what it measured.

---

## Why it's built this way, not "just ask an AI"

Every piece above exists because something simpler was tried first and shown — with real evidence, not assumption — to not be good enough on its own: a single LLM call can't see cross-log patterns, can't verify itself against outside reputation data, can't tell a first-time anomaly from a hundredth repeat, and sounds equally confident whether it's right or wrong. Each additional layer (rules, ML filtering, agent tool-calling, UEBA, the feedback loop) exists to cover a specific blind spot the previous layer had, found through actual testing against real data.
