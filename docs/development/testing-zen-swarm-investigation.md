# Testing Guide: ZEN Swarm / Forensic Swarm Investigation

> **Archived (October 2026)**: this describes the pre-`AgentRunner` CrewAI-based investigation pipeline. CrewAI has since been fully removed — see `docs/architecture/agentic_architecture.md` for the current `InvestigationAgent`/`AgentRunner` design. Kept as real QA history, not current instructions.

How to manually verify the real multi-agent LangGraph pipeline (`crew.py`'s `TruePositiveCrew`) end to end, from both places it's now wired up: the alert detail view (`AlertAnalysis.jsx`) and the dedicated Forensic Swarm page (`TriagePage.jsx`).

## 1. Prerequisites

- Backend running locally: `cd backend && ../.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 5001 --reload`
- Frontend dev server running: `cd frontend && bun run dev` (or `npm run dev`)
- Logged into the app in a browser at the frontend dev URL (e.g. `http://localhost:5173`)
- `GROQ_API_KEY_CREW` (or `GROQ_API_KEY`) set in `.env` — the `verdict_reporter` node needs a working LLM call to produce a real briefing instead of falling back to the deterministic summary

## 2. Test via the Alert Analysis page (primary path)

1. Go to **Zen AI Analysis** (or wherever your alert list lives) and open any alert's detail view.
2. Click the **Decision** tab.
3. Scroll down — you'll see a card titled **"Forensic Swarm Investigation"** with subtitle *"Real 5-node LangGraph pipeline..."*. If no investigation has run yet for this alert, it shows **"No investigation has been run for this alert yet"** and a **Run Investigation** button.
4. Click **Run Investigation**.
5. Watch the 5 nodes light up **in real time, in order**:
   `IOC Coordinator → Threat Intel Enrichment → SIEM Telemetry → Evidence Analyst → Verdict Reporter`
   Each node's circle should pulse while running, then turn solid with a ✓ once its neighbor lights up.
6. When it finishes, you'll see the real verdict badge (e.g. `TRUE POSITIVE`, `FALSE POSITIVE`, or `INTERNAL_ALERT`), a confidence %, priority, and an LLM-generated summary/recommendation.
7. **Refresh the page** and reopen the same alert's Decision tab — the card should immediately show the completed state with the same verdict (proves the result persists and reloads correctly, not just an in-memory illusion).
8. Click **Re-run** — it should reset and repeat steps 4–6.

### Picking a good alert to test with

- Any alert with a **private IP** (`192.168.x.x`, `10.x.x.x`) will take the fast internal-only path — all 5 nodes still run, but VirusTotal/AbuseIPDB/Yeti are skipped, so it finishes in ~1–2 seconds with verdict `INTERNAL_ALERT`.
- For the **full enrichment path** (real VirusTotal/AbuseIPDB/Yeti calls, actual scoring math), pick an alert with a real external source IP. In this dataset, alert **`#18663`** (tenant KRYA Solutions, IP `66.240.205.34`, severity HIGH) is a good candidate.

## 3. Test via the Forensic Swarm page (secondary path, same backend)

1. Go to **Forensic Swarm** in the sidebar (or open `TriagePage` directly, e.g. via a deep link from an alert).
2. Trigger an investigation the same way (button labeled around *"Execute 5-Node Autonomous Forensics Pipeline"*).
3. Watch the **"🤖 Active Agent Swarm"** panel — same 5 real node names, progressing via log polling (not the WebSocket) as a fallback/legacy path. Should reach the same end state as the Decision tab's live version.
4. Confirm the incident modal that pops up on completion shows the same verdict you'd see on the Decision tab for the same alert.

## 4. Verify the backend side directly (optional, deeper check)

If something looks off in the UI, check what the backend actually did:

```bash
# Latest investigation result for a given alert (replace 18663 with your alert id)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:5001/api/crewai/result/18663 | python3 -m json.tool

# Live log feed - should show the 5 real node names, not "Swarm Initializer"/"Context Analyst"/etc.
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:5001/api/crewai/logs?limit=10" | python3 -m json.tool
```

Get `$TOKEN` from your browser's localStorage (`securezen_session` → `.token`) after logging in.

## 5. What "working correctly" looks like

- Nodes light up **one at a time, left to right**, never all-at-once and never stuck on step 1.
- The verdict/confidence/priority shown match what `curl .../crewai/result/{id}` returns.
- Re-opening the alert later shows the same completed result without needing to re-run.
- `crewai/logs` shows agent names exactly matching `IOC Coordinator`, `Threat Intel Enrichment`, `SIEM Telemetry`, `Evidence Analyst`, `Verdict Reporter` — if you see `Swarm Initializer`/`Context Analyst`/etc. instead, the backend didn't pick up the fix (check you're not still pointed at the old Docker image on port 25000).

## 6. Common issues

| Symptom | Likely cause |
|---|---|
| Stepper never starts / stays gray | WebSocket failed to connect — check browser console for a `wss://`/`ws://` connection error; confirm `API_BASE_URL` resolves to the right host:port |
| "Run Investigation" does nothing | Check the network tab for the `POST /api/crewai/investigate/{id}` call — a 401 means your token expired, re-login |
| Verdict always `FALSE POSITIVE` with a deterministic-sounding summary | `GROQ_API_KEY_CREW`/`GROQ_API_KEY` missing or invalid — `verdict_reporter_node` is falling back to its non-LLM summary (still real, just not LLM-generated) |
| Old fake agent names appear in logs | You're hitting the Docker backend (port 25000) instead of the local `--reload` one (port 5001) — stop Docker or rebuild its image |
