# WDE Groq segmentation + conditional Gemini Audio QA (Issue #54)

Scope authorized: **Flow-first only; no Apex, HMAC receipt, dedicated OAuth QA release, external receipt verifier, or runtime GitHub Actions dependency.** GitHub Actions remains a trusted CI/CD and RCA gateway.

## Business sequence

1. Groq segments transcript in Stage A. Existing structure checks and bounded retry must succeed before Stage B.
2. Groq enriches validated boundaries in Stage B. `SUCCESS` and **nonempty** `bLines` are required. Stage B directly sets `Approved_Enrichment__c` and `Status__c = CommitApproved`, triggering existing Stage C orchestration; failure follows existing bounded RetryPending/Failed behavior. No separate release approval.
3. Stage C persists segments with existing idempotent external keys. No mass backfill.
4. Every segment has `Audio_QA_Required__c` (Checkbox, false by default). Gemini Audio QA async trigger runs **only if** a closed segment has the flag true, status PENDING or RETRY_PENDING, attempts under 3, and relevant field changed.
5. Set the flag true only when transcript/audio uncertainty, timing disagreement or boundary concerns objectively require audio evidence. It can be set explicitly after editorial review or by a future proven quality-signal Flow. The new field **does not automatically detect** uncertainty.
6. Existing `WDE_Verify_Sermon_Segment_Audio` handles Gemini PASS, FAIL with bounded audio-derived correction/recheck, and technical failures up to SYSTEM_ERROR. No Audience/HIVE modification from audio QA.
7. A bounded `WDE_Auto_Advance_Batch` branch allows **specific reviewed historical** NeedsCommitReview Batch to advance to Stage C when valid enrichment exists. Invoke only after checking target org, rights/record data and dependency; never mass-trigger across historical batches.

## Safe deployment order

1. Pre-check live org `00Dfj00000eVCOVEA4`, existing active Flow versions, Batch #8, segment status distribution and whether QA journal has records.
2. Validate and deploy `manifest/wde-flow-only-groq-gemini-54.xml` via the trusted Salesforce gateway.
3. Verify field default false, Flow metadata/active versions and exactly scoped test result. Before sending any write to a historical Batch, inspect live state, source rights, enrichment and existing segments.
4. Only then validate and deploy `manifest/wde-empty-package-54.xml` with `manifest/wde-qa-oauth-retire-54.xml` as postDestructiveChanges (Flow, Permission Set, Custom Permission). **Do not delete stored WDE_QA_Release__c journal or historical receipt fields without data/retention review.**
5. Read back Salesforce version, Batch results, new segment QA flag and Gemini callout results for a controlled segment with the flag true. Confirm false flag results in zero Gemini calls, PASS and FAIL actual, bounded retry and no duplicate Stage C segment creation.

## Known limitations / blockers

- The selective Audio QA flag is an explicit decision point, **not an automatic confidence model**; determine automatic triggers using grounded Groq data in a later change.
- Previously the GitHub runner failed before any job executed, across unrelated workflows. Removing the obsolete OAuth QA GitHub workflow reduces unnecessary runs but does **not** fix account-level Actions runner allocation/billing. No untrusted shell or alternate org may be used to bypass the gate.
- Groq Named Credential source contains a credential-like static Authorization value; rotate/revoke and move to a secured secret-managed External Credential under authorized control, but don't destroy the current Groq authentication before replacement is verified.
- PR #52 remains Draft. No OAuth QA permission assignment or activation is required for the simplified design.

## Acceptance

Verified end-to-end Groq segmentation → Segment DML, source coverage without overlaps/gaps, zero Gemini calls for not-required segments, actual flagged-segment PASS and FAIL/recovery, and valid historical Batch controlled replay. Workflow CI must PASS; PR ready for final review only after actual Salesforce and GitHub evidence.
