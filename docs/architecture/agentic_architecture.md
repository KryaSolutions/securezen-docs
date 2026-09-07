# SecureZen Agentic AI Architecture

This document outlines the artificial intelligence "Forensic Swarm" architecture used in SecureZen. It details the various crews, agents, and their respective workflows that automate Security Operations Center (SOC) tasks.

## Overview of AI Crews
SecureZen utilizes multiple specialized AI Crews to handle different aspects of threat intelligence, alert triage, and reporting. The primary orchestrator of these AI models is located in `backend/app/investigation/crew.py`.

### 1. TruePositiveCrew (The Forensic Swarm)
This is the core investigative engine, built using LangGraph for complex, multi-step parallel processing. It is designed to act as an automated L2/L3 SOC analyst, evaluating an Indicator of Compromise (IOC) to determine if an alert is a True Positive or False Positive.

#### Architectural Upgrade: Legacy vs. Current (Live)
| Component / Node | Previous Architecture (Legacy) | Current Upgraded Architecture (Live) | Key Benefit & Impact |
| :--- | :--- | :--- | :--- |
| **Pipeline Structure** | **4-Node Pipeline** strictly processing data sequentially. | **5-Node Pipeline** utilizing multi-threading for parallel execution. | **Speed:** Execution time is reduced by up to 60% by running API calls simultaneously. |
| **Target Detection** (Coordinator Node) | **IP-Only Detection.** Assumed every target was an IP address and only checked if it was public or private. | **Multi-IOC Detection.** Dynamically identifies if the target is an **IP**, **URL**, or **File Hash** (MD5/SHA256). | **Versatility:** The swarm can now investigate malware hashes and malicious links, not just network traffic. |
| **Intelligence Gathering** (Enrichment Node) | **Sequential APIs.** Called VirusTotal, then waited, called AbuseIPDB, then waited, called Yeti.<br /><br />🔥 **No Caching:** Wasted API limits by re-checking identical IPs. | **Parallel APIs (ThreadPool).** Calls VT, AbuseIPDB, and Yeti at the exact same time.<br /><br />🧠 **Smart Routing:** Skips IP-only tools (AbuseIPDB) if analyzing a file hash.<br />💾 **Memory Cache:** Saves results in `_ENRICHMENT_CACHE` to instantly skip duplicate requests. | **Efficiency:** Massively reduces API quota burn and avoids rate limits during high-alert volumes. |
| **Historical Context** (Telemetry Node) | ❌ **Did not exist.** The AI had no knowledge of whether an IP had triggered alerts in the past. | ✅ **Brand New Node.** Uses `GenericSIEMTool` to actively query your local **PostgreSQL** (`sz_alerts` table) for the last 7 days of activity regarding the IOC. | **Context:** The AI now understands if this is a first-time offense or an ongoing, repeat attack on your network. |
| **Score & Triage** (Evidence Analyst Node) | **Basic Scoring (0-100).** Evaluated only the 3 external threat intel reports to decide if an alert was a True/False Positive. | **Context-Aware Scoring.** Adds points based on the new PostgreSQL telemetry data (e.g., +15 points if seen in past alerts).<br /><br />🚨 **Automated Priority:** Automatically assigns a deterministic **P1 to P5** priority tier. | **Accuracy:** Eliminates L1 analyst guesswork by providing an immediate, standardized severity priority. |
| **Final Reporting** (Verdict Reporter Node) | **Basic JSON Output.** Provided a simple summary, score, and recommendation string. | **Executive JSON Output.** Heavily optimized LLM prompt. Output now strictly includes:<br />1. The P1-P5 Priority<br />2. Internal PostgreSQL Telemetry Summary<br />3. A crisp, **3-sentence Executive Threat Briefing** | **Presentation:** Ready for CISO and Executive dashboard consumption immediately without human editing. |

---

### 2. AlertTriageCrew
A lightweight, fast-execution CrewAI implementation designed for initial, per-alert triage.

*   **Agent Role:** SOC Alert Triage Specialist
*   **Goal:** Assign a P1-P5 priority to security alerts with clear reasoning.
*   **Input:** Raw event type, source IP, country, severity, CVSS score.
*   **Output:** Structured JSON providing priority, an evidence-based score, a 2-3 sentence reasoning summary, and an estimated time to resolve.
*   **Special Logic:** Has explicit instructions not to blindly elevate priority for internal authentication logs, mimicking human SOC intuition.

---

### 3. MitreMappingCrew
An automated tagging and classification crew used to contextualize raw logs against global frameworks.

*   **Agent Role:** MITRE ATT&CK Framework Specialist
*   **Goal:** Map security event behaviors to specific MITRE ATT&CK techniques and identify the Kill Chain stage.
*   **Input:** Raw syslog message, event type.
*   **Output:** Structured JSON containing the MITRE tactic, technique ID (e.g., T1078), technique name, and the specific stage in the Cyber Kill Chain (e.g., Stage 3 - Exploitation).

---

### 4. DailyReportCrew
A scheduled, executive-facing crew designed to synthesize large amounts of daily telemetry into readable reports.

*   **Agent Role:** SOC Intelligence Report Writer
*   **Goal:** Compile comprehensive daily security reports for SOC managers and CISOs.
*   **Input:** Aggregated daily metrics (total alerts, critical count, top threat actors, active MITRE techniques).
*   **Output:** A clean, professional Markdown report structured into 6 specific sections:
    1. Executive Summary
    2. Critical Findings
    3. Threat Actor Activity
    4. MITRE ATT&CK Coverage
    5. Recommended Actions
    6. Metrics Summary

## External Integration Tools
To accomplish these tasks, the agents utilize several specialized python classes (`tools`):

1.  **VirusTotalTool:** Queries the VT API for malicious vendor flags on IPs, Hashes, and URLs.
2.  **AbuseIPDBTool:** Queries community-reported confidence scores exclusively for IP addresses.
3.  **YetiTool:** Queries internal/local Yeti Threat Intelligence platforms for known campaigns or tags.
4.  **GenericSIEMTool:** Queries the local PostgreSQL (`sz_alerts`) database for historical telemetry and context matching an IOC.
