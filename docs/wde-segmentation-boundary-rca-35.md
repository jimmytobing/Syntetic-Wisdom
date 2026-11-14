# WDE — Editorial boundary RCA, video _tYB8TLFizQ (Issue #35)

**Status:** Source-caption-grounded RCA, non-destructive; **no segment edits approved**. WDE Org ID `00Dfj00000eVCOVEA4`; source `a07fj00001J9PShAAN`; segment baseline 12, coverage 0–1619, all NeedsReview.

**Source evidence:** [Sf Bash bounded raw-caption inspection](https://github.com/jimmytobing/Syntetic-Wisdom/issues/35#issuecomment-6852918171). The query verified `Rights_Status=Unknown` and source caption index integrity. These are live Salesforce captions; audio verification is still required before changing boundaries.

| Boundary currently stored | Source evidence | Defect / interpretation | Minimal candidate improvement |
|---|---|---|---|
| Segment 1 end 14 / 2 starts 15 | 11–13 announce testimonies; 14 starts a speaker attribution; 15 continues testimony introduction | Attributing the next testimony to general introduction creates narrative leakage | Review moving testimony start to 14 and segment 1 end to 13; confirm original speaker and caption audio |
| Segment 2 ends 91 / 3 starts 92 | 85–86 testimony closing; 87–89 host response/prediction; 90 music; 91 next testimony handoff; 92 first-person start | Host interlude is not same narrator as first testimony | Separate response/handoff as Other or attach short transition under explicit segmentation policy; ensure independent testimony begins by index 92 |
| Segment 3 ends 127 / 4 begins 128 | 118–127 host interpretation and invitation; 128–131 spoken invitation; 132 onward singing | A Worship segment must not begin from spoken introduction at 128 | Set actual Worship start at confirmed singing onset (around 132) after audio review; previous spoken speech belongs Other |
| Segment 7 ends 604 / 8 begins 605 | 604 "Mungkin sekarang memang sudah hancur ini", 605 "itu, tapi bukan aku." | Hard split inside same sentence and assertion | Move boundary to a complete semantic break; if #8 is broad, derive atomic KUs without arbitrary caption split |
| Segment 8 ends 1217 / 9 begins 1218 | 1213–1216 closes teaching; 1217 says "Mari kita nyanyikan"; 1218 has explicit singing tag | 1217 is handoff, 1218 starts singing | Confirm boundary at 1217/1218; categorize handoff separately only if there is a meaningful independent Other segment |
| Segment 10 ends 1439 / 11 begins 1440 | 1437–1438 prayer Amen; 1439 singing, 1440 music, 1441 onwards sung words | Singing may begin in previous segment before existing boundary | Verify 1439 is actually music/song rather than final prayer; if so shift boundary and keep prayer separate |

## Teaching segmentation vs atomic insights

Segment 8, 605–1217 (613 captions, 20,138 chars) should not be accepted as **one** Insight merely due to valid index coverage. Independently grounded topics already extracted as `KU-08-A` (605–631), `KU-08-B` (730–760) and `KU-08-C` (1037–1042). These subranges are topic evidence windows, **not** a complete partition of segment #8. The original 12 segment records are left untouched until resegmentation is tested end-to-end.

## Medical, identity and rights guardrails

- The second testimony includes a later statement about diagnosis changes during follow-up (caption 112–114). Do not promote a reported miracle or first-hand account to independently verified medical efficacy. Do not speculate about someone's medical state.
- Host remarks around 87–89 and 118–122 are the host's interpretations, **not** independent clinical findings. Label them as speaker opinions and avoid medical promises.
- Worship segment 12 has noisy English ASR. Do not reconstruct copyrighted lyrics or assume exact quotations from degraded captions.
- `Rights_Status=Unknown` was reconfirmed live; do not publish/copy source recording or lyrics into downstream videos without clearance. New narration should be original and source-attributed as appropriate.

## Technical action plan / pass conditions

1. In an isolated **non-persisting** test, supply actual caption text and context near six suspected boundaries to Stage A and obtain the entire 7-field contract without `INVALID_AI_FORMAT`.
2. Require 0 gaps/overlaps; speaker transitions not conflated; Teaching/Worship transitions grounded in actual speech/song. Every candidate must pass quote/index mechanical checks.
3. If a reproducible mismatch remains, make the **smallest Stage A prompt change**: explicitly prefer complete sentences and source-speaker boundaries; preserve 7-field and continuity contract. Run a fresh trial. Do not reintroduce the previously malformed third prompt variant.
4. Only after audio/editorial acceptance and source rights checks should any 12 canonical records be changed or republished. Deployment alone does not constitute content approval.

**Current result:** boundary root-cause patterns VERIFIED from caption text; exact corrected boundaries LIKELY pending source audio; editorial approval and publishing BLOCKED. No Salesforce DML, Flow mutation, deploy or activation in this RCA.
