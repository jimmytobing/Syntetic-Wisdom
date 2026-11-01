# Wisdom Discovery PoC 1C — Salesforce Flow-first Blueprint

## Apa yang sudah nyata
- Input: 58 time-window chunks dari video `4SPC0Ke1Eyg`.
- Output: `concept_candidates.json`, `concept_relations.json`, `wisdom_examples.json`, dan `concept_review.csv`.
- Concept extraction masih **deterministic lexical rules**, bukan LLM semantic reasoning; dua insight adalah contoh editorial, bukan hasil pipeline AI otonom.

## Object schema (minimum)
- `Sermon_Source__c`: `External_Video_Id__c` Text(20) Unique External ID, `Video_URL__c` URL, `Transcript_Storage_Key__c` Text(255), `Rights_Status__c` Picklist (`Unknown`, `PermissionGranted`, `Restricted`), `Ingest_Status__c` Picklist.
- `Transcript_Job__c`: lookup `Sermon_Source__c`; `Job_Key__c` Unique External ID; `Stage__c` (`Pending`, `Extracted`, `ConceptReview`, `Approved`, `Error`); `Error_Message__c` Long Text, `Total_Chunks__c` Number.
- `Wisdom_Concept__c`: `Concept_Key__c` Unique External ID, `Theme__c` Text(80), `Concept_Type__c` Picklist, `Candidate_Summary__c` Long Text Area, `Review_Status__c` Picklist, optional `Sermon_Source__c` lookup.
- `Wisdom_Relation__c`: `Relation_Key__c` Unique External ID, `From_Concept__c` lookup, `To_Concept__c` lookup, `Relation_Type__c` picklist, `Reason__c` Text(255).
- `Wisdom_Insight__c`: `Insight_Key__c` Unique External ID, `Analogy__c` Long Text Area, `Practical_Step__c` Long Text Area, `Review_Status__c` and `Safety_Status__c` Picklists, `Generation_Method__c` Text(100).
- `Wisdom_Insight_Concept__c`: two lookups (`Wisdom_Insight__c`, `Wisdom_Concept__c`) to maintain many-to-many concept provenance internally.

## Flow design
1. **Record-Triggered Flow, `Sermon_Source__c` after save:** if rights status permits processing and ingest state `Pending`, create `Transcript_Job__c` with unique key, queue async path.
2. **Async path callout:** Named Credential -> Cloudflare Worker coordinator (no secrets in browser); Worker may call free transcription/AI provider and return small JSON status. Do not run large LLM workloads in a Worker with low CPU quota.
3. **Concept review Screen Flow:** list review candidates; reviewer marks `Approved`/`Rejected`/`NeedsEdit`. Avoid trying to deserialize thousands of transcript rows directly into Flow.
4. **Wisdom insight review Flow:** review new analogies for helpfulness, coherence, originality claims, and harmful advice. An insight need not show citations in public; internal lineage is used for audit, revision, deletion requests, and attribution when needed.
5. **Publication Flow:** publish only approved insight and only where rights/privacy policies permit.

## Ingestion strategy
To upload concepts to Salesforce, use a protected server-to-server endpoint or a manual CSV import to **non-production** Developer org. For bulk transcript, store source securely outside Salesforce and use a key/reference. Never publish raw transcript, names of testimony contributors, keys, or user counseling records into GitHub Pages.

## Acceptance criteria for next real LLM milestone
- Detect topic and speech/song/testimony without relying only on keyword checks.
- Concept boundaries may span multiple 75s windows; justify merging/splitting.
- Create 2–3 competing candidate insights per question, criticize each, select safely.
- Distinguish spiritual assertion from verified fact; never promise healing, employment, wealth or spiritual outcomes.
- Preserve internal sources for debugging without mandatory public source citation for original AI analogies.
- Human review of at least 20 sampled segments before broad automation.
