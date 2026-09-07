# AI Cost Architecture

> Replaces the old `COST_OPTIMIZATION_PLAN.md`, which described a future plan whose Phase 1/3/4 proposals had already shipped — differently than described — by the time anyone read it. This doc describes what actually runs today, as a retrospective, not a plan.

There are two separate, unrelated cost-control mechanisms in this codebase. Don't confuse them.

## 1. `classifier_lab/src/engine.py` + `toon.py` — the classification pipeline's own cost controls

**Severity pre-triage before any LLM call** (`pre_classify()`): every alert is bucketed into `URGENT` / `PRIORITY` / `ELEVATED` / `ROUTINE` from cheap signals (source, rule content) before any model runs.

**Model tiering** (`_select_model()`): `URGENT`/`PRIORITY` → the deep model; `ELEVATED`/`ROUTINE` → the fast model. Current default (`UNIVERSAL_CONFIG`) runs a single local Ollama model for everything unless `ZEN_AI_DEEP_MODEL`/`ZEN_AI_FAST_MODEL` override it per tier — this is a materially different, newer design than the old doc's GPT-4o/Groq multi-provider cost table, which no longer reflects reality.

**Response caching**: `CACHE_TTL_MINUTES = 4320` (72h) and `SIMILARITY_THRESHOLD = 0.70` (70% token-overlap via `message_similarity_score()`) — a cached verdict is reused if a new alert is similar enough within the window. These are exactly the values the old plan proposed moving *to*; they're already the live config, not a future target.

**Payload compression** (`toon.py`): a custom Token-Oriented Object Notation encoder (`encode_list()`) that shortens field names to 1-3 letter codes before sending event data to an LLM, to cut input tokens. Already wired into `nodes.py`.

## 2. `backend/app/ml_utils/ai_cost_tracker.py` — the hard budget cap

Independent of the above. Every LLM call gets logged to an `ai_call_log` table (cost, tokens, model). `check_budget()` compares month-to-date usage against:

- `AI_MONTHLY_BUDGET_CALLS` (default `1000`)
- `AI_MONTHLY_BUDGET_TOKENS` (default `500000`)

If exceeded, `budget_exceeded: True` — the system is meant to stop making further LLM calls rather than silently keep spending. Separately, `AI_CACHE_TTL_DAYS` (default `30`) controls a longer-lived response cache at this layer, distinct from the 72h similarity cache in `engine.py`.

## Why two separate mechanisms exist

`engine.py`'s caching/tiering/compression optimizes cost *per call* (cheaper calls, fewer redundant ones). `ai_cost_tracker.py` is the backstop that guarantees a hard ceiling regardless of how well the first layer is tuned. Neither replaces the other.

## What's not yet verified

Whether every real cost-relevant code path (email analysis, threat hunting, ZEN copilot) actually routes through `ai_cost_tracker.py`'s logging, or whether some LLM call sites bypass it — not confirmed this pass. Worth a targeted audit before quoting a real monthly-cost figure to anyone external.
