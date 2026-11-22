# WDE — Autonomous Sermon Segment Audio QA (Issue #51)

## Authoritative boundaries
Two independent pipelines:

1. **Audience:** YouTube viewer comments → WDE Audience Signals → Audience Needs → HIVE components / HIVE Score → Content Plan. **100% of need/urgency/quality/evidence comes from comments.** Sermon audio, transcript, video analysis, segment metadata and AI QA may never modify these values or ranking. Source sermon may be unrelated to the needs surfaced in comments.
2. **Segment QA:** Sermon Source and indexed transcript → Segment candidate and strict seven-field/caption checks → persisted Sermon Segment → Gemini video **only at that segment's own Start_Ms/End_Ms**, compare the segment transcript against actual audio → automatic verdict PASS or FAIL. **No human approval on the success or semantic-mismatch path.**
3. **Only unresolved technical/system faults go to humans.** SYSTEM_ERROR is not PASS. A technical outage/invalid response is retried at most three times, then requires investigation.

## Existing Salesforce object and new fields
Existing `Sermon_Segment__c` relationship to `Sermon_Source__c`, `Start_Ms__c` (Number 18,0), `End_Ms__c` (Number 18,0), `Start_Index__c`, `End_Index__c`, `Transcript_Text__c` (Long Text Area), `WDE_Stitch_Open__c` and `Segment_Key__c` (unique External ID) were verified via live FieldDefinition SOQL in WDE org `00Dfj00000eVCOVEA4`. Sample segment durations range from ~139 seconds to ~25 minutes. The previous Source QA always checked **only 0–20 seconds**, so must NOT be reused as segment evidence.

New segment-only fields, all optional, unique=false, External ID=false:
| Label | API | Type | Default | Purpose |
|---|---|---|---|---|
| Audio QA Status | `Audio_QA_Status__c` | restricted Picklist | PENDING | PENDING, PASS, FAIL, RETRY_PENDING, SYSTEM_ERROR |
| Audio QA Notes | `Audio_QA_Notes__c` | Long Text Area (8192), visibleLines=8 | null | Bounded machine verdict or technical error |
| Audio QA Checked At | `Audio_QA_Checked_At__c` | DateTime | null | Last executed attempt time |
| Audio QA Attempts | `Audio_QA_Attempts__c` | Number(3,0) | 0 | Max 3 provider attempts per cycle |

## Flow and safety behavior
`WDE_Verify_Sermon_Segment_Audio` (autolaunched Flow) accepts `varS_SegmentId`. It reads Segment by Id and Source by lookup. It rejects invalid/empty/out-of-range segment data and Source video ID. For a closed segment with nonempty transcript <=25000 characters, it converts milliseconds to exact-second-bounded Gemini video metadata and compares the **full submitted segment transcript** with the original audio from YouTube. Any rejected/too-large transcript must never be truncated and claimed PASS.

Model output must have one explicit prefix `PASS|`, `FAIL|` or `SYSTEM_ERROR|`, plus `AUDIO:` and `TIMESTAMPS:`, 46–7999 characters and STOP finish reason. A 200 response alone does not mean PASS. PASS/FAIL are final machine classifications. A callout/model transport error becomes RETRY_PENDING until attempt 3, then SYSTEM_ERROR, recorded on the segment. A failed QA record update itself stops with a Flow fault, not a false PASS.

`Tgr_WDE_Auto_Segment_Audio_QA` (RecordAfterSave, AsyncAfterCommit) invokes this Flow only for closed segment with PENDING or RETRY_PENDING status and attempts <3. `Tgr_WDE_Reset_Segment_Audio_QA` (RecordBeforeSave) invalidates stale QA on a material segment text/boundary/source change. `Tgr_WDE_Auto_Finalize_Summary` is gated by PASS, so previously provisional summaries are not finalized from unverified segments.

Existing `Tgr_WDE_Run_Stage_A` already automatically advances valid boundaries to Stage B. `Tgr_WDE_Run_Stage_B` advances AI enrichment automatically to CommitApproved (no human hold), and Stage C persists strictly validated seven-field/caption coverage lines with no human approval. Preserve DML bulk processing, stable Segment_Key, deterministic index checks, terminal error handling, and closed-segment guards. Existing `varHumanReviewed` is obsolete and ignored in the existing persistence contract (to avoid breaking external invocation inputs); do not spoof it.

## Test gates
- In org `00Dfj00000eVCOVEA4`, check-only/then deploy core package `manifest/wde-segment-audio-qa-51.xml`. Verify active/latest version of segment QA in Tooling.
- Run one real closed segment QA, inspect HTTP/code/Flow status and SOQL readback from **Sermon_Segment__c**; ensure no `Sermon_Source__c.Gemini_Audio_QA_*` writes or HIVE writes.
- Check-only/then deploy automation package `manifest/wde-segment-audio-automation-51.xml`; verify all new/updated Flow active versions.
- Test negative paths: missing Segment ID; incomplete/invalid transcript; source missing/invalid YouTube ID; malformed provider output; media inaccessible; retry cap; QA FAIL should not escalate to human, and no summary finalization without PASS.
- Verify no orphan human approval in the Stage B→C normal branch; check output record status and absence of duplication on rerun.
- Verify Audience Flow `WDE_Fetch_YouTube_Comments` and `WDE_Recalculate_HIVE` unchanged active/version and compare a read-only HIVE snapshot before/after.
- No auto-publication, new credentials, Apex, LWC, paid scheduler or additional middleware.

## Known limitations to evaluate with actual evidence
- Gemini audio/video access for long original YouTube clips can be rate limited or unavailable; free-tier quotas might be insufficient for a high-volume backfill. Never invent provider capacity.
- A model PASS is a bounded machine judgment, not mathematical transcript certainty or copyright clearance. Technical failure remains SYSTEM_ERROR, not human editorial approval.
- Source-level legacy `WDE_Verify_YouTube_Gemini_Audio` is separate and must be retired once segment QA is independently verified; do not confuse its 0–20-second result with a Segment PASS.
- Asynchronous Flow replay/concurrent changes need targeted idempotency validation; strict deduplication of Segment_Key during Stage C is preserved.
