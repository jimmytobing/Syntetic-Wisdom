# WDE — Audience Needs → HIVE Score → Content Planning

Issue: https://github.com/jimmytobing/Syntetic-Wisdom/issues/35
Target: Salesforce Developer Edition, Org ID `00Dfj00000eVCOVEA4` (alias `hdbsf`).
Status (12 Nov 2026): **HIVE metadata deployed and verified in WDE** — real deployment `0Affj00000Yxp4YCAR`, 28 components, 0 errors. OAuth source + result-field read FLS deployed; both new Flow definitions installed as **Draft** with `ActiveVersionId=null`. Business runtime HIVE scoring/content plan creation remains NOT activated or E2E verified. PR #36 stays Draft until scoring evidence, scheduling and runtime tests are complete.

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
4. Run `### Sf Deploy` with `mode=validate` (internally `sf project deploy start --dry-run --manifest manifest/wde-hive-pr35.xml --test-level NoTestRun`) against WDE Org ID `00Dfj00000eVCOVEA4`. Do not confuse this with unsupported `sf project deploy validate --test-level NoTestRun`.
5. Deploy only after successful validation, verify deployment ID, installed fields, active versions (without activating new Flow), and sample records.
6. Record all evidence on Issue #35 and link commit/PR.

## Current blocker
Salesforce dry-run `0Affj00000Yt3g4CAB` failed with 13 component errors. Read-only query of 8 `PermissionSetAssignment` records for the connected CLI user confirmed `PermissionsCustomizeApplication=false` AND `PermissionsManageInteraction=false` on **all 8 assignments**, including the profile-owned PermissionSet; one permission set has `PermissionsModifyAllData=true`, but that does not grant the missing setup/Flow permissions. Account permission remediation requires explicit owner authorization and follow-up check-only. Evidence is saved on Issue #35.

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
- The reusable `### Sf Deploy` gateway in `.github/workflows/sf.yaml` checks out an immutable feature-branch commit SHA and the named manifest; use the current PR SHA and verify the resulting Salesforce deployment ID. Prior check-only failed because integration-user permissions are insufficient, not because source checkout is unavailable.

## Idempotent weekly Plan Key clarification

The unique `Plan_Key__c` is built from the immutable **Salesforce Need record ID** plus `|YOUTUBE_SHORTS|` and ISO week-start date. This prevents collisions/truncation if the external `Need_Key__c` is up to 255 characters. The full audience `Need_Key__c` is **also persisted separately** in `Need_ExternalKey__c` to support cross-org relationship mapping; the Plan Key guarantees uniqueness within this WDE org, not identical IDs across orgs. Do not resolve Audience Need by display `Name`.

## Live Audience Signal field visibility investigation (12 Nov 2026)

- A 28-day aggregate SOQL on `WDE_Audience_Signal__c.Signal_Date__c` returned HTTP 400 `INVALID_FIELD` to the OAuth integration user (Issue #35 evidence comment `6817694437`). This alone **does not prove that the field is missing**.
- `sf project retrieve start --target-org hdbsf --metadata CustomField:WDE_Audience_Signal__c.Signal_Date__c --wait 1 --json` succeeded (`status=Succeeded`, one file) against WDE Org ID `00Dfj00000eVCOVEA4` (Issue comment `6817719270`). **Field existence is verified.**
- `FieldPermissions` SOQL returned one FLS grant for the field, belonging to profile-owned PermissionSet `X00ex00000018ozh_128_09_04_12_1`, not the integration user's assigned profile-owned PermissionSet `X00e1P000000RmH5QAK` and not any of the seven assigned named sets. The OAuth integration user's effective field read visibility is **LIKELY** blocked; verify the assignment intersection before changing FLS. Evidence comment `6817731771`.
- The integration user must have read access to `Signal_Date__c`, `Signal_Key__c`, `WDE_Audience_Need__c` (and any additional fields used by HIVE) in addition to approved setup/Flow deployment permissions. Re-run the original aggregate read-only query after permission remediation, **before** computing HIVE on live data.

## Verified Salesforce release — Issue #35 (12 November 2026)

- WDE identity: Developer Edition Org ID `00Dfj00000eVCOVEA4` checked live by trusted Sf Deploy gateway.
- OAuth Permission Set `Salesforce_AI_RCA_Metadata_Access` effective `CustomizeApplication=true` and `ManageInteraction=true` (Flow management), confirmed in Issue comments `6821195464` / `6821206681`.
- New read-only `WDE_HIVE_Source_Read` Permission Set deployed by `0Affj00000YwyLECAZ` and idempotently assigned to OAuth integration user (before=0, after=1). Historical `Signal_Date__c` INVALID_FIELD disappeared: 28-day aggregate returned HTTP 200 and **7 signals across 4 Audience Needs**, comment `6829038839`.
- HIVE 28-component manifest `manifest/wde-hive-pr35.xml` validated in Salesforce `0Affj00000Ywk5KCAR` (`checkOnly=true`, zero errors) then deployed `0Affj00000Yxp4YCAR` (`checkOnly=false`, zero errors); evidence comment `6829123483`.
- Post-deployment OAuth read query initially failed for `HIVE_Evaluation_Status__c`. Updated `WDE_HIVE_Source_Read` now includes read-only FLS for all eight Need HIVE fields, 14 Content Plan fields and read on Content Plan object. This validated `0Affj00000Yy7RFCAZ` and deployed `0Affj00000YxB7ACAV` (both success). OAuth HIVE field query now HTTP 200, five sampled records contain `null` status/score/volume/growth/recency (comment `6829254340`), which is **not** a scoring calculation.
- Tooling API `FlowDefinition` confirmed `WDE_Recalculate_HIVE` and `WDE_Propose_Content_Plan` both have non-null latest versions and **null active versions**, comment `6829272476`; no Flow activated. API query of `WDE_Content_Plan__c` confirmed object exists and has **0 records**, comment `6829291402`.

### Remaining functional work before production readiness

1. Groq signal classifier must produce **evidence-backed numeric intensity and quality**; current incoming `ID|CATEGORY|CONTEXT|END` contract has neither. Do not fabricate numeric scores or mark HIVE Ready with missing evidence.
2. Implement and validate auditable mapping from classified comments to intensity and quality, backfill existing signal/need records with traceable source, and enforce anti-spam + minimum sample controls.
3. Perform controlled, explicit runtime tests for both Flows with fault handling, idempotency, permissions, and bulk behavior; define orchestration/schedule and operator approval. Only activate versions and generate Content Plans when those prerequisites are satisfied and authorized.
4. Original AI script/video rendering/distribution are separate downstream phases and **not** implemented by this metadata release.

**Do not claim E2E HIVE or Content Planning completed based solely on successful metadata deployment.**
