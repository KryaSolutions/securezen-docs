# SOC Command Center: Data Mappings & Demo Seeding Guide

This document maps out the backend data sources, SQL tables, API endpoints, and models used by the **SOC Pipeline Command Center** and its sub-pages in SecureZen. It also contains instructions on how to seed mock data specifically for the **`FintrustCapital`** tenant without affecting the **`KRYA Solutions`** or **`NexusCorp`** tenant data.

---

## 1. Component-by-Component Data Flow

The SOC Command Center consists of 5 interactive layers/stages. Below is the mapping of which databases, models, and endpoints each stage depends on.

### 📊 CommandCenter (Landing Dashboard)
* **Backend Endpoint**: `GET /api/alerts/pipeline-stats`
* **Data Sources**:
  * **Ingressed Raw Events**: `SELECT COUNT(*)` from `events` table (PostgreSQL) where columns match `%fintrust%`.
  * **Correlated Threats**: `SELECT COUNT(*)` from tenant-specific database `sz_alerts` table.
  * **AutoSOC AI Verdicts**: `SELECT COUNT(*)` from `verdicts` table where verdict is `"TP"` or `"Real Incident"`, joined with `events` table matching `%fintrust%`.
  * **Open / Resolved Alerts**: Fetched from tenant-specific SQLite/PostgreSQL `sz_alerts` table metadata.

### 📝 Stage 1 & 2: Ingress/Ingest (Raw Logs)
* **Frontend Component**: [CCRawLogs.jsx](file:///home/praveen/SecureZen/main_folder/frontend/src/components/CCRawLogs.jsx)
* **Backend Endpoint**: `GET /api/alerts/raw-events`
* **SQL Table**: `events` (PostgreSQL - Shared Table)
* **SQLAlchemy Model**: `Event` in `classifier_lab/src/models.py`
* **Key Fields Used**: `id`, `created_at`, `rule_level`, `rule_description`, `agent_name`, `srcip`, `dstip`, `dstuser`, `decoder_name`, `hostname`, `full_log`, `msg`.

### 🛡️ Stage 3: Correlation (Layer 2 Correlated Alerts)
* **Frontend Component**: [CCCorrelatedAlerts.jsx](file:///home/praveen/SecureZen/main_folder/frontend/src/components/CCCorrelatedAlerts.jsx)
* **Backend Endpoints**:
  * `GET /api/alerts/raw-events` (populates the alerts table)
  * `PATCH /api/alerts/raw-events/{event_id}/verdict` (updates analyst verdict)
* **SQL Tables**:
  * `events` (PostgreSQL - Shared Table)
  * Updates the `vd` column on `events` table (mapped as `analyst_verdict`).

### 🧠 Stage 4: AI (Layer 3 Autonomous SOC AI Verdicts)
* **Frontend Component**: [CCAutoSoc.jsx](file:///home/praveen/SecureZen/main_folder/frontend/src/components/CCAutoSoc.jsx)
* **Backend Endpoint**: `GET /api/alerts/ai-verdicts`
* **SQL Tables**: `verdicts` table joined with `events` table (PostgreSQL - Shared Tables).
* **SQLAlchemy Models**: `Verdict` and `Event` in `classifier_lab/src/models.py`
* **Key Fields Used**: `id`, `event_id`, `verdict` (filtered for `"TP"` or `"Real Incident"`), `severity`, `confidence`, `reason`, `recommended_action`, `classified_at`, `src_ip`, `llm_model`.

### ⚡ Stage 5: Response (Layer 4 Response Actions)
* **Frontend Component**: [CCResponse.jsx](file:///home/praveen/SecureZen/main_folder/frontend/src/components/CCResponse.jsx)
* **Backend Endpoint**: `GET /api/alerts/pipeline-stats`
* **SQL Tables**: Tenant-specific database metadata (`sz_alerts` table counts).

---

## 2. Tenant Isolation & Filtering Mechanism

To prevent data leakage between tenants, SecureZen filters records dynamically using substring pattern matching on the shared database tables.

### Substring Search Map
When an API request arrives, the backend resolves the active tenant name to a short identifier string:

| Tenant Selected | Backend Search Substring |
|:---|:---|
| `KRYA Solutions` | `%krya%` |
| `FintrustCapital` | `%fintrust%` |
| `NexusCorp` | `%nexus%` |

### Shared Tables Filter (PostgreSQL `events` & `verdicts`)
SQL queries matching shared tables apply a case-insensitive check on these columns:
```sql
WHERE agent_name ILIKE '%fintrust%'
   OR hostname ILIKE '%fintrust%'
   OR devname ILIKE '%fintrust%'
   OR profile ILIKE '%fintrust%'
   OR full_log ILIKE '%fintrust%'
```
* **Crucial Rule for Seeding**: Any mock event record intended for `FintrustCapital` **MUST** have the string `"fintrust"` (e.g. `fintrust-agent-01`, `fintrust-host-corp`) set in either its `agent_name`, `hostname`, or `devname` field.

---

## 3. Step-by-Step Mock Data Seeding Guide

To seed demo data **only** for `FintrustCapital`, you can run a Python script inside the virtual environment.

### Seeding Script Template

Create a temporary script under `scratch/seed_fintrust_demo.py` and run it:

```python
import sys
from pathlib import Path
from datetime import datetime, timedelta

# Import models from classifier_lab
_main_folder = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_main_folder / "classifier_lab"))

from src.models import get_session, Event as PGEvent, Verdict as PGVerdict

session = get_session()

try:
    # 1. Create a mock Event specifically for FintrustCapital
    event = PGEvent(
        agent_name="fintrust-firewall-agent",
        hostname="fintrust-core-router",
        devname="fintrust-fortigate",
        profile="fintrust-security-profile",
        rule_level="12",
        rule_description="Fortigate: Critical Malware infected host threat detected.",
        srcip="192.168.220.101",
        dstip="10.0.50.22",
        dstuser="admin",
        decoder_name="fortigate-firewall",
        eventtype="firewall",
        full_log="Fortigate: Blocked outbound Trojan communication from client hostname fintrust-client-05",
        msg="Blocked Trojan outbound connection.",
        vd="AWAIT",  # Initial analyst verdict
        created_at=datetime.utcnow() - timedelta(minutes=15)
    )
    session.add(event)
    session.flush() # Populate event.id

    # 2. Create a mock AI Verdict linked to the above event
    verdict = PGVerdict(
        event_id=event.id,
        verdict="TP",  # Must be "TP" or "Real Incident" to appear in Layer 3 AutoSOC
        severity="CRITICAL",
        confidence=95,
        reason="The host fintrust-client-05 was observed initiating outbound connections to a known malicious C2 IP address. This behavior matches typical Trojan infection signatures.",
        recommended_action="1. Isolate client host fintrust-client-05 from the network immediately.\n2. Revoke admin credentials used during the session.\n3. Initiate full malware scan.",
        classified_at=datetime.utcnow() - timedelta(minutes=14),
        llm_model="groq/llama-3.3-70b-versatile"
    )
    session.add(verdict)
    
    session.commit()
    print(f"Successfully seeded FintrustCapital mock event and AI verdict! Event ID: {event.id}")
except Exception as e:
    session.rollback()
    print(f"Error seeding data: {e}")
finally:
    session.close()
```

### Running the Seed Script
To run this script on the server:
```bash
../.venv/bin/python scratch/seed_fintrust_demo.py
```
This inserts records that will show up **exclusively** when `FintrustCapital` is selected in the tenant switcher dropdown, leaving `KRYA Solutions` and `NexusCorp` untouched.
