# WDE — Audience Needs → HIVE Score → Content Planning

Issue: https://github.com/jimmytobing/Syntetic-Wisdom/issues/35
Target: Salesforce Developer Edition, Org ID `00Dfj00000eVCOVEA4` (alias `hdbsf`).
Status: BUILD in feature branch; LIVE metadata validation and deployment pending. **Not deployed or activated.**

## Verified baseline (12 Nov 2026)
- `WDE_Fetch_YouTube_Comments.flow-meta.xml` exists in the repository, calls YouTube and Groq External Services, and prepares/links `WDE_Audience_Signal__c` to `WDE_Audience_Need__c`.
- Existing `WDE_Audience_Need__c` has `Need_Key__c` (Text 255, Unique, External ID) in repository, and `Category__c`, `Status__c`, `Description__c`.
- Existing `WDE_Audience_Signal__c` has `Signal_Key__c` (Text 255, Unique, External ID), `Signal_Count__c` (Number 18,0), `Signal_Date__c` (Date), and lookup to `WDE_Audience_Need__c`.
- Salesforce `FieldDefinition` queried with the integration user lists only standard fields for Need and two custom lookup fields for Signal. This is **not** proof that repository-defined fields are absent: check FLS/metadata visibility before changes.
- Salesforce CLI authenticated to the intended org; combined metadata retrieval timed out at the gateway's 15-second process limit. A separate single-field CLI retrieval of `WDE_Audience_Need__c.Need_Key__c` succeeded. Full metadata reconciliation remains pending.

## Intended business behavior
1. Crawl YouTube comments via existing Flow; preserve unique `Signal_Key__c` to make repeated crawls idempotent.
2. Resolve each signal to the stable `Need_Key__c` of the matching Audience Need (avoid match by Name). Unmatched keys go to exception handling, not auto-creation of arbitrary categories.
3. Aggregate per Need for rolling windows (7 and 28 days) and calculate HIVE scores; reuse `Signal_Count__c` and `Signal_Date__c` after verifying live field metadata.
4. Rank the needs; create/maintain one content planning candidate per Need, platform, and planning period. Avoid duplicate videos on rerun.
5. Manual review approves original scripts/videos before distribution. Do not auto-publish or consume paid APIs as a side effect.

## Draft scoring specification (pending business validation)
Each metric is normalized to 0–100:
- Volume 30%: number of unique actionable signals in the last 28 days, capped at a configurable threshold.
- Intensity 25%: classification of urgency/strength supported by evidence; no fabricated sentiment values.
- Growth 20%: compare the most recent 7 days with the preceding 7; handle zero baseline explicitly.
- Recency 15%: decays by age of most recent verified signal; exclude future-dated records.
- Quality 10%: confidence/actionability/deduplication; do not treat unclassified values as high quality.

`HIVE = ROUND(0.30*Volume + 0.25*Intensity + 0.20*Growth + 0.15*Recency + 0.10*Quality, 2)`

Missing evidence should mark a score `Incomplete`; it must **not** silently produce a misleading low score. Define minimum-sample requirements and anti-spam treatment before production use.

## Proposed additions to existing WDE_Audience_Need__c (NOT deployed)
| Label | API Name | Type | Required | Unique | External ID | Default |
|---|---|---|---|---|---|---|
| HIVE Volume | `HIVE_Volume__c` | Number(5,2) | No | No | No | none |
| HIVE Intensity | `HIVE_Intensity__c` | Number(5,2) | No | No | No | none |
| HIVE Growth | `HIVE_Growth__c` | Number(5,2) | No | No | No | none |
| HIVE Recency | `HIVE_Recency__c` | Number(5,2) | No | No | No | none |
| HIVE Quality | `HIVE_Quality__c` | Number(5,2) | No | No | No | none |
| HIVE Score | `HIVE_Score__c` | Formula(Number 5,2) | N/A | No | No | N/A |
| HIVE Scored At | `HIVE_Scored_At__c` | Date/Time | No | No | No | none |
| HIVE Evaluation Status | `HIVE_Evaluation_Status__c` | Picklist | No | No | No | Incomplete |

Picklist options: `Incomplete` (default), `Ready`, `Insufficient Data`, `Error`. Components must be bounded 0–100 by validation or Flow normalization. The formula should only expose a score when the status is Ready and all five components are present.

The live EntityDefinition query returned no custom Content Planning object. New object `WDE_Content_Plan__c` is proposed in feature branch only; deployment is not yet validated. The object uses a stable External ID to prevent duplicate proposals.

## Flow-first implementation plan
- Draft autolaunched `WDE_Recalculate_HIVE`: input Need ID, Get signals from 28-day window, count in memory, calculate Volume/Growth/Recency, and perform one record update outside loop; structured fault path; no callout.
- Invoker: scheduled orchestration or explicit admin action; do not activate automatically.
- Guard against concurrency: one effective calculation per Need at a time, idempotent update of result fields and timestamp.
- Draft autolaunched `WDE_Propose_Content_Plan`: only create one YouTube Shorts weekly proposal when HIVE is Ready and score >=60; the stable Plan Key uses the immutable 18-character Salesforce Need Id plus platform and week (not a possibly 255-character External Key); human approval gate; no auto publish.

## Release gate
1. Retrieve actual object/field/Flow metadata from WDE and reconcile with source, including field visibility to integration user.
2. Verify existing HIVE/planning schema and active/latest Flows, entry conditions, DML and fault paths.
3. Build metadata on a feature branch and run local XML checks.
4. Run Salesforce `sf project deploy validate` against org ID `00Dfj00000eVCOVEA4` (CLI execution limit may require an approved gateway fix).
5. Deploy only after successful validation, verify deployment ID, installed fields, active versions (without activating new Flow), and sample records.
6. Record all evidence on Issue #35 and link commit/PR.

## Current blocker
`scripts/sf-bash.mjs` imposes a 15,000 ms `spawnSync` timeout. One combined CLI version + org check + SOQL + metadata retrieve invocation failed with `ETIMEDOUT`. No deployment should be claimed from that attempt. Gateway changes require separate security review.

## Proposed new custom object — WDE Content Plan (NOT deployed)
Object Label: **WDE Content Plan**; API Name: `WDE_Content_Plan__c`; plural: **WDE Content Plans**; Name standard Text; sharing ReadWrite; enable reports/search.

| Field Label | API Name | Salesforce type | Required | Unique | External ID | Default/Relationship |
|---|---|---|---|---|---|---|
| Plan Key | `Plan_Key__c` | Text(255) | No | Yes | Yes | none; immutable per-org key `NEED_ID|YOUTUBE_SHORTS|YYYY-MM-DD` (44 characters, avoids truncating a 255-character Need External Key) |
| Audience Need | `Audience_Need__c` | Lookup(WDE_Audience_Need__c) | No | No | No | On delete SetNull |
| Need External Key | `Need_ExternalKey__c` | Text(255) | No | No | No | copy `Need_Key__c` for traceability |
| Platform | `Platform__c` | Restricted Picklist | No | No | No | YouTube Shorts |
| Status | `Status__c` | Restricted Picklist | No | No | No | Proposed |
| Planning Period | `Planning_Period__c` | Date | No | No | No | none |
| HIVE Score Snapshot | `HIVE_Score_Snapshot__c` | Number(5,2) | No | No | No | none |
| Topic | `Topic__c` | Text(255) | No | No | No | none |
| Hook | `Hook__c` | Text(255) | No | No | No | none |
| Video Script | `Video_Script__c` | Long Text Area(32768), visibleLines=12 | No | No | No | none |
| Review Notes | `Review_Notes__c` | Long Text Area(32768), visibleLines=12 | No | No | No | none |
| Video Asset URL | `Video_Asset_URL__c` | URL(255) | No | No | No | none |
| Published At | `Published_At__c` | DateTime | No | No | No | none |
| Source As Of | `Source_As_Of__c` | DateTime | No | No | No | none |

Platform options (all): **YouTube Shorts** (default), **Instagram Reels**, **Facebook Reels**, **Multi-platform**. Status options (all): **Proposed** (default), **Approved**, **In Production**, **Ready**, **Published**, **Rejected**, **Archived**. When creating a planning record through Flow, use the stable `Need_Key__c` as relationship resolution, never the human-readable `Name`.

## Limitations to resolve before production
- Existing Groq classification only returns `ID|CATEGORY|CONTEXT|END`: there is no legitimate intensity/quality numeric evidence yet. `WDE_Recalculate_HIVE` deliberately leaves these metrics unchanged and the evaluation state Incomplete until populated from a verified source. Do **not** fill them with guessed constants.
- Only YouTube Shorts proposal generation exists in the draft; script generation, media rendering, and distribution have not been implemented or tested.
- Neither Flow has been activated. Need explicit orchestration/scheduler and bulk governor testing before operational rollout.
- Branch is not the default checkout in `.github/workflows/sf.yaml`; checking out only main will **not** validate these branch-only metadata files. Use an approved branch-aware validation path; do not mislabel main validation as PR validation.

## Idempotent weekly Plan Key clarification

The unique `Plan_Key__c` is built from the immutable **Salesforce Need record ID** plus `|YOUTUBE_SHORTS|` and ISO week-start date. This prevents collisions/truncation if the external `Need_Key__c` is up to 255 characters. The full audience `Need_Key__c` is **also persisted separately** in `Need_ExternalKey__c` to support cross-org relationship mapping; the Plan Key guarantees uniqueness within this WDE org, not identical IDs across orgs. Do not resolve Audience Need by display `Name`.
