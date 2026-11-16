# WDE Groq segmentation + conditional Gemini Audio QA (Issue #54)

Scope authorized: **Flow-first only; no Apex, HMAC receipt, dedicated OAuth QA release, external receipt verifier, or runtime GitHub Actions dependency.** GitHub Actions remains a trusted CI/CD and RCA gateway.

## Business sequence

1. Groq segments transcript in Stage A. Existing structure checks and bounded retry must succeed before Stage B.
2. Groq enriches validated boundaries in Stage B. `SUCCESS` and **nonempty** `bLines` are required. Stage B directly sets `Approved_Enrichment__c` and `Status__c = CommitApproved`, triggering existing Stage C orchestration; failure follows existing bounded RetryPending/Failed behavior. No separate release approval.
3. Stage C persists segments with existing idempotent external keys. No mass backfill.
4. Every segment has `Audio_QA_Required__c` (Checkbox, false by default). Gemini Audio QA async trigger runs **only if** a closed segment has the flag true, status PENDING or RETRY_PENDING, attempts under 3, and relevant field changed.
5. The existing before-save `Tgr_WDE_Reset_Segment_Audio_QA` now automatically sets the flag true when transcript, source or timestamps are materially changed externally (and invalidates prior QA). Internal one-time Gemini auto-correction retains `RETRY_PENDING` without resetting the correction counter. Other suspected audio mismatches can be flagged explicitly by a reviewer or future grounded Groq signal. This **does not automatically detect all initial segmentation uncertainty**.
6. Existing `WDE_Verify_Sermon_Segment_Audio` handles Gemini PASS, FAIL with bounded audio-derived correction/recheck, and technical failures up to SYSTEM_ERROR. No Audience/HIVE modification from audio QA.
7. A bounded `WDE_Auto_Advance_Batch` branch allows **specific reviewed historical** NeedsCommitReview Batch to advance to Stage C when valid enrichment exists. Invoke only after checking target org, rights/record data and dependency; never mass-trigger across historical batches.

## Safe deployment order

1. Pre-check live org `00Dfj00000eVCOVEA4`, existing active Flow versions, Batch #8, segment status distribution and whether QA journal has records.
2. Validate and deploy `manifest/wde-flow-only-groq-gemini-54.xml` via the trusted Salesforce gateway.
3. Verify field default false, Flow metadata/active versions and exactly scoped test result. Before sending any write to a historical Batch, inspect live state, source rights, enrichment and existing segments.
4. Only then validate and deploy `manifest/wde-empty-package-54.xml` with `manifest/wde-qa-oauth-retire-54.xml` as postDestructiveChanges (Flow, Permission Set, Custom Permission). **Do not delete stored WDE_QA_Release__c journal or historical receipt fields without data/retention review.**
5. Read back Salesforce version, Batch results, new segment QA flag and Gemini callout results for a controlled segment with the flag true. Confirm false flag results in zero Gemini calls, PASS and FAIL actual, bounded retry and no duplicate Stage C segment creation.

## Known limitations / blockers

- The selective Audio QA flag is set automatically on material external transcript/source/timing changes, or explicitly for suspected mismatches; it is **not a complete initial-segmentation confidence model**. Determine any additional Groq evidence-based triggers in a later validated change.
- Previously the GitHub runner failed before any job executed, across unrelated workflows. Removing the obsolete OAuth QA GitHub workflow reduces unnecessary runs but does **not** fix account-level Actions runner allocation/billing. No untrusted shell or alternate org may be used to bypass the gate.
- Groq Authorization literals were scrubbed from the PR source. The External Credential header now references encrypted principal parameter `WDE_Groq_External.ApiKey`. **Before deploying these credential metadata files**, configure and verify the principal authentication parameter/permission mappings in target org. Removing source literals does **not** rotate/revoke the exposed historical key; owner must rotate it securely. Do not break existing active Groq callouts.
- PR #52 remains Draft. No OAuth QA permission assignment or activation is required for the simplified design.

## Acceptance

Verified end-to-end Groq segmentation → Segment DML, source coverage without overlaps/gaps, zero Gemini calls for not-required segments, actual flagged-segment PASS and FAIL/recovery, and valid historical Batch controlled replay. Workflow CI must PASS; PR ready for final review only after actual Salesforce and GitHub evidence.

## Audio QA self-rescheduling RCA (16 November 2026)
Live Salesforce evidence: all 52 batch records Completed, contiguous transcript positions 1..78471, all 21 canonical Segment_Key ranges contiguous 0..1863, and 27 of 27 Audience Signals YouTube-keyed. Two flagged closed segments have Async_Error__c=SELF_RESCHEDULING_ASYNC_PATH. Worker DML on QA status/attempt requalified the same record-triggered async flow.
Minimal Flow-only fix: async trigger runs when Audio_QA_Required__c changes to true, not when its worker mutates status/attempt. A schedule-triggered recovery Flow processes only closed, opted-in PENDING/RETRY_PENDING with attempts under 3; daily 01:00Z in org timezone, batch size 1, via existing Gemini QA worker and bounded error logging. Genuine model FAIL stays FAIL; no action on unflagged PENDING or Audience/HIVE.
Prove activation/behavior after deployment and next scheduled run; no runtime success is implied by repository commit. Groq credential rotation and old OAuth QA metadata retirement require independent verification.
