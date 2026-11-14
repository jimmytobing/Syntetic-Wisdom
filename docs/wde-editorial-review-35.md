# WDE #35 — Independent editorial boundary review worksheet

**Scope:** source `a07fj00001F216TAAR`, verified WDE Org `00Dfj00000eVCOVEA4`, 1,921 caption indices `0–1920`. This is a **review worksheet**, not approved gold labels.

**Live snapshot evidence:** [All 23 persisted transitions, source matching, no gaps](https://github.com/jimmytobing/Syntetic-Wisdom/issues/35#issuecomment-6868134576); [five priority caption windows](https://github.com/jimmytobing/Syntetic-Wisdom/issues/35#issuecomment-6868192972). Do not copy confidential captions into a public issue or attach secrets.

## Reviewer rubric

1. Read the source caption window **before** seeing Groq/Gemini verdicts (blind review), then listen to the source audio if available and permitted.
2. Assign segment categories consistently: `Testimony` = firsthand lived account; `Teaching` = explanation/exposition; `Prayer` = direct prayer or, if policy explicitly chooses, invitation; `Worship` = sung/praised content; `Other` = announcements, host interludes, transitions. Record the **invitation-versus-direct-prayer rule** explicitly before deciding 1560/1568.
3. For each boundary record **retain/move/remove**, exact index, labels on both sides, source evidence reference, rationale and uncertainty; allow `UNRESOLVED`. Do not infer from punctuation or model agreement alone.
4. Capture reviewer identity and timestamp through a separately trusted process, with transcript/audio digest and independent adjudication. A typed name or self-reported flag does not authenticate identity. Resolve reviewer disagreements before assigning gold labels.
5. Leave Salesforce records `NeedsReview`. This worksheet does **not** enable issuance of a PASS receipt, production QA provenance, or automatic Content Plan/video publication.

## Persisted boundary inventory

| # | Caption boundary | Persisted categories | Priority | Reviewer decision |
|---|---|---|---|---|
| 01 | 14/15 | Other → Testimony | Routine | Pending |
| 02 | 53/54 | Testimony → Testimony | Routine | Pending |
| 03 | 98/99 | Testimony → Testimony | Routine | Pending |
| 04 | 186/187 | Testimony → Worship | High | Pending |
| 05 | 396/397 | Worship → Other | High | Pending |
| 06 | 400/401 | Other → Worship | High | Pending |
| 07 | 526/527 | Worship → Prayer | Routine | Pending |
| 08 | 558/559 | Prayer → Other | Routine | Pending |
| 09 | 566/567 | Other → Teaching | Routine | Pending |
| 10 | 811/812 | Teaching → Testimony | Routine | Pending |
| 11 | 891/892 | Testimony → Teaching | Routine | Pending |
| 12 | 1048/1049 | Teaching → Teaching | Routine | Pending |
| 13 | 1195/1196 | Teaching → Testimony | High | Pending |
| 14 | 1253/1254 | Testimony → Teaching | High | Pending |
| 15 | 1430/1431 | Teaching → Worship | Routine | Pending |
| 16 | 1524/1525 | Worship → Teaching | Routine | Pending |
| 17 | 1559/1560 | Teaching → Prayer | High | Pending |
| 18 | 1620/1621 | Prayer → Prayer | Routine | Pending |
| 19 | 1665/1666 | Prayer → Prayer | Routine | Pending |
| 20 | 1672/1673 | Prayer → Worship | Routine | Pending |
| 21 | 1712/1713 | Worship → Prayer | High | Pending |
| 22 | 1722/1723 | Prayer → Worship | High | Pending |
| 23 | 1811/1812 | Worship → Worship | Routine | Pending |

**Important:** list above is the 23 *existing* boundaries. Review may require inserting missing boundaries (for example a candidate sung start around caption 194, direct prayer around 1568) or removing existing ones. Thus reviewing these 23 alone does not certify complete semantic segmentation.

## Per-boundary adjudication template

- Boundary ID / source and transcript digest:
- Blind reviewer + independently verified identity / timestamp:
- Source captions before and after / permitted audio evidence reference:
- Disposition: `RETAIN` / `MOVE` / `REMOVE` / `INSERT` / `UNRESOLVED`
- If MOVE/INSERT: exact new caption index, left/right category:
- Reason and uncertain context:
- Second reviewer and disagreement resolution:
- Trusted adjudication record reference and authenticated snapshot:
- Final status: **Pending** unless adjudication is completed and externally verified.

## False-PASS measurement prerequisites

Blindly evaluate a **representative sample** including model agreements, disagreements, ordinary boundaries and difficult transitions. Define what counts as a false automated PASS *before* testing; measure numerator/denominator and uncertainty interval. Five selected disagreements are not representative, and a perfect score on this worksheet cannot authorize automatic editorial approval. Audio and publication-rights checks remain independent gates.

## Timecoded priority audio-review queue

Salesforce SOQL confirmed `External_Video_Id__c = 4SPC0Ke1Eyg` on the verified sermon source ([REST evidence](https://github.com/jimmytobing/Syntetic-Wisdom/issues/35#issuecomment-6868525953)). The raw indexed transcript has monotonically increasing numeric caption starts, with millisecond-like magnitudes ([CLI evidence](https://github.com/jimmytobing/Syntetic-Wisdom/issues/35#issuecomment-6868504996)). Times below are **derived from caption start values divided by 1,000 and rounded down**, not independently checked against playback. The linked YouTube video may be inaccessible or time-shifted; reviewer must verify audio/video alignment, not assume it.

| Persisted/candidate boundary | Caption index | Start | Review cue |
|---|---:|---|---|
| 186/187 | 187 | [05:55](https://www.youtube.com/watch?v=4SPC0Ke1Eyg&t=355s) | Testimony → Worship; invitation before singing |
| 193/194 | 194 | [06:09](https://www.youtube.com/watch?v=4SPC0Ke1Eyg&t=369s) | Candidate first sung line |
| 396/397 | 397 | [14:27](https://www.youtube.com/watch?v=4SPC0Ke1Eyg&t=867s) | Worship → spoken interlude |
| 400/401 | 401 | [14:33](https://www.youtube.com/watch?v=4SPC0Ke1Eyg&t=873s) | Spoken interlude → singing |
| 1195/1196 | 1196 | [43:39](https://www.youtube.com/watch?v=4SPC0Ke1Eyg&t=2619s) | Teaching → personal account |
| 1253/1254 | 1254 | [45:40](https://www.youtube.com/watch?v=4SPC0Ke1Eyg&t=2740s) | Personal account → Peter teaching |
| 1559/1560 | 1560 | [57:35](https://www.youtube.com/watch?v=4SPC0Ke1Eyg&t=3455s) | Invitation to prayer |
| 1567/1568 | 1568 | [57:50](https://www.youtube.com/watch?v=4SPC0Ke1Eyg&t=3470s) | Candidate beginning of direct prayer |
| 1672/1673 | 1673 | [61:55](https://www.youtube.com/watch?v=4SPC0Ke1Eyg&t=3715s) | Prayer → possible worship cue |
| 1712/1713 | 1713 | [63:11](https://www.youtube.com/watch?v=4SPC0Ke1Eyg&t=3791s) | Worship → spoken blessing |
| 1722/1723 | 1723 | [63:30](https://www.youtube.com/watch?v=4SPC0Ke1Eyg&t=3810s) | Blessing → singing |
| 1811/1812 | 1812 | [67:14](https://www.youtube.com/watch?v=4SPC0Ke1Eyg&t=4034s) | Spoken goodbye → separate sung section |

Use each link to open approximately 5–10 seconds before the target transition and listen past it. If audio is unavailable, leave the outcome `UNRESOLVED`; captions alone do not authenticate speaker changes, song starts, or spoken prayer boundaries. The table is a convenience queue **not** a certified gold set, audio verification, or approval to modify Salesforce.
