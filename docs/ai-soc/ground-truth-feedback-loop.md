# Ground-Truth Verdict Feedback Loop — Build Spec

## Why this exists

After the 12-task classification bug-fix pass (`AI_CLASSIFICATION_BUG_FIXES.md`, same folder), the only accuracy
signal SecureZen has is `overall_agreement_pct` in `/api/alerts/benchmark-stats` — how often LogEM agrees
with the external Groq model. That's a real signal, but it's agreement between two AI models, not
correctness against a human analyst's actual judgment. Two models can agree and both be wrong.

**Verified during this design** (don't assume otherwise — this was checked directly against the code):
there is currently **no mechanism anywhere in SecureZen that records whether the AI's TP/FP verdict was
actually right.** The one thing that looked like it might be this — `PATCH /raw-events/{event_id}/verdict`,
which sets `events.vd` — is a different concept entirely: `vd` is a **triage workflow status**
(`AWAIT` / `UNDER` / `PENDING` / `HIGH` / `LOW`, confirmed from `frontend/src/components/CCCorrelatedAlerts.jsx`
line 42 and the `analyst_verdict` field default of `"AWAIT"` in `alert_routes.py:855`), not a TP/FP
correction of the AI's call. Don't confuse the two or build on top of `vd` — it means something else and is
already wired into existing triage-queue UI.

**Relevant existing schema** (confirmed directly from `classifier_lab/src/models.py:584-623`):
```python
class Verdict(Base):
    __tablename__ = "verdicts"
    id                 = Column(BigInteger, primary_key=True, autoincrement=True)
    event_id           = Column(BigInteger, ForeignKey("events.id"), unique=True, nullable=False)
    verdict            = Column(String, nullable=False)     # TP / FP
    severity           = Column(String, nullable=True)      # CRITICAL / HIGH / MEDIUM / LOW
    confidence         = Column(Integer, default=0)         # 0-100
    provider           = Column(String, default="groq")
    llm_model          = Column(String, default="groq/llama-3.3-70b-versatile")
    ...
    event = relationship("Event", back_populates="verdict_row")
```
One verdict row per event (`event_id` is unique). This is what the ml_worker writes today (Task 1/2 of the
bug-fix pass made `verdict`/`confidence` real instead of hardcoded).

**Table-creation pattern already established** in `backend/app/main.py`'s `ensure_reports_tables()`
(startup-time `CREATE TABLE IF NOT EXISTS` blocks — no Alembic/migrations directory exists in this repo).
The most recent example, `sz_ai_benchmarks` (`main.py:190-221`), is the template to mirror for the new table
below — same `sz_` prefix convention, same `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` style.

**Auth helpers already available** (`backend/app/utils/auth.py`): `verify_any_token` returns the
authenticated user's email string directly (`str`, not an object) — use it for `analyst_email`.
`verify_write_permission` gates state-changing actions to `ROLE_ADMIN`/`ROLE_DEMO` — use it here too,
consistent with how `PATCH /raw-events/{event_id}/verdict` is already gated.

Do these tasks **in order** — give each to Antigravity one at a time, same process as the bug-fix pass.

---

## Task 1 — New table: `sz_verdict_feedback`

**File:** `backend/app/main.py`, inside `ensure_reports_tables()` (add a new block right after the
existing `sz_ai_benchmarks` block, ~line 221).

**What to add:**
```sql
CREATE TABLE IF NOT EXISTS sz_verdict_feedback (
    id SERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL,
    tenant VARCHAR(100) DEFAULT 'admin',

    -- Snapshot of the AI's verdict AT THE TIME of analyst confirmation (not a live join —
    -- verdicts rows are effectively immutable today since _phase3_save uses
    -- ON CONFLICT (event_id) DO NOTHING, but snapshotting is still the correct pattern:
    -- it survives any future change to how verdicts are written/updated).
    ai_verdict VARCHAR(10),
    ai_severity VARCHAR(20),
    ai_confidence INTEGER,
    ai_provider VARCHAR(50),
    ai_llm_model VARCHAR(100),

    -- The human's actual determination
    analyst_verdict VARCHAR(10) NOT NULL,
    analyst_email VARCHAR(255) NOT NULL,

    -- Denormalized for fast aggregate queries — don't make callers recompute this
    ai_was_correct BOOLEAN,

    confirmed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_verdict_feedback_event_id ON sz_verdict_feedback(event_id);
CREATE INDEX IF NOT EXISTS idx_verdict_feedback_confirmed_at ON sz_verdict_feedback(confirmed_at);
```

**Design notes:**
- No unique constraint on `event_id` — deliberately allow multiple confirmation rows per event over time
  (an analyst might revisit an alert after new information; keep the history rather than overwriting it).
  Any stats query should use the most recent row per `event_id` (`DISTINCT ON` or a window function) —
  make sure Task 3 does this correctly rather than averaging over duplicates.
- `ai_verdict`/`ai_severity`/etc. are nullable — an analyst might confirm/correct an event that never got
  an AI verdict at all (e.g. was routed around the worker some other way). Don't require it.
- Follow the exact `CREATE TABLE IF NOT EXISTS` + separate `CREATE INDEX IF NOT EXISTS` statement style
  already used for `sz_ai_benchmarks` immediately above it in the same function — same session/execute
  pattern, don't introduce a different migration mechanism.

**Verify:** restart the backend, confirm `sz_verdict_feedback` exists in the `securezen` DB with the
columns above (`\d sz_verdict_feedback` in psql, or equivalent).

---

## Task 2 — Endpoint for analysts to confirm/correct a verdict

**File:** `backend/app/routers/alert_routes.py` — add a new endpoint near the existing
`PATCH /raw-events/{event_id}/verdict` (~line 1429), since that's where the analyst-facing raw-event
actions live.

**New endpoint:** `POST /raw-events/{event_id}/confirm-verdict`

**Required behavior:**
1. Gate with `verify_write_permission` (same as the existing `update_event_verdict`/triage endpoints) and
   `verify_any_token` for the analyst's email.
2. Accept a body: `{"analyst_verdict": "TP" | "FP"}` — reject anything else with a 400.
3. Look up the current AI verdict for this `event_id` from the `verdicts` table (reuse the existing
   `verdict_row` relationship pattern already used in the `/raw-events` GET endpoint at
   `alert_routes.py:834`, or a direct query against `Verdict` if that's cleaner in this function's
   context) — this becomes the `ai_verdict`/`ai_severity`/`ai_confidence`/`ai_provider`/`ai_llm_model`
   snapshot. If no verdict row exists for this event, snapshot all AI fields as `NULL` rather than
   erroring — an analyst should still be able to record their own determination even if the AI never
   classified this event.
4. Compute `ai_was_correct = (ai_verdict == analyst_verdict)` when `ai_verdict` is not null, else `NULL`.
5. Insert one row into `sz_verdict_feedback` with all of the above plus `analyst_email` (from
   `verify_any_token`) and `tenant` (from `get_tenant_from_token`, same as sibling endpoints in this file).
6. Return `{"status": "success", "event_id": ..., "ai_was_correct": ...}` so the frontend can immediately
   show the analyst whether they agreed or disagreed with the AI.

**Do not** modify `events.vd` or touch the existing `update_event_verdict` endpoint — this is a fully
separate, additive endpoint. The two concepts (triage workflow status vs. TP/FP ground-truth confirmation)
must stay independent.

**Verify:** call the endpoint manually for a real event that has a `verdicts` row, confirm a row lands in
`sz_verdict_feedback` with the correct AI snapshot and `ai_was_correct` computed correctly for both an
agreeing and a disagreeing case.

---

## Task 3 — Aggregate accuracy-stats endpoint

**File:** `backend/app/routers/alert_routes.py` — add near the existing `GET /benchmark-stats`
(~line 1231), same file, same general shape/style (that endpoint is the direct model to follow: query
recent rows, compute percentages, return `{status, stats, results}`).

**New endpoint:** `GET /accuracy-stats`

**Required behavior:**
1. Query `sz_verdict_feedback`, using only the **most recent** row per `event_id` (per Task 1's note —
   don't naively average over every historical confirmation row for the same event).
2. Compute and return:
   - `total_confirmed`: count of distinct events with at least one confirmation.
   - `overall_accuracy_pct`: percentage where `ai_was_correct` is true, among rows where `ai_verdict` is
     not null (exclude events the AI never classified from this specific percentage).
   - `accuracy_by_severity`: breakdown of `overall_accuracy_pct` grouped by `ai_severity`.
   - `accuracy_by_provider`: breakdown grouped by `ai_provider` (`Local_LLM` vs `External_LLM`) — this is
     the number that tells you whether LogEM specifically is worse than the Groq fallback, not just the
     system as a whole.
   - `accuracy_by_confidence_bucket`: bucket `ai_confidence` into ranges (e.g. `<50`, `50-70`, `70-90`,
     `90+`) and compute accuracy per bucket. **This is the number that validates or invalidates Task 10's
     logit-derived confidence score** — if high-confidence buckets aren't meaningfully more accurate than
     low-confidence ones, that's the evidence needed to revisit Task 10's approach (see the fluency-vs-
     correctness caveat noted when Task 10 was reviewed).
3. Follow `/benchmark-stats`'s existing pattern for rounding (`round(x, 1)`) and for returning `0.0`
   rather than dividing by zero when a bucket/group has no rows.

**Verify:** with a handful of confirmed events spanning both agreement and disagreement cases, confirm the
percentages match a manual hand-count.

---

## Task 4 — Frontend: let analysts actually submit confirmations

**File:** `frontend/src/components/CCCorrelatedAlerts.jsx` (same file that already renders
`analyst_verdict`/`ai_verdict` per-row, per the existing `handleUpdateVerdict` pattern at ~line 387) —
or the alert detail view/modal if confirmations are meant to happen there instead; use whichever surface
analysts already use to review an individual alert's AI verdict and reasoning.

**Required behavior:**
1. Where the AI's verdict/severity/confidence is already displayed for an alert (`item.ai_verdict`), add
   two clearly-separate actions: **"Confirm AI Verdict"** and **"Override to FP"** (or the inverse,
   depending on what `ai_verdict` currently says — don't just offer a generic TP/FP toggle with no
   context of what the AI already concluded).
2. On click, call the new `POST /raw-events/{event_id}/confirm-verdict` endpoint from Task 2 with the
   appropriate `analyst_verdict` value.
3. Show the `ai_was_correct` result from the response immediately (e.g. a small "✓ matched AI" /
   "✗ corrected" indicator) so analysts get instant feedback that their input was recorded.
4. Keep this visually and functionally separate from the existing `analyst_verdict`/`vd`
   (AWAIT/UNDER/PENDING/HIGH/LOW) triage-status control at ~line 706 — these are two different concepts
   and analysts need to be able to tell them apart at a glance. Don't reuse the same dropdown/button
   styling in a way that implies they're the same action.

**Verify:** open a real alert with an AI verdict in the browser, confirm it, check the network response
and that `sz_verdict_feedback` got a new row; then override a different alert's verdict and confirm the
same. Follow the `/verify` process (drive the actual feature in the browser) rather than just checking
the code compiles — this is a UI change and needs to be seen working end-to-end.

---

## After this ships

Let it collect data for a while (how long depends on your alert volume — enough to get a meaningful sample
per severity/provider/confidence-bucket, not just a handful of rows). Then read `/accuracy-stats` and
specifically look at `accuracy_by_provider` and `accuracy_by_confidence_bucket`:

- If `Local_LLM` accuracy is meaningfully lower than `External_LLM` accuracy, and it's not explained by
  volume/traffic-type differences, *that's* real evidence for or against fine-tuning `HassanShehata/logem`
  — the question this whole effort started from.
- If `accuracy_by_confidence_bucket` doesn't show higher buckets being more accurate, that's the signal to
  revisit Task 10's confidence computation (restrict it to the `SEVERITY:`/`MITRE:` token span instead of
  the whole generation, per the caveat noted at the time).

Don't skip straight to fine-tuning without this data — that was the whole point of building it.
