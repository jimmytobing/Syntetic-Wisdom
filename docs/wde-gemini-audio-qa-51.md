# WDE Gemini Audio QA — second-pass Flow (Issue #51)

## Design
- Target org ID: 00Dfj00000eVCOVEA4 (Developer Edition).
- Standalone autolaunched Flow: WDE_Verify_YouTube_Gemini_Audio. Uses existing WDEGeminiVideo.analyzeVideo and GeminiNmCred. No custom Apex, scheduler, or middleware.
- Input: canonical YouTube watch URL. Resolve existing Sermon_Source__c by unique External_Video_Id__c, require stored Gemini_Video_Analysis_JSON__c and reuse completed QA cache.
- Send original YouTube video to Gemini using file_data.file_uri and video_metadata clip start_offset=0s, end_offset=20s. The stored analysis appears only in the prompt as untrusted material to compare, never as primary audio evidence.
- Prompt requests independent audio listening, timestamp comparison, explicit audio/visual separation, and text verdict starting AI_VERIFIED| or NEEDS_REVIEW|, followed by AUDIO and TIMESTAMPS justification.
- Flow verifies HTTP 200, candidates, STOP, bounded output and AI_VERIFIED marker with AUDIO/TIMESTAMPS sections. Any ambiguous completed output becomes NEEDS_REVIEW. Failed callout does not write an AI_VERIFIED result.
- Persist only Gemini_Audio_QA_Status__c (restricted picklist: NEEDS_REVIEW default, AI_VERIFIED), Gemini_Audio_QA_Notes__c (Long Text Area 8192), and Gemini_Audio_QA_Checked_At__c (DateTime). Existing WDE_Groq_API_Access permission set grants Edit FLS for those fields to its already-assigned users.

## Trust boundary
- AI_VERIFIED means the second Gemini pass itself reports audio consistency. It is not independent-provider certification and never HUMAN_APPROVED.
- Visual title claims cannot be proved using only audio. VISUAL must remain NOT_CHECKED_BY_AUDIO.
- The same provider may repeat a false assumption. Token-based output validation is not a strict schema parser or a proof of original audio correctness.
- For a completed model response, unmatched or ambiguous verdict text is stored as NEEDS_REVIEW. For transport faults or incomplete responses, the Flow reports failure without writing AI_VERIFIED; existing records can remain with null QA status, which must also be treated as NOT VERIFIED.
- Do not automatically promote output into reviewed Sermon_Segment, Audience Intelligence, or content publication. A future pipeline connection needs its own explicit approval.

## Deployment and verification
- CheckOnly: manifest/wde-gemini-audio-qa-51.xml for 3 CustomFields, existing WDE_Groq_API_Access, and new QA Flow.
- On 15 Nov 2026 the user authorized activation of the QA Flow. CheckOnly deployment 0Affj00000ZLuZJCA1 succeeded, activation deployment 0Affj00000ZLuz7CAD succeeded, and Tooling verified ActiveVersionId=LatestVersionId=301fj00002FF6jOAAT.
- A single controlled runtime for video _tYB8TLFizQ returned Gemini HTTP 200, finishReason STOP, varB_Success=true, varT_QA_Status=AI_VERIFIED, varT_Error=null. Gemini indicated audible greeting, storm analogy, shelter/peace claims and time ranges matched, while explicitly stating VISUAL: NOT_CHECKED_BY_AUDIO. [Runtime evidence](https://github.com/jimmytobing/Syntetic-Wisdom/issues/51#issuecomment-6887012794).
- Independent Salesforce SOQL confirmed Gemini_Audio_QA_Status__c=AI_VERIFIED, QA notes identical to returned model text, and Gemini_Audio_QA_Checked_At__c=2026-11-15T01:02:22.000+0000 (08:02:22 WIB). Original analysis timestamp, Rights_Status=Unknown, Ingest_Status=Pending unchanged. [Persistence evidence](https://github.com/jimmytobing/Syntetic-Wisdom/issues/51#issuecomment-6887021699).
- Reinvoke for cache/idempotency validation only if separately required; not part of this one-call acceptance.
- Preserve original Gemini analysis JSON, rights status, ingest status, credentials and existing reviewed segments.

Source QA reference: docs/wde-gemini-flow-only-51.md; Issue: https://github.com/jimmytobing/Syntetic-Wisdom/issues/51.

## Cache hardening and Audience Intelligence handoff — 15 Nov 2026
- Draft PR Flow guard now requires a non-null QA checked-at timestamp, a non-null analysis validated-at timestamp, QA checked-at >= analysis validated-at, a non-null status and non-null notes before `Return_Cached_QA`. Otherwise the Flow proceeds to a fresh second-pass video QA. This is a source-only change until separately validated/deployed; the active org version is not changed by a GitHub commit.
- This timestamp guard handles normal re-analysis, but if raw JSON is overwritten without updating validated-at, it cannot detect staleness. The producer must atomically refresh the analysis timestamp alongside analysis JSON; a future source hash can enforce strict content identity if the producer cannot guarantee that invariant.
- Acceptance test for existing video `_tYB8TLFizQ`: invoke the currently active QA Flow once with canonical URL and inspect `varB_Cached=true`, `varT_QA_Status=AI_VERIFIED`, `varB_Success=true`; `varN_ResponseCode` should be unset on cache path and the checked-at timestamp should not change. Independent SOQL readback is required. A completed invocation by itself does not prove no callout unless response and branch observations agree.
- If status is `NEEDS_REVIEW`, cache represents a completed QA decision, **not** approval. Only `AI_VERIFIED` is eligible to contribute verified audio context; null and incomplete values fail closed. QA status never substitutes for rights review or human script approval.

## Audience Intelligence integration design (not deployed)
- Keep audience comments as the authoritative source of audience needs; do not generate a need, a signal count or urgency from the sermon analysis alone.
- Existing `WDE_Fetch_YouTube_Comments` already resolves `Sermon_Source__c` by the video ID and connects signals to their source. Add a guarded context template only when source audio QA status is `AI_VERIFIED`, notes and analysis JSON exist, and QA checked-at >= analysis validated-at. Otherwise keep the current comment-only prompt exactly as before.
- Template context must be explicitly labeled **untrusted source-background**, capped to a bounded size, and instruct the model not to treat it as audience evidence or override actual comment text. Video context may disambiguate terminology and quoted sermon references but never assert a user's feeling, request or urgency without direct evidence in a comment.
- Retain stable `Signal_Key__c` upsert, existing audience need mapping by `Need_Key__c`, and the HIVE rubric (volume 30%, intensity 25%, growth 20%, recency 15%, quality 10%). Do not write HIVE metrics or content plans from video analysis.
- Initial evaluation: same 10–20 comments with and without context, measure category consistency, false positive needs, and evidence-code accuracy; confirm identical unique signal keys and no duplicate writes. A mismatch sends the output to review rather than automatically influencing ranking.
- No new object, Apex, scheduler, automatic promotion to reviewed segments, or auto-publication. Actual implementation and runtime E2E require separate Flow metadata review and scoped org validation.

## Implementation evidence — 15 Nov 2026
- **Audio QA cache replay VERIFIED** on original active version: single POST Flow action returned HTTP 200, `varB_Cached=true`, `varB_Success=true`, `varT_QA_Status=AI_VERIFIED`, `varN_ResponseCode=null`, no Gemini response. [Evidence](https://github.com/jimmytobing/Syntetic-Wisdom/issues/51#issuecomment-6887112101). Follow-up Salesforce read showed `Gemini_Audio_QA_Checked_At__c` unchanged at `2026-11-15T01:02:22Z`; [evidence](https://github.com/jimmytobing/Syntetic-Wisdom/issues/51#issuecomment-6887118086).
- **Audio QA cache guard check-only SUCCESS** `0Affj00000ZLxlhCAD` (1 component, 0 errors), then **deployed SUCCESS** `0Affj00000ZLZeZCAX` to verified WDE org `00Dfj00000eVCOVEA4`; latest and active version now `301fj00002FG0tdAAD`. [Validation](https://github.com/jimmytobing/Syntetic-Wisdom/issues/51#issuecomment-6887130190), [deployment](https://github.com/jimmytobing/Syntetic-Wisdom/issues/51#issuecomment-6887143880), [Tooling version](https://github.com/jimmytobing/Syntetic-Wisdom/issues/51#issuecomment-6887151511).
- **Audience Intelligence candidate:** `WDE_Fetch_YouTube_Comments.flow-meta.xml` source modified to gate on verified and fresh audio QA, attach only the first-20-seconds bounded QA notes as an untrusted contextual hint, and preserve comment evidence as the source of category/urgency/quality. No new field, HIVE formula, scheduler or DML logic. Isolated check-only manifest `manifest/wde-audience-audio-context-51.xml` validation **SUCCESS** `0Affj00000ZLy8HCAT` (1 component, 0 errors). [Validation](https://github.com/jimmytobing/Syntetic-Wisdom/issues/51#issuecomment-6887164877).
- **Audience candidate NOT deployed or activated**: it is an already-live DML-producing comment ingestion Flow. Need controlled A/B evidence (same input comments, verified context on/off) for classifications, signal count, deduplication and HIVE invariance before changing active behavior. A successful metadata validation is not runtime or semantic verification.

## Audience Intelligence A/B outcome — 15 Nov 2026
The guarded audio-context classifier candidate passed metadata check-only but **failed semantic A/B acceptance**: isolated no-DML Groq Flow classified 12 synthetic comments in both arms and changed 3 results when audio QA context was present, including an unsupported quality increase on `ab09`. Raw comparison and decision are in [docs/wde-audience-context-ab-51.md](wde-audience-context-ab-51.md), with Salesforce responses on Issue #51.
Therefore the temporary changes to the production `WDE_Fetch_YouTube_Comments` source were **reverted to the exact main baseline**, and its context manifest removed from PR #52. That production Flow was never deployed as part of this experiment. Future `AI_VERIFIED` usage should be post-HIVE editorial context, not input to Audience Need classification or scoring. The isolated `WDE_Test_Audience_Context_AB` test Flow was deployed and active for the controlled comparison; keep its existence visible in the audit until deliberate cleanup is approved.

## Architecture correction — 15 Nov 2026 (authoritative scope)

The user has clarified the trust boundary:

1. **Audience Needs are 100% derived from YouTube viewer COMMENTS.** Video/sermon speech, first-pass Gemini analysis, captions, audio QA and Sermon Segment content must not create, rank, classify, enrich or upweight Audience Needs or Audience Signals. They must never change HIVE component scores or final HIVE score, whether before or after ranking.
2. **HIVE scoring is exclusively based on evidence from comments** (volume 30%, intensity 25%, growth 20%, recency 15%, quality 10%). The sermon content can disagree with needs in comments; that is expected and must not be treated as inconsistency.
3. **AI Audio QA belongs only to Sermon Segment validation, as support for an explicit HUMAN review decision.** AI output may identify unclear or potentially mismatched audio, time boundaries and transcript, and propose `NEEDS_REVIEW`; it must not autonomously mark a segment human-approved, alter an audience need, or approve copyright/reuse rights.
4. **Current implementation caveat:** `WDE_Verify_YouTube_Gemini_Audio` currently verifies the **first 20 seconds of `Sermon_Source__c`**, writes QA to source-level fields and returns `AI_VERIFIED`; it does **not** yet prove a particular `Sermon_Segment__c` boundary or human approval. Do not label the existing source-level QA as completed segment validation or automatically promote segment status.
5. The previously drafted post-HIVE editorial-context Flow and its manifest/document were **removed from Draft PR #52**. It was deployed earlier to Salesforce as **Draft/Inactive**, latest Flow version `301fj00002FGJ6fAAH`, ActiveVersionId null at last verified read. Source removal does not delete metadata in the org; no Salesforce deactivation/deletion performed. Do not activate or wire the orphan Draft Flow to Content Planning.
6. Segment-level design must be preceded by inspection of actual `Sermon_Segment__c` fields/relationships, its transcript/timestamp boundaries, review flags, human reviewer identity and existing review Flows. Prefer existing fields/statuses; separate machine-suggested result from human decision. No new objects or fields until actual schema verifies a gap.

**Invariant:** Audience Signals → Audience Needs → HIVE → Content Planning stays **comment-only**. Sermon Source → Segment → AI Audio QA → human segment validation is **a separate quality-control track**. Their outputs do not cross into audience scoring.

## Final clarification — 15 Nov 2026: autonomous AI segment QA (supersedes human-approval requirement)

This section **overrides** earlier statements saying that every Sermon Segment must receive human approval.

- Audience Needs, Audience Signals and all HIVE component scores **remain 100% comment-only**. Sermon video/audio/analysis is never scoring input or a basis to invent audience demand.
- AI Audio QA **automatically determines** whether the relevant Sermon Segment passes the QA rules. A human reviewer is **not** part of the normal success path and does not need to approve otherwise valid segments.
- Human intervention is reserved for **technical/system errors** requiring investigation, such as callout/auth failures, timeout, malformed response, unavailable source media, transcription/format parsing failure, inconsistent indexing/boundary data, unresolved execution fault or infrastructure blockage. Operational exceptions must fail closed; they are **not** silently converted into success.
- A semantic QA failure or content mismatch is handled by the automated pipeline: record a machine verdict / reason, mark as not passed, and where appropriate attempt a bounded, idempotent AI correction and revalidation. Do not automatically treat content mismatch as a human-approval request. The pipeline must not falsely mark an unresolved mismatch as passed.
- The machine QA verdict is limited to **segment accuracy and evidence consistency**. `AI_VERIFIED` does not clear copyright/reuse rights, verify visuals or alter audience scoring.
- **Current implementation gap (verified from repository, not deployed fix):** `WDE_Verify_YouTube_Gemini_Audio` currently checks only the first 20 seconds of `Sermon_Source__c`, not an individual `Sermon_Segment__c`. `WDE_Persist_Reviewed_Segments` currently retains `Gate_Human_Review`, `varHumanReviewed`, and `APPROVAL_REQUIRED` behavior. `WDE_Semantic_Review_Batch` returns unsaved candidate segments and explicitly does not prove semantic accuracy. A dedicated segment-scoped machine QA gate with deterministic checks is needed to replace this legacy human approval, while preserving caption coverage, 7-field format, source-boundary validation, idempotency, and fault handling.
- **Safety:** no automatic success solely because Groq/Gemini returns HTTP 200; demand a complete, bounded, parseable, internally consistent verdict. Do not deploy/activate replacement behavior before independently validating metadata, runtime, retry paths and existing Flow dependencies.

**Target pipeline:** Sermon Source → candidate Sermon Segment → AI Audio QA + deterministic evidence checks → automatic PASS / FAIL; only **SYSTEM_ERROR** invokes human investigation. These results never flow into Audience Needs/HIVE.
