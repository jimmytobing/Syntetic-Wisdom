# WDE — Autonomous Sermon Segment Audio QA — Issue #51

## User-approved invariants (15 Nov 2026)
1. **Audience Needs and all HIVE components are 100% based on actual YouTube comments.** Sermon audio, transcript, video analysis, source-level QA, and Sermon Segment QA cannot add/change signals, categories, urgency, evidence quality, or HIVE. The sermon topic may differ from the needs in comments.
2. **AI Audio QA is exclusively segment accuracy verification** against original YouTube source audio. Each segment uses its own Start_Ms__c and End_Ms__c, not a fixed 0–20-second clip.
3. **Human intervention only for unrecoverable SYSTEM_ERROR**, after bounded automated recovery. Model PASS and FAIL are automatic decisions, not human approvals. FAIL is not evidence of a technical system error.

## Deployed metadata
- `Sermon_Segment__c.Audio_QA_Status__c`: restricted picklist PENDING (default), PASS, FAIL, RETRY_PENDING, SYSTEM_ERROR.
- `Sermon_Segment__c.Audio_QA_Notes__c`: LongTextArea(8192), visibleLines 8.
- `Sermon_Segment__c.Audio_QA_Checked_At__c`: DateTime.
- `Sermon_Segment__c.Audio_QA_Attempts__c`: Number(3,0), default 0.
- `WDE_Groq_API_Access`: read/edit these four fields.
- `WDE_Verify_Sermon_Segment_Audio`: reads exactly one closed segment + source, computes floor(start_ms/1000) and ceil(end_ms/1000) as Gemini original-video offsets, validates transcript is nonempty and ≤25000 chars, parses bounded response and finishReason STOP. Persist one segment-only status/notes/time/attempt per pass. PASS/FAIL is a completed AI decision. Technical issues retry until attempt 3; thereafter SYSTEM_ERROR with fault notes. Never updates HIVE or Audience records.
- `Tgr_WDE_Auto_Segment_Audio_QA`: active after-save async callout for closed segments on PENDING/RETRY_PENDING and attempts <3, when status or attempt field changes; no other child/object writes. Existing PASS/FAIL do not retrigger.
- `Tgr_WDE_Reset_Segment_Audio_QA`: active before-save invalidation of status to PENDING and attempts to 0 when transcript/source/boundary changes. Legacy checked-at and notes are retained as audit but must NOT be treated as fresh after reset.
- `Tgr_WDE_Run_Stage_B`: successfully validated seven-field enrichment advances automatically to `CommitApproved` (internal workflow state, not human approval); `WDE_Persist_Reviewed_Segments` retains strict syntax, transcript coverage, idempotent insert/update, and faults but removes mandatory human-review requirement.
- `Tgr_WDE_Auto_Finalize_Summary`: only closed segments with AI QA PASS are eligible for downstream summary finalization.
- WDE Segment QA is independent of source-level Gemini 0–20 second QA (`WDE_Verify_YouTube_Gemini_Audio`); legacy source-level Flow is NOT called by this pipeline and its output is NOT copied to Segment/HIVE.

## Salesforce validation / deployment evidence (verified WDE Org Id 00Dfj00000eVCOVEA4)
- Core QA manifest `manifest/wde-segment-audio-qa-51.xml`: check-only SUCCESS `0Affj00000ZMGoLCAX`; deploy SUCCESS `0Affj00000ZMH1FCAX` — 6 components, zero errors. [Deployment response](https://github.com/jimmytobing/Syntetic-Wisdom/issues/51#issuecomment-6888027332).
- Automation manifest `manifest/wde-segment-audio-automation-51.xml`: check-only SUCCESS `0Affj00000ZMNOPCA5`; deploy SUCCESS `0Affj00000ZMNbJCAX` — 6 components, zero errors. [Deployment response](https://github.com/jimmytobing/Syntetic-Wisdom/issues/51#issuecomment-6888244211).
- Tooling [SOQL verification](https://github.com/jimmytobing/Syntetic-Wisdom/issues/51#issuecomment-6888268708) confirms active/latest are identical for eight targeted Flows, including QA flow `301fj00002FFPu6AAH`, auto trigger `301fj00002FGgksAAD`, reset trigger `301fj00002FGgkrAAD`, Stage B `301fj00002FGgkoAAD`, persist `301fj00002FGgkqAAD`, summary finalizer `301fj00002FGgknAAD`; original ingest `301fj00002EA0SHAA1` and HIVE `301fj00002EBEjJAAX` unchanged.
- Direct runtime POST on actual `Sermon_Segment__c/a0Efj00000EVrfuEAD` returned Salesforce HTTP 200, Groq/Gemini 200, `varB_Success=true`, `varT_QA_Status=FAIL`, finishReason STOP. [Runtime](https://github.com/jimmytobing/Syntetic-Wisdom/issues/51#issuecomment-6888073678) and [persisted SOQL](https://github.com/jimmytobing/Syntetic-Wisdom/issues/51#issuecomment-6888082256): `FAIL`, attempts 1, QA timestamp, bounded notes with audio discrepancies.
- Controlled automatic trigger test: one explicit PATCH on the same previously FAILED segment reset status to PENDING and attempts 0; Salesforce HTTP 204. [Mutation audit](https://github.com/jimmytobing/Syntetic-Wisdom/issues/51#issuecomment-6888277969). Independent subsequent [SOQL](https://github.com/jimmytobing/Syntetic-Wisdom/issues/51#issuecomment-6888286954) returned FAIL, attempts 1 and a fresh timestamp `2026-11-15T03:01:19Z`, with Processing_Status unchanged (NeedsReview). This confirms async retry/trigger executes once and terminal FAIL does not loop for this case.
- Salesforce Tooling `FlowDefinition/describe` [response](https://github.com/jimmytobing/Syntetic-Wisdom/issues/51#issuecomment-6888296053) says ActiveVersionId is **not updateable** via Tooling REST. No unsupported REST PATCH attempted on legacy source-level QA Flow.

## Runtime and coverage limitations
- Verified actual FAIL path and automatic trigger on one segment; no independent PASS case, quota/timeout recovery, exhaustion-to-SYSTEM_ERROR or changed-transcript stale-invalidation runtime test yet. Metadata validation alone does not prove all edge cases.
- The current model comparison is AI-reported (Gemini) and bounded syntax, **not** independent human transcription ground truth. False PASS/FAIL remains possible; no human approval is required by policy.
- Existing source-level 0–20 second Gemini QA Flow is still Active for legacy use and remains a deprecation/cleanup item. It is not linked into new segment automation or HIVE. Explicit deactivation requires a supported Salesforce metadata/API route and gate verification; setting ActiveVersionId via Tooling PATCH is not supported.
- No retrospective backfill of all pre-existing segments was attempted: those records may remain PENDING/NeedsReview until edited, deliberately requeued, or a safe batch sweep is implemented. Avoid calling Gemini across a whole sermon without quota and idempotency checks.
- Automatic content mismatch remediation is not a verified feature: FAIL stays FAIL rather than silently rewriting transcript. A future correction and second QA attempt would need source-citation-preserving, bounded correction/revalidation.
- Do not claim complete end-to-end QA for all segments or a changed HIVE score solely based on Flow deploy. Comment-only HIVE invariance is supported by source dependency and unchanged active version; full database before/after count snapshots were not captured.

## Operational scope
No Apex, LWC, middleware or new paid service. Uses existing WDEGeminiVideo External Service/credential; each segment call consumes Gemini model quota and async flow execution. The automation is intentionally scoped to new/changed eligible segments, not unconditional bulk historical replay.

## Legacy cleanup completed — 15 Nov 2026
- Salesforce official Tooling API permits PATCH of `FlowDefinition.Metadata.activeVersionNumber`, although `ActiveVersionId` itself is read-only. Both legacy Source QA and isolated A/B test Flow were deactivated with `{"Metadata":{"activeVersionNumber":0}}` using the strictly org-bound Sf Request gateway, after first reading the actual active version numbers (2 and 1, respectively).
- Legacy source-only audio QA `WDE_Verify_YouTube_Gemini_Audio`: [HTTP 204](https://github.com/jimmytobing/Syntetic-Wisdom/issues/51#issuecomment-6888327993), independent [Tooling readback](https://github.com/jimmytobing/Syntetic-Wisdom/issues/51#issuecomment-6888358328) confirmed `ActiveVersionId=null`.
- Test `WDE_Test_Audience_Context_AB`: [HTTP 204](https://github.com/jimmytobing/Syntetic-Wisdom/issues/51#issuecomment-6888346678), same independent readback confirmed `ActiveVersionId=null`.
- Source Flow XML for both changed to `<status>Draft</status>` in Draft PR #52 to avoid reactivation during subsequent deployments; the two metadata definitions remain available for historical audit only.
- New `WDE_Verify_Sermon_Segment_Audio` remains Active `301fj00002FFPu6AAH`, and unchanged comment ingestion/HIVE active versions remain `301fj00002EA0SHAA1` / `301fj00002EBEjJAAX`.
- Earlier note saying deactivation is unavailable was superseded by this verified supported Tooling Metadata update. The inactive older editorial helper `WDE_Get_Editorial_Audio_Context` also remains Draft; it is not connected to either pipeline.
