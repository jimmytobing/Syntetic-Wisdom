# WDE Audience Listening — Data Governance

Last reviewed: 2026-11-08

## Stored data

`WDE_Audience_Signal__c` stores only an anonymized category, a deterministic safe summary, publication date, source lookup, Audience Need lookup, and `Signal_Key__c` in the form `YT:{videoId}:{commentId}`. It must not store author name, handle, channel ID, profile image, location, raw comment text, or detailed health information.

## Access

- Restrict read/write access to the WDE integration user and approved WDE analysts through least-privilege permission sets.
- Do not expose `Signal_Key__c` in public/community pages, reports shared outside the approved WDE group, logs, or downstream prompts.
- Use Named Credentials and External Credentials for YouTube and Groq secrets; never store keys in Flow metadata or records.

## Retention and refresh

The YouTube API Services Developer Policies treat data returned by the API as API Data. The policy permits limited Non-Authorized Data to be stored temporarily for no longer than 30 calendar days; after that it must be deleted or refreshed. Stored API Data must be kept consistent with current YouTube data, and user deletion requests must be honored as soon as possible and within 7 calendar days.

For the pilot:

1. Treat the YouTube video ID and comment ID embedded in `Signal_Key__c` as Non-Authorized API Data.
2. Refresh or delete the corresponding signal within 30 calendar days of the last successful YouTube verification.
3. Delete a signal within 7 calendar days of a valid deletion request or when a refresh confirms that the source comment/video is no longer available.
4. Do not retain raw comment text after the synchronous classification transaction.
5. Before production, add an auditable retention job and a `Last_Source_Verified_At__c`-style control field (or equivalent governed store). The current Flow does not yet automate this lifecycle.

## Derived insight warning

The same policy restricts creating derived data or metrics from YouTube API Data, and additional derived-metric/storage allowances apply only to audited developers with explicit permission. WDE must obtain legal/compliance review and, where required, YouTube API audit/approval before Audience Trend or HIVE scores are promoted beyond the pilot.

Sources:

- [YouTube API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies), sections III.E.4 (storage, refresh, deletion) and III.E.4.h / section L (derived data and additional allowances).
- [YouTube API Services Terms of Service](https://developers.google.com/youtube/terms/api-services-terms-of-service).
