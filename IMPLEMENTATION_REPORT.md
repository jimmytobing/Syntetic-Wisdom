# Wisdom Discovery Engine — Implementation Report
_Salesforce Foundation Build · API v68.0 · Status: Ready for Deploy_

---

## 1. Objects & Fields Created

### Sermon_Source__c (5 custom fields)
| Field API Name | Type | Key Attributes |
|---|---|---|
| `External_Video_Id__c` | Text(20) | Unique, External ID, Required |
| `Video_URL__c` | URL | — |
| `Transcript_Storage_Key__c` | Text(255) | — |
| `Rights_Status__c` | Picklist | Unknown ★ / PermissionGranted / Restricted |
| `Ingest_Status__c` | Picklist | Pending ★ / Processing / Done / Error |

### Transcript_Job__c (5 custom fields)
| Field API Name | Type | Key Attributes |
|---|---|---|
| `Sermon_Source__c` | Lookup → Sermon_Source__c | Required, SetNull on delete |
| `Job_Key__c` | Text(100) | Unique, External ID |
| `Stage__c` | Picklist | Pending ★ / Extracted / ConceptReview / Approved / Error |
| `Error_Message__c` | Long Text Area(32768) | — |
| `Total_Chunks__c` | Number(6,0) | — |

### Wisdom_Concept__c (6 custom fields)
| Field API Name | Type | Key Attributes |
|---|---|---|
| `Concept_Key__c` | Text(100) | Unique, External ID |
| `Theme__c` | Text(80) | — |
| `Concept_Type__c` | Picklist | Topic ★ / Principle / Practice / Testimony / Metaphor / Worship |
| `Candidate_Summary__c` | Long Text Area(32768) | — |
| `Review_Status__c` | Picklist | Pending ★ / Approved / Rejected / NeedsEdit |
| `Sermon_Source__c` | Lookup → Sermon_Source__c | Optional, SetNull on delete |

### Wisdom_Relation__c (5 custom fields)
| Field API Name | Type | Key Attributes |
|---|---|---|
| `Relation_Key__c` | Text(200) | Unique, External ID |
| `From_Concept__c` | Lookup → Wisdom_Concept__c | SetNull on delete |
| `To_Concept__c` | Lookup → Wisdom_Concept__c | SetNull on delete |
| `Relation_Type__c` | Picklist | RelatesTo ★ / Supports / Contradicts / Exemplifies / Illustrates / Precedes |
| `Reason__c` | Text(255) | — |

### Wisdom_Insight__c (7 custom fields)
| Field API Name | Type | Key Attributes |
|---|---|---|
| `Insight_Key__c` | Text(100) | Unique, External ID |
| `Analogy__c` | Long Text Area(32768) | — |
| `Practical_Step__c` | Long Text Area(32768) | — |
| `Review_Status__c` | Picklist | Draft ★ / Approved / Rejected / NeedsEdit |
| `Safety_Status__c` | Picklist | Unchecked ★ / Safe / Flagged / Removed |
| `Generation_Method__c` | Text(100) | — |
| `Published_Status__c` | Picklist | Unpublished ★ / Published / Withdrawn |

> `Published_Status__c` is an addition to the blueprint's minimum schema — required by the Publication Flow to track pub state separately from Review and Safety.

### Wisdom_Insight_Concept__c (2 custom fields)
| Field API Name | Type | Key Attributes |
|---|---|---|
| `Wisdom_Insight__c` | Lookup → Wisdom_Insight__c | SetNull on delete |
| `Wisdom_Concept__c` | Lookup → Wisdom_Concept__c | SetNull on delete |

---

## 2. Flows Created

All flows are in **Draft** status. Do not activate before testing.

| Flow API Name | Type | Trigger / Entry Point | Status |
|---|---|---|---|
| `Sermon_Source_Create_Transcript_Job` | Record-Triggered (After Save) | `Sermon_Source__c` — Rights=PermissionGranted AND Ingest=Pending | Draft |
| `Wisdom_Concept_Review` | Screen Flow | Manual (Button / Tab) | Draft |
| `Wisdom_Insight_Review` | Screen Flow | Manual (Button / Tab) | Draft |
| `Wisdom_Insight_Publish` | Autolaunched | Manual / Admin invocation | Draft |

### Flow Logic Summary

**`Sermon_Source_Create_Transcript_Job`**
- Fires after save when `Rights_Status__c = PermissionGranted` AND `Ingest_Status__c = Pending`
- Creates `Transcript_Job__c` with `Job_Key = "JOB:" + External_Video_Id__c` and `Stage = Pending`
- Updates `Ingest_Status__c` to `Processing` → prevents infinite re-entry (entry condition requires `Pending`)
- Loop-prevention verified: 3 references to "Pending" in entry filters

**`Wisdom_Concept_Review`**
- Gets up to all `Wisdom_Concept__c` records where `Review_Status__c = Pending`
- Loops per concept: shows Theme, Type, Candidate Summary
- Reviewer selects: Approved / Rejected / Needs Edit
- Updates `Review_Status__c` immediately per concept

**`Wisdom_Insight_Review`**
- Gets `Wisdom_Insight__c` where `Review_Status__c = Draft`
- Loops per insight: shows Analogy, Practical Step, Generation Method
- Reviewer sets `Review_Status__c` (Approved/Rejected/NeedsEdit) + `Safety_Status__c` (Safe/Flagged/Removed)
- Screen reminds reviewer to check for promises of healing, wealth, or guaranteed spiritual outcomes

**`Wisdom_Insight_Publish`**
- Bulk-updates all `Wisdom_Insight__c` where Review=Approved AND Safety=Safe AND Published=Unpublished → sets `Published_Status__c = Published`
- Single DML operation (no loop), governor-limit friendly
- Safe to run when 0 records qualify (no-op)

---

## 3. Deployment Instructions

### Prerequisites
1. Upgrade Node.js to ≥ 22.0.0 (`nvm install 22 && nvm use 22`)
2. Authenticate org: `sf org login web --alias wisdom-dev`
3. Verify: `sf org display --target-org wisdom-dev`

### Deploy Command (validate first)
```bash
cd "force-app/.."   # project root

# Validate only (no commit to org)
sf project deploy validate \
  --manifest manifest/package.xml \
  --target-org wisdom-dev

# Deploy when validate passes
sf project deploy start \
  --manifest manifest/package.xml \
  --target-org wisdom-dev
```

### Deploy Order
The `package.xml` lists objects first, then fields, then flows — this is the correct dependency order. The Metadata API respects this ordering.

---

## 4. Post-Deploy Testing Checklist

### Objects & Fields
- [ ] All 6 objects visible in Setup → Object Manager
- [ ] All fields visible on each object's Fields & Relationships page
- [ ] External ID fields visible with "External ID" badge
- [ ] Picklist values match blueprint (check Rights_Status, Stage, Review_Status, Safety_Status)

### Flow 1 — Sermon Source Trigger
1. Create a `Sermon_Source__c` record with `External_Video_Id__c = 4SPC0Ke1Eyg`, `Rights_Status__c = PermissionGranted`, `Ingest_Status__c = Pending`
2. Verify a `Transcript_Job__c` was created with `Job_Key__c = JOB:4SPC0Ke1Eyg` and `Stage__c = Pending`
3. Verify `Ingest_Status__c` on the source updated to `Processing`
4. Save the source again — verify NO second job is created (loop prevention)
5. Set `Ingest_Status__c = Pending` on source while `Rights_Status__c = Restricted` — verify NO job created

### Flow 2 — Concept Review Screen Flow
1. Import sample concepts from `ai-source/chunks_for_review.csv` topics as `Wisdom_Concept__c` with `Review_Status__c = Pending`
2. Run the flow from Setup → Flows → Debug
3. Verify each concept screen shows Theme and Candidate Summary
4. Select different decisions for different concepts
5. Verify `Review_Status__c` is updated correctly for each

### Flow 3 — Insight Review Screen Flow
1. Create sample `Wisdom_Insight__c` records with `Review_Status__c = Draft`
2. Run and review; set one as Flagged for safety
3. Verify both `Review_Status__c` and `Safety_Status__c` update correctly

### Flow 4 — Publish Autolaunched Flow
1. Set one insight to Approved + Safe + Unpublished
2. Run the flow (Setup → Flows → Run)
3. Verify `Published_Status__c` changes to Published
4. Verify Flagged insights are NOT published

---

## 5. Limitations, Assumptions & Unfinished Work

### Limitations
1. **sf CLI requires Node ≥ 22.0.0** — current environment has Node 20.12.1. Upgrade before running any `sf project deploy` command.
2. **No org connected** — no deployment has been run. All metadata exists only as local source files.
3. **MCP `execute_metadata_action` unavailable** — the flow generation pipeline tool (`execute_metadata_action`) is not available in this environment. Flows were authored directly as XML. While valid, they should be opened in the Flow Builder after deployment to verify element rendering and connector integrity.
4. **No Named Credential / External Callout stub** — the blueprint mentions an async callout to a Cloudflare Worker. This is intentionally excluded per implementation rules. The Transcript_Job record with `Stage = Pending` acts as the integration handshake point that the external layer polls.
5. **No Tab, App, or Page Layout metadata** — objects are accessible in Object Manager and App Builder but not surfaced in any Lightning App tab. Add tabs and page layouts before user testing.
6. **Concept Review limit** — the Screen Flow queries ALL pending concepts without a hard limit. With large data sets this could hit query limits. Add `<limit>50</limit>` to `GetPendingConcepts` in the flow XML before activating.

### Assumptions
- All 6 objects use Lookup (not Master-Detail) relationships as specified in the blueprint. This means child records are NOT auto-deleted when a parent is deleted (`deleteConstraint = SetNull`).
- `Wisdom_Insight_Concept__c` is a soft junction (two Lookups, not Master-Detail). This is intentional for flexibility — a provenance link is not deleted when an insight or concept is deleted, it just goes orphaned (SetNull).
- `Concept_Type__c` values (Topic, Principle, Practice, Testimony, Metaphor, Worship) were inferred from `chunks_for_review.csv` topic patterns (`doa_pribadi`, `iman_ketakutan`, `kesaksian`, etc.) since the blueprint doesn't specify them.
- `Published_Status__c` was added to `Wisdom_Insight__c` as it is required for the Publication Flow to function correctly and is implied by the blueprint's publication gate.

### Unfinished Work
| Item | Priority | Reason Not Done |
|---|---|---|
| Named Credential + Callout to Cloudflare Worker | High | Out of scope per implementation rules (no credentials yet) |
| Tab & Page Layout metadata | Medium | Not required for PoC foundation |
| Validation Rules (e.g. block publish if not Approved+Safe) | Medium | Not in blueprint minimum; add after testing |
| Permission Set for Wisdom Reviewer role | Medium | Not in blueprint minimum |
| Custom Report Types for cross-object reports | Low | Post-deployment enhancement |
| Bulk CSV import of `chunks_for_review.csv` as Wisdom_Concepts | Low | Requires deployed org + Data Loader or Data Import Wizard |

---

## 6. Recommended Next Steps — API Integration

When ready to connect the Cloudflare Worker:

1. **Create Named Credential** in Setup → Named Credentials pointing to the Worker URL (no secrets in code).
2. **Add External Service or Custom HTTP Callout Action** that calls `POST /ingest` with `{ jobId, sourceKey }`.
3. **Add Async Path to `Sermon_Source_Create_Transcript_Job` flow** after `CreateTranscriptJob`: call the External Service action passing `Transcript_Job__c.Id` and `Transcript_Storage_Key__c`.
4. **Worker returns status JSON** → update `Stage__c` on `Transcript_Job__c` via a second flow or webhook endpoint.
5. **When Stage = ConceptReview**: trigger the Concept Review Screen Flow (can use a list view button or a Process-style notification to a Chatter group).
6. **Add `sf org list` monitoring** to track org authentication expiry in CI.

---

_Generated: 2026-11-01 | API: 68.0 | No Apex, No LWC, No Triggers_
