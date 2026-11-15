# WDE — Post-HIVE Editorial Audio Context (Issue #51)

## Intent
Provide optional read-only source background to a human editor **after** Audience Needs have been scored and a Content Plan selected. AI_VERIFIED is a same-provider Gemini second-pass assertion about the first 20 seconds of original audio, not HUMAN_APPROVED, copyright clearance, or independent ground truth.

## Isolated Flow
`WDE_Get_Editorial_Audio_Context` (Autolaunched, source Draft) takes `varT_ContentPlanId` and `varT_SermonSourceId` as explicit inputs. It returns `varB_ContextAvailable`, `varT_EditorialContext` (bounded QA notes), and `varT_Error`. It performs Get Records and decisions only; no DML, callouts, scheduler, or downstream Flow invocation.

It returns context only when:
1. Content Plan exists and points to an Audience Need.
2. Audience Need is `Ready` and HIVE Score ≥60, independently calculated.
3. A real `WDE_Audience_Signal__c` joins that same Need and chosen `Sermon_Source__c`; never join by Name.
4. Source has `AI_VERIFIED`, analysis JSON and QA notes present, with QA check timestamp ≥ analysis validation timestamp.
5. On missing or invalid evidence, return no context; no mutations.

The returned note is capped at 1,200 characters. It is labeled **untrusted editorial reference**, first 20 seconds only, and explicitly forbids deriving demand/score/urgency or assuming rights clearance. This is a reviewer-driven utility, **not** an automatic enrichment of Audience Need or a scoring input. Existing HIVE formula, classifying ingest, scheduler, proposal creation, approval and publishing remain unchanged.

## Validation and test gates
- Metadata check-only in WDE org ID `00Dfj00000eVCOVEA4` using `manifest/wde-editorial-context-51.xml`.
- Once validated, any deploy should retain Draft; do not activate, schedule, or invoke without explicit approval.
- Before activation, read-only test: noneligible Need/Plan, no matching Signal, QA `NEEDS_REVIEW`, stale QA, and known eligible linkage; assert false/empty on fail-closed paths, true only for linked verified evidence.
- HIVE and signal counts must remain unchanged; no content-plan update or publication.
- Source QA timestamp is an approximation of cache freshness; if analysis JSON is overwritten without updating validated-at, a hash/version link is needed before strict trust.

## Earlier A/B caveat
The 12-synthetic-comment A/B in `docs/wde-audience-context-ab-51.md` changed 3 classifications when audio context was injected *before* HIVE. That approach was rejected and the ingest Flow was reverted to main. Post-HIVE context is an editorial convenience only, not proof of audience demand or quality gains.

## Actual Salesforce result — 15 Nov 2026
- Check-only **SUCCESS** `0Affj00000ZM8ArCAL` (1 Flow, 0 component errors, org `00Dfj00000eVCOVEA4`). [Audit](https://github.com/jimmytobing/Syntetic-Wisdom/issues/51#issuecomment-6887680272)
- Draft metadata actual deployment **SUCCESS** `0Affj00000ZM8XRCA1` (`checkOnly=false`, 1 Flow, 0 component errors, org verified). [Audit](https://github.com/jimmytobing/Syntetic-Wisdom/issues/51#issuecomment-6887692782)
- Tooling GET verifies `WDE_Get_Editorial_Audio_Context` latest `301fj00002FGJ6fAAH` and **ActiveVersionId=null**; it is **not activated**, scheduled, or wired into Content Planning. Existing `WDE_Fetch_YouTube_Comments` active `301fj00002EA0SHAA1`, `WDE_Propose_Content_Plan` active `301fj00002EASLJAA5`, and `WDE_Recalculate_HIVE` active `301fj00002EBEjJAAX` unchanged. [Audit](https://github.com/jimmytobing/Syntetic-Wisdom/issues/51#issuecomment-6887698548)
- **Not verified:** runtime editorial context availability for a real eligible Need/Plan/Source triplet (Flow is Draft); no user-facing editorial UI or integration exists yet. Human approval and rights clearance remain independent gates. Do not represent deploy success as end-to-end behavior.
