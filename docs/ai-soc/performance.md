# Performance

## Status: not yet benchmarked

No formal latency/throughput benchmarking has been done on this system. The `Performance Metrics` section in the pre-August-2026 `API_REFERENCE.md` (MTTD/MTTR figures) was fabricated/placeholder content and was deliberately dropped during the docs rewrite rather than carried forward as if it were real.

## The one real data point that exists

CPU utilization under real production load: the demo/production server hit **97%+ CPU** when the local ML classifier was enabled alongside its other unrelated services — this is what caused the login-endpoint-unresponsive incident (`docs/ai-soc/reliability-log.md`, item 37). On the dedicated test server running the same real workload without the other services, CPU stayed in the 7-25% range. This is the only concrete performance number currently backed by an actual measurement, not an estimate.

## What would need to be measured before this page has real content

- End-to-end latency: raw event landing → verdict written → visible on dashboard
- `ml_worker_daemon.py` throughput (events/second sustainable before the poller falls behind)
- API response times under the dashboard's actual concurrent-user load
- Groq/local-LLM call latency distribution, not just success/failure rate

Until those exist, don't quote a number here that isn't one of the two above.
