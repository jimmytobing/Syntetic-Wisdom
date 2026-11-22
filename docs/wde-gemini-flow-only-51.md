# WDE Gemini YouTube analysis — Flow-only design (Issue #51)

## Current deployment contract
- Target: WDE Developer Edition `00Dfj00000eVCOVEA4`.
- Active Flow: `WDE_Analyze_YouTube_Gemini`. External Service: `WDEGeminiVideo.analyzeVideo`, existing `GeminiNmCred`.
- Public YouTube watch URL with canonical 11-character video ID. Flow validates URL, gets existing `Sermon_Source__c` by unique `External_Video_Id__c` before a Gemini callout, and returns existing JSON without another callout if present.
- The Gemini request uses `generationConfig.responseMimeType=application/json` with a constrained one-sentence summary and at most three clip segments for the first 20 seconds.
- The transport gate requires HTTP 200, a candidate, `finishReason=STOP`, bounded text with braces, and a text indication of `video_accessible:true`. When it passes, the Flow updates only `Sermon_Source__c.Gemini_Video_Analysis_JSON__c` and `Gemini_Analysis_Validated_At__c`; preserves `Rights_Status__c`, `Ingest_Status__c`, and the reviewed `Sermon_Segment__c` dataset.

## Important quality limits
- Salesforce External Service exposes `candidates[].content.parts[].text` as **String**. Adding a schema to the OpenAPI registration does **not** make the Gemini-generated JSON body a typed Flow record. The attempted nested `generationConfig.responseSchema.type` assignment failed Salesforce Flow metadata validation; it is **not active**.
- The active Flow's text checks **are not strict JSON.parse**, do not verify every segment's timestamp, and do not compare quoted evidence against the video. `Gemini_Analysis_Validated_At__c` is a response gate timestamp, **not an independent semantic QA certification**.
- Do not feed this output into reviewed sermon segments, Audience Intelligence, or the editorial knowledge base without a separate independently verifiable review/parse contract.
- `Flow__InterviewStatus=Finished` and Salesforce action `isSuccess=true` can coexist with Gemini HTTP 503. Always use `varB_Success`, `varN_ResponseCode`, and `varT_Error`.
- 503: do not retry automatically; allow manual replay after confirming the previous callout had no saved result, and respect Gemini quotas.
- No Apex validators, Apex permissions, scheduler, new credentials, middleware, or GitHub Actions business runtime.

## Acceptance evidence (15 Nov 2026)
- **Deployed FLS fix:** existing `WDE_Groq_API_Access` permission set grants Read and Edit only on the two new Gemini analysis fields; both WDE owner and integration user were already assigned. Metadata deploy `0Affj00000ZJTDRCA5` succeeded and live `FieldPermissions` readback confirmed. [FLS proof](https://github.com/jimmytobing/Syntetic-Wisdom/issues/51#issuecomment-6879763997)
- **Successful first persistence:** Flow returned Gemini HTTP 200, STOP and `varB_Success=true`. Independent SOQL verified `Gemini_Video_Analysis_JSON__c` and `Gemini_Analysis_Validated_At__c` populated on existing Source `a07fj00001J9PShAAN`, with Rights_Status Unknown and Ingest_Status Pending unchanged. [Stored record proof](https://github.com/jimmytobing/Syntetic-Wisdom/issues/51#issuecomment-6879797381)
- **Cached replay acceptance:** subsequent Flow invocation for the same YouTube video returned `varB_Cached=true`, `varB_Success=true`, `varN_ResponseCode=null`, `varA_Response=null`, and the cached 666-character JSON. The Gemini External Service branch was not executed. [Cache evidence](https://github.com/jimmytobing/Syntetic-Wisdom/issues/51#issuecomment-6886615853)
- **Remaining evidence boundary:** JSON syntax and required field types were externally checked for one successful stored sample, but Flow only implements basic text/transport gates; the quote and timestamps have **not** been independently compared against the original audio or indexed transcript. Neither `video_accessible` nor the timestamp field means human editorial approval.
- **No new automation:** Do not move Gemini output to reviewed Sermon Segments or Audience Intelligence automatically, and do not attach a scheduler. Gate semantic/editorial use on source-grounded caption evidence and reviewer signoff, as described in `docs/wde-knowledge-quality-gate-35.md`.

## Indexed-caption cross-check (15 Nov 2026; read-only)
A read-only `Sf Bash` check independently queried `Sermon_Source__c.Raw_Transcript_Text__c` for the same video and extracted only caption rows with `start_ms < 20000`. The field is populated (73,950 characters); `Transcript_Storage_Key__c` remains null and `Rights_Status__c=Unknown`. This caption source is **separate from the stored Gemini JSON**. It is not proof of original audio/visual authenticity, and no video was downloaded or replayed. [Caption evidence](https://github.com/jimmytobing/Syntetic-Wisdom/issues/51#issuecomment-6886723373).

| Gemini interval/claim | Caption corroboration | Evidence status |
| --- | --- | --- |
| 00:00–00:02: on-screen `Saat Teduh Bersama` title | Stored caption starts at 2,360 ms; visual frame was not independently inspected | **UNVERIFIABLE** (visual) |
| 00:02–00:10: speaker greeting and storm analogy | Caption index 0–3 at 2,360–8,559 ms begins with `Shalom keluarga`, refers to a storm and an analogy; caption timing overlaps the next interval | **PARTIAL** (content consistent, boundary not exact) |
| 00:10–00:20: invitation to shelter and seek peace | Caption indices 4–5 at 11,599–14,280 ms describe sheltering and a peaceful heart; index 6 starts at 18,119 ms with the next thought | **MATCH** (topic; not verified verbatim speech) |

**Do not label the video semantic QA as VERIFIED/PASS.** Current evidence corroborates two generated topics using a separately stored caption stream but cannot authenticate raw video frames, exact audio wording, speaker identity, rights, or all time boundaries. Maintain human/source-review pending. The supplied caption offsets refer to caption start times; display durations may overlap.

## Minimum editorial verification for this video
1. Retrieve an **independent** first-20-second original audio/video excerpt or indexed captions, not another copy of the Gemini JSON. If no source can be retrieved, mark `SOURCE_UNAVAILABLE` and keep pending.
2. Compare each timestamp and evidence assertion against the source. Classify each as `MATCH`, `PARTIAL`, `MISMATCH`, or `UNVERIFIABLE`. A paraphrase must **not** be represented as an exact quote.
3. Confirm speaker attribution and whether visual text versus spoken audio is correctly distinguished. Treat program title on screen separately from speech.
4. Record reviewer, review date, exact source evidence locator, and corrections in the existing editorial QA process. Do not mark full semantic PASS solely from HTTP 200, JSON parse, or `Flow__InterviewStatus=Finished`.
5. Keep `Rights_Status__c=Unknown` until rights verification is independent; AI analysis does not grant reuse rights.

**Status:** Flow callout and persistence verified; cached repeat verified; independent audio/visual semantic verification still pending. The script is **not** a Salesforce scheduler and does not perform new DML.
