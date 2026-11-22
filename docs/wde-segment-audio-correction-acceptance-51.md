# Issue #51 — Segment Audio Correction Acceptance (2026-11-15)

## State
Candidate source implemented on PR #52; **not verified in Salesforce until check-only, deploy, readback and runtime tests pass**. No mass backfill. No Audience/HIVE metadata changes.

## Automated sequence
1. Audio QA examines only the exact original YouTube audio for a closed Sermon Segment.
2. PASS: save PASS on the same segment. Summary is eligible to finalize.
3. FAIL: optionally return full bounded `CORRECTED_TRANSCRIPT` on the same response, without invented content. Candidate must be distinct, 30–25000 chars, within 70–130% of current transcript length, contain no pipe delimiter, and arrive with STOP.
4. One safe candidate per material revision: store `Audio_QA_Original_Transcript__c`, update segment transcript, set `Audio_QA_Correction_Attempts__c=1`, `RETRY_PENDING` and increment attempts. Before-save trigger must **not** reset this internal correction. Async trigger rechecks audio in a new call; never promote without independent PASS.
5. Recheck FAIL: terminal semantic FAIL with no human editorial approval. Unsafe/missing candidate: terminal FAIL without transcript rewrite. Provider/system error: RETRY_PENDING up to 3 total calls then SYSTEM_ERROR for human technical investigation.
6. Material external edit to transcript/source/time bounds: reset QA PENDING, attempts=0, correction count=0 (but preserve old-transcript audit).

## Controlled acceptance protocol (no mass backfill)
- **Preflight:** confirm immutable WDE org Id `00Dfj00000eVCOVEA4`, actual active/latest versions, field schemas, permission set assigned, no other automation writes to Audio QA fields or Audience/HIVE.
- **Deploy:** exact `manifest/wde-segment-audio-correction-51.xml` pinned SHA, validate then deploy only on SUCCESS; independently verify deployed fields, Flow active/latest IDs and field access.
- **PASS:** choose *one* existing closed segment with a faithful audio transcript; invoke QA once; record Salesforce HTTP, Flow status, Gemini HTTP/STOP, SOQL persisted PASS. Never create fabricated PASS evidence.
- **FAIL + autocorrect:** choose *one* controlled closed segment with known audio mismatch and safe-length replacement; preserve before snapshot; one QA yields RETRY_PENDING, old transcript stored and candidate persisted; async independent recheck yields PASS or terminal FAIL. Check that corrections never exceed 1 and no loops/duplicate segments.
- **Provider errors:** deterministic test injection needed to simulate 429, malformed JSON, timeout and 3 retries without wasting Gemini calls. Do not simulate with real provider failures or forge stored status. Verify `SYSTEM_ERROR` is the *only* human escalation condition.
- **Transcript material edit:** controlled edit of one test segment, confirm before-save reset count and recheck, verify external edits cannot accidentally preserve stale PASS.
- **Stage A→B→C:** one eligible sample `WDE_Batch_Run__c` through real active Flows; collect transitions, segment records, no duplicate Segment_Key, QA after commit, final summary only after PASS.
- **Historical replay:** one historical eligible segment only, must be deliberately requeued once; validate idempotency and max three provider calls; preserve independent baseline snapshots.
- **Audience/HIVE:** capture `WDE_Audience_Signal__c`, `WDE_Audience_Need__c` and HIVE-record counts/metrics before/after QA; source dependency must remain comments-only; compare actual stored values, not just Flow code. Never write these objects in QA.
- **Cleanup:** remove active gateway request from Issue after execution, document raw sanitized response/exit codes and deployment IDs; do not merge PR while any acceptance row remains open.

## Source scope
`WDE_Verify_Sermon_Segment_Audio`, `Tgr_WDE_Reset_Segment_Audio_QA`, two new Sermon_Segment fields, existing WDE permission set, isolated manifest. No Apex, scheduler, audience dependency or external credentials added.

**Risk:** independent second call is the same provider and does not guarantee transcription ground truth. When correction cannot be proven, leave FAIL rather than hallucinating. Any mismatch in long transcript or large boundary shift is intentionally fail-closed.
