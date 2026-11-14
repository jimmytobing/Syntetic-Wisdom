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

## Verifications
- Initial video analysis using the earlier Flow returned HTTP 200, STOP, and JSON that was independently parsed outside Flow: [Issue evidence](https://github.com/jimmytobing/Syntetic-Wisdom/issues/51#issuecomment-6873692220).
- Current Flow-only version: deploy `0Affj00000ZGsGPCA1` successful; active version `301fj00002F2uCXAAZ` verified. One runtime returned Gemini 503 and no JSON; `Sermon_Source__c` remained unchanged: [runtime](https://github.com/jimmytobing/Syntetic-Wisdom/issues/51#issuecomment-6874357514), [record check](https://github.com/jimmytobing/Syntetic-Wisdom/issues/51#issuecomment-6874366066).

The full acceptance path for **successful automatic persistence** remains unverified until one Gemini HTTP 200 response passes the Flow gate and a subsequent record query confirms fields were saved. Do not claim storage success without that evidence.
