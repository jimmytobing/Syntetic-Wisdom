# WDE — Knowledge Unit QA Gate (Issue #35)

This gate protects **knowledge units**, not raw transcript segment length. Stage A remains semantic and may yield a long Teaching segment. Convert a long segment into several *source-grounded candidates* downstream; do **not** split captions to satisfy 45-second script length.

## Usage

```bash
node --test scripts/wde-knowledge-qa.test.mjs scripts/wde-raw-caption-parser.test.mjs
node scripts/wde-knowledge-qa.mjs /path/to/local-candidates.json
```

Candidate JSON shape:

```json
{
  "raw_transcript": "0;100;250;Exact, unmodified caption text|",
  "segments": [{"start_index":0,"end_index":0,"segment_type":"Teaching","topic":"Specific topic","summary":"Only what the source states"}],
  "units": [{
    "id":"stable-source-and-concept-key",
    "source_start_index":0,
    "source_end_index":0,
    "evidence":[{"index":0,"quote":"Exact"}],
    "claim":"One narrowly scoped claim",
    "audience_need":"Specific, non-invented audience need",
    "application":"One feasible action supported by the source",
    "original_script_45s":"An ORIGINAL roughly 85-120 word spoken Indonesian script",
    "human_review":"pending",
    "reviewer":"",
    "review_notes":""
  }]
}
```

**Source field verified in active Flow metadata:** `Sermon_Source__c.Raw_Transcript_Text__c` uses `index;start_ms;duration_ms;text|`. Supply this directly via `raw_transcript` (or `captions`, but never both). Parser rejects missing terminal delimiter, noncontiguous indices, invalid numeric offsets and empty text. **Source requirement:** retrieve indexed captions from original source before attempting a verified citation. `Sermon_Segment__c.Transcript_Text__c` is aggregated prose, **not** an index-addressable transcript; it is insufficient to prove a claim's exact caption location. Never fabricate caption quotes or indices from concatenated segment text. Extract the actual indexed transcript from the existing source field/job, once its schema and data are verified against WDE org. Do not put personal data into GitHub comments or fixtures.

## Gate behavior

- All caption indices and segment intervals must be contiguous and cover the same span, no overlap.
- Every claim requires an exact excerpt tied to an actual caption inside its unit range.
- Human approval with reviewer and review notes is required. A machine check cannot validate theology, narrative boundaries, attribution, ASR/audio accuracy, authenticity, or originality.
- A draft script of about 85–120 spoken words is a review heuristic for ~45 seconds, **not** a guaranteed duration or segment size cap. Final duration requires narration timing.
- Never promote records or publish videos based only on this gate. Approved status refers to editorial review evidence, not automatic publishing clearance.
- Run on **local/exported sanitized JSON**; this script performs no network calls or Salesforce DML.

## Acceptance targets for the 12-segment WDE source

1. Confirm baseline caption coverage 0–1619; keep the 12 existing `NeedsReview` records intact.
2. Speaker boundaries: audit #1/#2 and the testimony transition into #3 against original caption indices/audio.
3. Teaching: #8 contains 613 captions and 20,138 characters; identify independent insight-worthy claims **with evidence** instead of size-based arbitrary segmentation.
4. Worship ASR: #12 is noisy English transcription; do not infer exact lyrics or produce reconstructed quotes.
5. Each candidate must contain one supported claim, a concrete audience need and application, evidence indices, and an original ~45-second script; remain pending until reviewed.
6. Additional Stage A prompt changes should be justified by a reproducible editorial failure and safe multi-batch sample, since earlier third-variant call returned `INVALID_AI_FORMAT`.

**Status as of 13 Nov 2026:** prior Flow version active `301fj00002EatjFAAR` on WDE Org ID `00Dfj00000eVCOVEA4`. This QA utility is **repo-only**, not deployed Salesforce automation. Full-video Insight readiness is not yet verified.


## Full-source fidelity validation — 13 Nov 2026

A read-only `Sf Bash` run against live org `00Dfj00000eVCOVEA4` reconstructed every canonical segment by joining its exact caption text within its stored `Start_Index__c` and `End_Index__c`. All 12/12 segments matched character-for-character after whitespace normalization; caption coverage is 0–1619, without gaps; all statuses remain `NeedsReview`. Source `Rights_Status=Unknown`. [Sf Bash evidence](https://github.com/jimmytobing/Syntetic-Wisdom/issues/35#issuecomment-6853084476).

**Interpretation:** transcript persistence fidelity is **VERIFIED**, but semantic boundaries, speaker correctness, 45-second narration timing, original storytelling, and audio clearance are **not proven**.

## Additional fail-closed guards — 13 Nov 2026

- Reject a knowledge unit that crosses the stored segment boundary: explicit `UNIT_CROSSES_SEGMENTS`, to avoid a hidden semantic handoff.
- Reject malformed/null knowledge units and evidence entries without runtime crashes.
- Even when an input claims `human_review=approved` with reviewer fields, the machine emits `STRUCTURALLY_VALID_PENDING_INDEPENDENT_REVIEW` rather than asserting publish or editorial clearance. Editorial signoff must be independently established outside a self-reported JSON field.
- Node tests in repository expanded to 17 cases. A V8 compatibility harness executed 17/17 successfully, but the official Node test runner still needs validation.

**Publishing gate:** do not automatically approve, distribute or monetize any content while `Rights_Status=Unknown`, voice/audio verification is pending, or independent editorial approval is missing. This is not a generic restriction on authoring original text; it is a safeguard against implying that rights or factual reviews have occurred.

## Source-grounded candidate scorecard — 13 Nov 2026

Read-only Salesforce CLI verified 17/17 exact caption quote references for five draft original Wisdom Insight units:

| Candidate | Source caption window | Exact source quotes | Draft narration | Status |
| --- | --- | ---: | ---: | --- |
| KU-07-A — Faith and disappointment during crisis | 552–575 | 4/4 | 96 words | NeedsReview |
| KU-08-A — Financial stress and response | 605–631 | 3/3 | 91 words | NeedsReview |
| KU-08-B — Avoid crisis-driven bad decisions | 730–760 | 3/3 | 89 words | NeedsReview |
| KU-08-C — Active waiting | 1037–1042 | 3/3 | 95 words | NeedsReview |
| KU-10-A — Caring leadership and workers | 1307–1326 | 4/4 | 92 words | NeedsReview |

**Evidence:** [SF CLI exact-quote validation](https://github.com/jimmytobing/Syntetic-Wisdom/issues/35#issuecomment-6853492611). Long-form drafts: [#8](wde-knowledge-unit-drafts-segment-8-35.md) and [#7/#10](wde-knowledge-unit-drafts-segments-7-10-35.md).

**Measured technical gate:** 17 quote checks matched; 19/19 V8 JavaScript regression cases passed (not an official Node test). 12/12 canonical segment text was reconstructed byte-equivalent after whitespace normalization; 7/11 boundaries flagged for editorial review by a **heuristic**, not classified as proven errors. Stage A single controlled sample 560–687 returned SUCCESS without canonical DML.

**Hard blockers:** no independent audio verification, human source/theology editorial approval, actual 45-second voiceover timing or source rights clearance (`Rights_Status=Unknown`). Five candidates must remain `NeedsReview`, not auto-approved or distributed. A mechanical caption substring match cannot establish that all story claims, theology, voice, or rights are correct.
