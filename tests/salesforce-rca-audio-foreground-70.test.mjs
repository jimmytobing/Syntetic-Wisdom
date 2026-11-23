import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(resolve(root,p),'utf8');
const apex=read('force-app/main/default/classes/WDEAudioQaForegroundClaim.cls');
const metadata=read('force-app/main/default/objects/WDE_Audio_QA_Claim__c/fields/Claim_Key__c.field-meta.xml');
const manifest=read('manifest/wde-audio-qa-foreground-claim-70.xml');
const operator=read('force-app/main/default/permissionsets/WDE_Audio_QA_Foreground_Operator.permissionset-meta.xml');

test('foreground starts with one database-unique lifetime claim per segment',()=>{
  assert.match(metadata,/<unique>true<\/unique>/);
  assert.match(metadata,/<externalId>true<\/externalId>/);
  assert.match(apex,/uniqueKey\(Id segmentId\)/);
  assert.match(apex,/CLAIM-LOCK-V1/);
  assert.match(apex,/insert claim/);
  assert.match(apex,/StatusCode\.DUPLICATE_VALUE/);
  assert.match(apex,/ALREADY_CLAIMED/);
  assert.match(apex,/SOURCE_CHANGED_REVIEW_REQUIRED/);
  assert.match(apex,/inputs\.size\(\) != 1/);
});

test('claim, state change and callout run in separate queueable transactions',()=>{
  assert.match(apex,/System\.enqueueJob\(new ReserveJob/);
  assert.match(apex,/System\.enqueueJob\(new CalloutJob/);
  assert.match(apex,/class CalloutJob implements Queueable, Database\.AllowsCallouts/);
  assert.match(apex,/claim\.State__c = 'CALLING'/);
  assert.match(apex,/UNKNOWN_DO_NOT_RETRY/);
  assert.match(apex,/AMBIGUOUS_CALLOUT/);
  assert.match(apex,/req\.setTimeout\(110000\)/);
  assert.match(apex,/video_metadata/);
  assert.match(apex,/start_offset/);
  assert.match(apex,/end_offset/);
  assert.match(apex,/gemini-3\.6-flash/);
  assert.match(apex,/callout:GeminiNmCred/);
  assert.doesNotMatch(apex,/future\s+void|@future|System\.schedule|Database\.executeBatch/);
});

test('claim result never writes QA verdict/transcript and rejects bad provider evidence',()=>{
  assert.match(apex,/SOURCE_FINGERPRINT_CHANGED/);
  assert.match(apex,/SOURCE_CHANGED_DURING_CALLOUT/);
  assert.match(apex,/NON_STOP_FINISH/);
  assert.match(apex,/MEDIA_UNAVAILABLE/);
  assert.match(apex,/MISSING_OR_OVERSIZED_TEXT/);
  assert.match(apex,/Result_Hash__c/);
  assert.doesNotMatch(apex,/update\s+Sermon_Segment__c|insert\s+Sermon_Segment__c|Audio_QA_Status__c\s*=|Transcript_Text__c\s*=/);
  assert.match(operator,/<allowDelete>false<\/allowDelete>/);
  assert.doesNotMatch(operator,/Sermon_Segment__c\.Transcript_Text__c|Sermon_Segment__c\.Audio_QA_Status__c/);
});

test('targeted manifest includes only durable claim metadata and Apex classes',()=>{
  assert.match(manifest,/<members>WDE_Audio_QA_Claim__c<\/members>/);
  assert.match(manifest,/<members>WDEAudioQaForegroundClaim<\/members>/);
  assert.match(manifest,/<members>WDEAudioQaForegroundClaimTest<\/members>/);
  assert.match(manifest,/<members>WDE_Audio_QA_Foreground_Operator<\/members>/);
  assert.doesNotMatch(manifest,/WDE_Start_Segment_Audio_Async_QA|WDE_Verify_Sermon_Segment_Audio|destructiveChanges/);
});
