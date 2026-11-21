# WDE — isolated Gemini Batch Audio QA recovery (#61 / PR #52 follow-up)

**Status: candidate source, NOT active until Salesforce validate, deployment, authentication and end-to-end readback.** This is a *stacked* change on top of feature/wde-gemini-interactions-51. No change to the already reviewed Flow-only PR #52 sources, Audience Needs or HIVE.

## Why
- Salesforce External Services synchronously times out at 120s; extending the outer gateway to 150s cannot fix this inner bound.
- Current WDEGeminiVideo URL points at gemini-3.6-flash. Real retries produced Gemini HTTP 503 and Salesforce read timeouts; 10 flagged records are terminal (2 PASS, 6 FAIL, 2 SYSTEM_ERROR).
- The provider supports asynchronous Batch API. For this candidate we use **Gemini 3.8 Flash** via existing Salesforce `GeminiNmCred`, without exporting the credential or introducing any GitHub Actions runtime.

## Security, consent, and no duplicate submission
- Only Salesforce org ID `00Dfj00000eVCOVEA4`; only one *closed*, `Audio_QA_Required=true`, terminal `SYSTEM_ERROR` segment (at least 3 synchronous attempts), whose Source has `PermissionGranted`, 11-character YouTube ID, valid offsets, and nonempty bounded transcript.
- `POST /services/apexrest/wde/audio-qa-batch/` body `{"operation":"submit","segmentId":"<record Id>"}` **claims** a segment in Salesforce before enqueuing one callout. A second submit returns `accepted:false`. This is not a guarantee of provider-side idempotency if the outbound POST succeeds but the response is lost; such requests enter `SUBMIT_UNKNOWN` and **must not be retried automatically**.
- Query/worker rechecks the SHA-256 of video ID + offsets + transcript. If material changed, batch result cannot overwrite a newer version. Never stores API keys in source or evidence.
- No schedule or mass processing. Only explicitly selected records are submitted; every poll is another explicit `{"operation":"poll","segmentId":"..."}` REST action. Queueable performs provider callout after the claim transaction commits. Uses Named Credential, not direct Salesforce API access.
- Source transcript goes only to approved Gemini API under the already approved YouTube rights; **video_metadata clipping on YouTube URLs is not guaranteed to limit audio token consumption**. Review billing and media retention before large-scale adoption.
- Batch results are accepted only with single `STOP` candidate and complete `PASS|AUDIO:...|TIMESTAMPS: mm:ss-mm:ss` or `FAIL|...` evidence. No auto-transcript replacement. Any model ambiguity, provider fault, or SYSTEM_ERROR remains non-PASS. Never modifies Audience/HIVE.
- `Audio_QA_Batch_State__c` progression: QUEUED -> SUBMITTED -> DONE_PASS/DONE_FAIL, or SUBMIT_UNKNOWN / SUBMIT_REJECTED / POLL_ERROR / PROVIDER_FAILED / FORMAT_ERROR / STALE. Use SOQL readback; **Actions job success alone is not model acceptance**.

## Deployment gate
1. Before source changes, confirm target org `00Dfj00000eVCOVEA4` (last proven by [readback](https://github.com/jimmytobing/Syntetic-Wisdom/issues/61#issuecomment-7061616238)).
2. Validate exact immutable branch commit with `manifest/wde-audio-qa-batch-61.xml` using Sf Deploy gateway `bfipbf/WDE#8`; run tests. Fix compile/test errors in source if present. Record deployment ID.
3. Only after validation succeeds, deploy the same exact commit and manifest, then Tooling readback and REST check. Do **not** activate mass schedule.
4. Targeted preflight for `a0Efj00000EcTfFEAV` (1086:1262), `a0Efj00000Eb4z3EAB` (514:977); submit sequentially with provider capacity/billing bounded and observe persistent batch job name. Never retry unknown/timeout writes.
5. Poll each accepted job; independently compare returned model evidence to transcript and use Salesforce readback of status/notes/check timestamp. `DONE_FAIL` is a valid mismatch, not a reason to forge PASS.
6. Review by authorized independent reviewer, only then consider change integration and protected merge. PR #52 does not depend on pretending these two segments are PASS; terminal failure handling already has separately documented waiver.

## Verification status
- Source and Apex test class are present on isolated branch; these assert single request, URL/time offsets, hash stale detection, exact provider name and fail-closed verdict.
- **UNVERIFIED** until CheckOnly and live execution: Apex REST deployment, Named Credential callout compatibility, Batch API accepts YouTube fileUri, batch response semantics and duration, model evidence correctness, media clipping and cost, role/FLS enforcement. Explicitly do not mark them SUCCESS without evidence.

Official references:
- https://help.salesforce.com/s/articleView?id=platform.external_services_schema_def_usage_considerations.htm&type=5
- https://ai.google.dev/api/batch-mode?hl=id
- https://ai.google.dev/gemini-api/docs/batch-api
