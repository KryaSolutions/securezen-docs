# Prompt Externalization Plan

## Why

27 inline LLM prompt strings currently live scattered across 13 Python files, embedded as string literals inside the functions that use them. Every wording tweak requires a code change, a review, and a redeploy. Externalizing them to files (the pattern `AI-Augmented-SOC-Lab` uses, and the one `classifier_lab/` already uses via YAML) means prompts can be iterated on independently of application code.

## What already does this correctly (no change needed)

`classifier_lab/src/nodes.py` already loads its prompts from `classifier_lab/config/agents.yaml`/`tasks.yaml` via `_load_yaml()`. This plan doesn't touch that — it's the pattern the rest of the codebase should match, not replace.

## Full inventory (backend/, everything still inline)

| # | File | Lines | Purpose |
|---|---|---|---|
| 1 | `ml_utils/ml_worker_daemon.py` | 204-221 | Local LogEM classifier severity/MITRE triage prompt |
| 2 | `ml_utils/ml_worker_daemon.py` | 721-739 | External (Groq) fallback triage prompt — near-duplicate of #1 |
| 3 | `ai_engine/processor_llm.py` | 44-61 | Standalone Tier-3 triage prompt — overlaps #1/#2 |
| 4 | `database/services/copilot_service.py` | 37-50, 52-77, 104-137 | ZEN Copilot: schema hints, NL-to-SQL intent, main chat prompt |
| 5 | `investigation/crew.py` | 328-373, 673-700, 739-760, 854-900 | CISO verdict report, alert triage, MITRE mapping, daily briefing |
| 6 | `investigation/campaign_attribution.py` | 42-47, 75-81 | Campaign-grouping system + user prompt |
| 7 | `ai_engine/neural_engine.py` | 240-246, 277-281 | "AI Explain" + summary prompts |
| 8 | `core/triage/alert_classifier.py` | 41-118 | Largest single prompt (78 lines) — triage summary + embedded MITRE lookup tables |
| 9 | `routers/alerts/core.py` | 307-327, 406-427 | IR playbook, APT attribution |
| 10 | `routers/dashboard_routes.py` | 563-588 | Dashboard AI insights/"Neural Remedies" |
| 11 | `routers/email_routes.py` | 439-463 | Phishing/BEC verdict prompt |
| 12 | `routers/intelligence/ai_mitre.py` | 213-228, 377-385, 530-551, 683-699 | Group summary, APT-by-technique, predicted-techniques, detection guide |
| 13 | `routers/intelligence/hunt.py` | 78-105, 329-341, 386-403 | NL-to-SQL (hunt), forensic insight, hunt suggestions |
| 14 | `routers/intelligence/threat_actors.py` | 416-433 | Threat-actor attribution |

**Two consolidation candidates flagged during the initial audit — both revised after actually reading the full prompts:**
- #1 and #2 (severity-triage, local vs external) looked like near-duplicates from the audit summary alone. On closer reading, their wording differs in ways that look intentionally tuned (the external one adds a CONFIDENCE field, different trailing instruction phrasing) — kept as two separate files instead of one merged template, to avoid a templating bug changing real model behavior for no real benefit.
- #4's intent prompt and #13's hunt search prompt looked like the same NL-to-SQL pattern with drifted schema hints. On closer reading, they're not duplicates at all: #4 deliberately only queries admin/sensitive tables (tenants, users, roles, audit logs, assets) and explicitly excludes `sz_alerts`; #13 exclusively targets `sz_alerts` with a much larger, more accurate column list. Different scope, different output contract (inline trigger string vs. strict JSON). Kept as two separate files — forcing a merge here would have been fitting a pattern that doesn't actually exist.

## Structure

```
backend/app/prompts/
├── __init__.py          # load_prompt(name, **vars) -> str, with the same
│                         # "fall back to inline default if file missing"
│                         # safety pattern AI-Augmented-SOC-Lab uses
├── triage/
│   ├── severity_triage_local.txt     # ✅ done - #1
│   ├── severity_triage_external.txt  # ✅ done - #2, kept separate from local's
│   │                                  #    (not merged - wording differs in ways
│   │                                  #    that look intentionally tuned, e.g. the
│   │                                  #    CONFIDENCE field; forcing one template
│   │                                  #    risked a subtle behavior change for no
│   │                                  #    real benefit)
│   └── alert_classifier.txt          # #8, not started - genuinely different purpose
├── copilot/                           # ✅ done
│   ├── schema_hints.txt
│   ├── intent.txt
│   └── chat.txt
├── investigation/                     # ✅ done - #5, #6 (split system/user per
│   │                                  #    prompt since crew.py uses LangChain's
│   │                                  #    ChatPromptTemplate.from_messages())
│   ├── verdict_report_system.txt
│   ├── verdict_report_user.txt
│   ├── alert_triage_system.txt
│   ├── alert_triage_user.txt
│   ├── mitre_mapping_system.txt
│   ├── mitre_mapping_user.txt
│   ├── daily_briefing_system.txt
│   ├── daily_briefing_user.txt
│   ├── campaign_attribution_system.txt
│   └── campaign_attribution_user.txt
└── intelligence/
    ├── hunt_nl_to_sql.txt              # ✅ done - #13's search prompt
    ├── nl_to_sql.txt        # consolidates copilot's + hunt's NL-to-SQL prompts
    ├── ir_playbook.txt
    ├── apt_attribution.txt
    ├── predicted_techniques.txt
    ├── detection_guide.txt
    ├── hunt_forensic_insight.txt
    ├── hunt_suggestions.txt
    ├── threat_actor_attribution.txt
    ├── dashboard_insights.txt
    ├── email_verdict.txt
    ├── ai_explain.txt
    └── alert_summary.txt
```

## Phased rollout (not doing all 27 at once)

1. **Phase 1 ✅ done**: severity-triage, #1 and #2 (kept separate, see above) — core classification pipeline, validated the loading mechanism (byte-exact rendering confirmed against the original inline strings) before touching anything else.
2. **Phase 2 ✅ done**: ZEN Copilot (#4, all 3 prompts) + Hunt NL-to-SQL (#13's search prompt) — kept separate per the finding above, all verified byte-exact against the original f-strings.
3. **Phase 3 ✅ done**: the LangGraph investigation cluster (#5, #6) — `investigation/crew.py`'s 4 prompts (verdict report, alert triage, MITRE mapping, daily briefing) + `investigation/campaign_attribution.py`'s 2 prompts, all verified byte-exact (AST-extracted for `crew.py`'s complex f-strings/`ChatPromptTemplate` usage, direct comparison for `campaign_attribution.py`).
4. **Phase 4 ✅ done**: everything else — #3 (`processor_llm.py`), #7 (`neural_engine.py`, 2 prompts), #8 (`alert_classifier.py`, the 78-line one), #9 (`routers/alerts/core.py`, IR playbook + APT attribution), #10 (`dashboard_routes.py`), #11 (`email_routes.py`), #12 (`ai_mitre.py`, 4 prompts), #13's remaining 2 prompts (`hunt.py` forensic insight + hunt suggestions — NL-to-SQL was already done in Phase 2), #14 (`threat_actors.py`) — 13 prompts total, all verified byte-exact via AST extraction + `.format()` comparison against the original f-strings before wiring in `load_prompt()`.
   - Correction to an earlier note in this doc: `llama-3.3-70b-versatile` (used in `processor_llm.py`) is NOT a dead model — it's the same model string used live in `crew.py` and `campaign_attribution.py`. Left untouched.
   - Found and flagged (not fixed, out of scope for this refactor): `email_routes.py`'s AI-verdict path calls `call_groq_with_fallback`, `get_tracker`, and `call_huggingface_model` without importing any of them — pre-existing `NameError` risk, confirmed via `git diff` to predate this refactor.
   - `dashboard_routes.py`'s `summary_context` (lines ~556-561) and `email_routes.py`'s downloadable Markdown report generator (`report = f"""# SecureZen Email Security Report`, ~line 797) were deliberately left inline — neither is an LLM prompt (the first is plain context assembly consumed by the real prompt; the second is a user-facing report template with no LLM call nearby).

All 27 originally inventoried prompts are now externalized. This plan's core work is complete.

Each phase gets tested (real LLM call, confirm output unchanged) before moving to the next — not batched blind.

## What this does NOT do

- Doesn't change any prompt's actual wording/content in this pass, except where consolidating true duplicates (and even then, keeping the more complete/correct version, not rewriting from scratch).
- Doesn't touch `classifier_lab/` — already correctly externalized.
- Doesn't add MISP integration or touch case-management architecture — those are separate, larger decisions noted in `docs/research/competitive-analysis.md`, not part of this specific plan.
