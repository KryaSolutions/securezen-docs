# Forensic Analysis

## What it does

Every alert dashboard shows a summarized view — verdict, confidence, a few key fields. Forensic Analysis is the escape hatch when that summary isn't enough: it's a real, embedded OpenSearch Dashboards **Discover** view, not a custom-built lookalike. Opening it from a case deep-links straight to that alert's ±2-day window, scoped to the relevant host and user, so an analyst lands directly on the surrounding raw log activity instead of building that search by hand.

Alongside it sits the **AI Analysis** dashboard — a separate view built from 6 native OpenSearch visualizations (verdict donut, confidence histogram, investigations-over-time, severity bar, top MITRE techniques, agent breakdown), covering the AI fleet's own investigation history rather than raw logs. It's auto-provisioned on every backend startup, so it self-heals on redeploy instead of depending on a one-off manual setup.

## Why it matters to a SOC

A verdict is a conclusion, not evidence. When an analyst needs to confirm *why* an alert was called what it was, or check what else happened around the same host or user, they need the raw logs — not a re-summarized version of them. Keeping this on real OpenSearch Dashboards instead of a custom chart means analysts get full-text search, field filtering, and every other Discover capability they already expect from the tool, rather than a thinner reimplementation.

## A real, documented detail

Both views are theme-synced to SecureZen's own dark/light toggle — OpenSearch Dashboards only exposes one global theme setting, so the frontend calls a dedicated endpoint on every toggle and remounts the embedded view once the setting lands. The AI Analysis dashboard's data source is also a left join (not an inner join) against alerts, specifically because a demo environment's 60-day alert cleanup job was found purging alerts that older investigations still referenced — a left join keeps that investigation history visible instead of silently dropping it.

---

For how the embedding, rebranding, and index-syncing actually work, see [Forensic Analysis & AI Analysis Dashboards](../architecture/forensic-analysis.md).
