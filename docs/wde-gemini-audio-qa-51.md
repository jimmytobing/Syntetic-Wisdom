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
