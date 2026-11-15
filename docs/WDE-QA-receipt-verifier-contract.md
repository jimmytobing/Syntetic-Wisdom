# WDE QA release — mandatory verifier contract (Issue #54)

Status: **NOT DEPLOYED / release intentionally FAIL-CLOSED**. No Apex.

## Current vulnerability and immediate block

The Flow API previously accepted caller-provided PASS and digest strings. The Node HMAC preflight could be bypassed by direct invocation of the Salesforce Flow API. Commit 655e868 adds an unconditional FALSE to `f_RequestAuthorized`, keeping any path to `Create_Claim` unreachable until an in-Flow cryptographic verifier is available and tested. The Flow **must remain Draft**. Never remove the block based on just a signed string in Salesforce or another client-controlled input.

## Trusted External Service to implement

An actual **independent verifier endpoint** must exist outside the AI generation identity, with stable URL, TLS, service authentication configured using **Named Credential + External Credential**, no embedded headers/secrets in metadata. The endpoint implementation/provider is **not yet selected**. Do not invent URL, claim the service is configured, or register an empty/placeholder host in an active Flow.

Request `POST /v1/qa/releases/verify` (example operation; provider decides final path): `orgId`, `batchId`, `sourceId`, `expectedModifiedAt`, `enrichmentDigest`, `receiptJson`, `releaseKey`, `challenge`. All must be validated against the latest independently authoritative receipt. The verifier must not trust caller-supplied claims alone.

Response on success: `verified=true`, `orgId`, `batchId`, `sourceId`, `expectedModifiedAt`, `enrichmentDigest`, `releaseKey`, `reviewerId`, `qaVersion`, `verdict=PASS`, `receiptId`, `validUntil`, `challenge`. The service must validate receipt signature in constant time, issuer authority, signature key version, expiry, replay nonce, exact source/batch/snapshot/digest, rights clearance and all audio/transcript evidence; return **403/409** on failed validation and **5xx** on provider outage, never success-by-default. An independently signed authorization response or strongly authenticated channel is required.

## Flow ordering (Flow-first, no Apex)

1. OAuth QA principal can READ Batch/source/receipt but has **no direct object DML**, Custom Permission alone is not sufficient.
2. Read latest Batch and rights. Fetch receipt from read-only storage; call the **trusted External Service** **before DML** and with no pending writes.
3. Validate response code, `verified=true`, verdict PASS, non-expired `validUntil`, challenge, source, org, Batch Id, exact enrichment digest, expected modified timestamp, release key and QA version in Flow Decisions. Missing/ambiguous/mismatched response must end without DML.
4. Only after verified response: create a unique batch claim (not upsert), conditionally transition status from NeedsCommitReview to CommitApproved, finalize journal Committed **in the same Salesforce transaction**. No screen, async path, wait, or partial-success fault connector. Ensure Validation Rule rejects journal commit when Batch update matched zero records.
5. Final Salesforce read-back checks journal and status; Stage C is a separate idempotent process. Test parallel invocations and ambiguous API responses without blindly retrying.
6. Do not activate Flow, assign OAuth QA Custom Permission, or enable GitHub workflow until PASS / FAIL / expiry / wrong org / wrong issuer / replay / concurrency / provider unavailable cases are verified.

## Acceptance evidence

- Salesforce validation/deployment success for corrected Flow and External Service; org Id `00Dfj00000eVCOVEA4` readback.
- Independent QA OAuth identity established, least-privilege CRUD/FLS and secret store confirmed.
- External Service endpoint and Named Credential verified from actual Salesforce metadata, not inferred.
- Genuine source-bound signed PASS plus negative tests; commit atomically and once.
- SHA/flow version, requests, response codes and read-only verification recorded on Issue #54.
- Never expose credential material in repository, logs or issue. Rotate any credential found previously embedded in metadata; removing it from HEAD does not revoke it.

## Blocking prerequisites

The repository currently has Gemini/Groq/YouTube/Supadata External Services but **no verified trusted receipt-verifier endpoint**. GitHub Actions run scheduling was failing before jobs started as of the previous checks. The fail-closed change is a PR-only candidate pending CI and Salesforce validate; it is **not an enabled release solution**.
