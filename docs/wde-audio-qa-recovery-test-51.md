# WDE Test 4 — isolated deterministic technical retry test (Issue #51)

## Scope
- Shared production retry decision: `WDE_Audio_QA_Decide_Retry` (pure autolaunched Flow; no DML or provider call).
- Production `WDE_Verify_Sermon_Segment_Audio` routes actual provider HTTP non-200 / missing candidates, callout fault, malformed response or model SYSTEM_ERROR token to the shared decision and then persists QA status using its existing `Save_QA` update.
- Isolated `WDE_Test_Audio_QA_Recovery` exercises the **same decision Flow** for explicit categories `HTTP_429`, `TIMEOUT`, and `MALFORMED` without touching Gemini, Named Credentials, original transcript or business records.

## Deterministic test invocation
Invoke `/services/data/v68.0/actions/custom/flow/WDE_Test_Audio_QA_Recovery` with `inputs` containing `varT_FailureMode` and `varN_PriorAttempts`. Send three separate invocations per category, prior attempts 0, 1, 2. Expected outputs:
| Prior attempts | Next attempt | Shared decision |
| --- | --- | --- |
| 0 | 1 | RETRY_PENDING |
| 1 | 2 | RETRY_PENDING |
| 2 | 3 | SYSTEM_ERROR |

Negative input: `varT_FailureMode=INVALID` -> `INVALID_TEST_INPUT`, no provider call.
**Limit:** This harness verifies the production-shared retry decision in real Salesforce Flow runtime, but does **not** simulate genuine HTTP transport behavior or create three persistent Salesforce status transitions. Such tests require a controlled mock External Service/test object or an isolated provider adapter, and cannot be claimed as completed from this harness alone.

## Security and acceptance
- No credential change, no mass backfill, no production Segment mutation by the harness.
- Deployment/verification only in immutable WDE Org ID `00Dfj00000eVCOVEA4`.
- Validate manifest first; deployment is separate. Capture Salesforce Flow interview outputs and GitHub Issue #51 request/response evidence.
- This is partial Test 4 evidence. Complete acceptance still requires isolated fault integration test, persisted attempts, and no behavioral regression of already-PASS segment.
