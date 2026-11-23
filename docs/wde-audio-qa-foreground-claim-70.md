# WDE PR #70 — Transaction-safe foreground Audio QA design (review-only)

**Status:** Proposed architecture; no Salesforce metadata deployment, provider request, data mutation or Flow activation is authorized by this document. The current legacy async START Flow has already been explicitly deactivated in `hdbsf` ([deploy](https://github.com/jimmytobing/Syntetic-Wisdom/issues/69#issuecomment-7095937376), [readback: ActiveVersionId = null](https://github.com/jimmytobing/Syntetic-Wisdom/issues/69#issuecomment-7095947849)). Continue to reuse [WDE Chat Gateway #15](https://github.com/bfipbf/WDE/issues/15) for all Salesforce changes.

## Evidence and decision

- Legacy `WDEGeminiAsync.startAsyncQa` background `gemini-3.8-flash` returned `DEADLINE_EXCEEDED` in independent text-only diagnostics. **Do not reactivate it or retry unknown submissions.**
- An isolated foreground `gemini-3.6-flash:generateContent` completed one `TEST_OK` and one bounded 30-second YouTube media request. The user listened to the original 38:08–38:38 clip and confirmed both reported passages matched. **No additional quality-test cycle is requested**, and this evidence does not establish long-video latency, actual token usage, or production readiness.
- `main` already includes `WDEGeminiVideo.analyzeVideo` bound to `GeminiNmCred` and `WDE_Verify_Sermon_Segment_Audio`. Prefer reusing the existing foreground schema and Named Credential rather than creating another external credential. **The existing production verification Flow may write segment status/transcript**, so it is **not** itself a safe read-only pilot or an atomic claim implementation.
- `Audio_QA_Batch_Fingerprint__c` is currently a non-unique 64-character Text field. Checking it or `Audio_QA_Batch_State__c` with a Flow Get Records action **is not a concurrency lock**.

## Required transactional design before production code activation

Separate the claim and the remote call into distinct durable transactions. Salesforce callouts after pending uncommitted DML are unsafe and a Flow read-then-submit check is not atomic.

1. **PREPARE / CLAIM, in one committed Salesforce transaction (no callout):** Validate segment existence, `Audio_QA_Required__c`, closed stitching, consented `Sermon_Source__c.Rights_Status__c=PermissionGranted`, valid YouTube ID, positive bounded offsets, and a nonempty transcript; reject prior PASS/FAIL verdicts. Build a canonical SHA-256 fingerprint over a versioned encoding of segment ID, source video ID, exact start/end offsets, transcript revision/hash, policy version and target model. Acquire an atomic claim using a unique external-ID key on a dedicated one-per-segment/revision claim record **or** an Apex `SELECT ... FOR UPDATE` transaction with durable state transition and a proved unique-enforcement equivalent. **Never trust an unfenced Flow Get Records as a claim.** Set owner/request key, fingerprint, status `RESERVED`, attempt ordinal and a durable lease/fence value. Explicit concurrency results: one `CLAIMED`, others `ALREADY_CLAIMED` or `CONFLICT`; no callout in this transaction. A lost connection during claim requires readback by request key, never blind claim replay.
2. **DISPATCH, in a subsequent transaction:** Re-read the same claim and source with fence/fingerprint equality and status `RESERVED`; atomically move to `CALLING` and commit before any network request. Invoke only the bounded foreground `WDEGeminiVideo.analyzeVideo` with fixed `video_metadata` and minimal response output; **do not loop or automatically retry**. A single worker must hold the fence. A Salesforce timeout after the request leaves outcome `UNKNOWN`, even if the provider may have completed. Do not duplicate the call to 'find out.' Protect cumulative Salesforce callout limits and use small clips; longer media requires a distinct reviewed strategy. Model tier, account quota and rights must remain checked before dispatch.
3. **RECEIPT / RECONCILIATION, in a separate transaction:** If a provider response is positively confirmed, persist bounded response metadata and safe evidence against the exact fenced claim, and transition to `RECEIVED`. Reject stale fence, changed source, malformed response, missing text, `MEDIA_UNAVAILABLE`, non-200, truncation and unsupported model output as `SYSTEM_ERROR`/manual-review candidates. Never infer success from HTTP 200 alone; parse the candidate and completion evidence. If the callout is ambiguous or times out, persist `UNKNOWN_DO_NOT_RETRY` after checking current claim state; never automatically re-dispatch. Manual reconciliation may mark abandoned/reviewed **without** repeating a provider POST.
4. **QUALITY / VERDICT, distinct separately authorized path:** The already-confirmed human 30-second pilot counts only as pilot acceptance. Promotion of an existing `Sermon_Segment__c.Audio_QA_Status__c` or modification of `Transcript_Text__c` requires an independently reviewed, exact-fingerprint comparison and explicit production authorization. Preserve all previous FAILs and SYSTEM_ERRORs and audit original text. No Audience/HIVE updates. No mass DML.
5. **CLEANUP:** For legacy stored Interactions, DELETE only a previously known exact receipt ID after evidence retention and confirmation; GET 404 following one DELETE is expected. Foreground `generateContent` should not create a stored Interactions resource. Keep the old GET/DELETE Flow operations manual and never pass untrusted provider IDs from model text.

## Claim state machine and failure invariants

| Existing claim | Requested action | Allowed result | Provider POST |
| --- | --- | --- | --- |
| Absent and source eligible | PREPARE | Single fenced `RESERVED` claim | No |
| `RESERVED` same fingerprint | PREPARE again | `ALREADY_CLAIMED` / return same claim | No |
| `CALLING` | PREPARE or DISPATCH again | `IN_PROGRESS` / conflict | No |
| `RECEIVED` | PREPARE or DISPATCH again | Existing receipt, no duplicate | No |
| `UNKNOWN_DO_NOT_RETRY` | Any automatic request | Refuse, require manual reconciliation | No |
| Any state, changed fingerprint | Prepare or apply result | Reject `STALE_SOURCE` | No |
| Segment PASS/FAIL or missing permission | PREPARE | Reject; never mutate status | No |
| Provider failed, truncated or malformed | RECEIPT | Quarantine evidence, no QA verdict promotion | No |

**Fencing and uniqueness requirement:** A unique claim key must be enforced at the database layer and must include segment/revision/policy. A second operator cannot win using a stale pre-callout read; the transactional update must be conditional on the current owner/fence. The exact claim record/object choice, FLS/CRUD access, Salesforce execution identity, retention and cleanup, and metadata footprint need an explicit security review before committing production Apex, Flow or Custom Object changes. Do not assert Apex `FOR UPDATE` alone solves a distributed callout ambiguity.

**Provider idempotency:** Unless the actual selected Gemini endpoint documents and reliably honors an idempotency key, treat every provider POST as non-idempotent even if Salesforce claims are unique. `UNKNOWN_DO_NOT_RETRY` is a deliberate fail-closed terminal operational state; an operator must be able to reconcile without creating another request.

## Implementation and acceptance gates

- [x] Legacy unsafe background START Flow deactivated and independently read back in `hdbsf`.
- [x] Isolated 20-file source base from `main` and initial check-only metadata validations; PR #70 remains Draft.
- [x] Foreground text and 30-second media connectivity; two quotes confirmed by the user (do not repeat quality test).
- [ ] Review and implement unique durable atomic claim, transaction boundaries, fencing, and a manual unknown-result reconciliation path in source only.
- [ ] Review existing `WDEGeminiVideo` foreground response schema, max output and Salesforce timeouts; make the new worker **Draft/inactive** until authorized.
- [ ] Add concurrency, duplicate, stale-fingerprint, provider-timeout and no-verdict-write tests. CI success is necessary, but not proof of Salesforce runtime safety.
- [ ] Validate immutable SHA + targeted manifest with **Sf Deploy mode=validate**; get separate user permission before mutative deployment, Flow activation or any new media request.
- [ ] Independent security/code review and clean PR diff; only then reconsider merging to `main`. PR #62 stays Draft as historical investigation; neither PR is auto-closed.

This document is an implementation contract, not a new authorization and not a claim of full Audio QA verification.
