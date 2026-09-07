# SecureZen, In Plain Language

The technical version of this is `docs/architecture/overview.md`. This page is the same pipeline, described the way you'd explain it to a non-engineer or in an interview.

**The problem**: a SOC gets thousands of log lines a day. Almost all of them are routine. A human can't read all of them, and treating every single one as equally important either burns out analysts (too much noise) or misses real threats (they get lost in the noise).

**The approach, in order**:
1. **A cheap first pass, not AI**: an unsupervised ML model watches the stream and learns what "normal" looks like for this specific environment, over time, without ever being told what an attack looks like. Anything that doesn't fit gets a closer look; everything else is dropped before it ever reaches anything expensive.
2. **A safety net, not AI either**: separately, if a log matches a known attack signature by name, or if the same account has too many failed logins in a day, that's escalated automatically by a plain rule — no AI judgment call needed for things a rule can already answer correctly.
3. **A cheap AI opinion, checked**: what's left goes to a local AI model. If it's confident the log is harmless, that's trusted (it's been shown to be accurate about that specific call). If it says anything else, or it's not confident, that verdict isn't trusted on its own.
4. **A stronger AI opinion, when needed**: anything the local model didn't confidently clear goes to a more capable AI model (hosted externally) for the real severity call.
5. **The result, with context attached**: whatever severity comes out gets written down along with everything a human would need to judge it themselves (source IP, country, device, what rule matched) — not just a bare severity label.
6. **On demand, go deeper**: for anything serious, a multi-step AI investigation process can dig further — check IP reputation, cross-reference known threat actors, produce a written case summary.

**Why it's built this way, not "just ask an AI"**: an AI reading one log line at a time can't see a pattern that only exists across many log lines (like a slow brute-force attempt), and can be talked into second-guessing a known attack signature that a rule would never miss. Rules and AI are used for what each is actually good at, not interchangeably.
