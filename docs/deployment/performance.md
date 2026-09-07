# Deployment Performance

See `docs/ai-soc/performance.md` for the current state of performance measurement generally (short version: not yet formally benchmarked).

The one deployment-specific number that is real: enabling the local ML classifier on a shared server drove CPU to 97%+ and made the login endpoint unresponsive; the same workload on a dedicated box stayed at 7-25% CPU. This is why `docs/deployment/environments.md` treats "which server runs the local model" as a hard rule, not a preference — it's the only load-bearing capacity data point this project currently has.

No sizing guidance beyond that exists yet (e.g. "N events/sec needs M CPU cores") — don't invent one; if capacity planning is needed, that requires an actual load test first.
