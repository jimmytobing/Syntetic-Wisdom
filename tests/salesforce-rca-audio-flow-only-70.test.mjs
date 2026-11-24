import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(resolve(root,p),'utf8');
const path='force-app/main/default/';
const flow=n=>read(path+'flows/'+n+'.flow-meta.xml');
const reserve=flow('WDE_Reserve_Foreground_Audio_QA');
const worker=flow('WDE_Run_Foreground_Audio_QA');
const trigger=flow('Tgr_WDE_Audio_QA_Foreground_Claim');
const unique=read(path+'objects/WDE_Audio_QA_Claim__c/fields/Claim_Key__c.field-meta.xml');
const schemaManifest=read('manifest/wde-audio-qa-foreground-schema-70.xml');
const flowsManifest=read('manifest/wde-audio-qa-foreground-flows-70.xml');
const operator=read(path+'permissionsets/WDE_Audio_QA_Foreground_Operator.permissionset-meta.xml');

test('Flow-only source does not ship a new Apex runtime or Apex permissions',()=>{
  for(const file of [
    'classes/WDEAudioQaForegroundClaim.cls',
    'classes/WDEAudioQaForegroundClaim.cls-meta.xml',
    'classes/WDEAudioQaForegroundClaimTest.cls',
    'classes/WDEAudioQaForegroundClaimTest.cls-meta.xml'
  ]) assert.equal(existsSync(resolve(root,path+file)),false,file);
  assert.equal(existsSync(resolve(root,'manifest/wde-audio-qa-foreground-claim-70.xml')),false);
  for(const text of [schemaManifest,flowsManifest,operator]) assert.doesNotMatch(text,/ApexClass|AuthorApex|SystemPermission/);
});

test('unique database claim is created once, no check-then-callout race',()=>{
  assert.match(unique,/<unique>true<\/unique>/);
  assert.match(unique,/<externalId>true<\/externalId>/);
  assert.match(reserve,/<recordCreates><name>Create_Claim<\/name>/);
  assert.match(reserve,/<field>Claim_Key__c<\/field>/);
  assert.match(reserve,/<elementReference>f_ClaimKey<\/elementReference>/);
  assert.match(reserve,/<name>Duplicate_Or_Fault<\/name>/);
  assert.match(reserve,/CLAIM_CREATE_FAILED_DO_NOT_RETRY/);
  assert.match(reserve,/<name>Check_Source<\/name>/);
  assert.match(reserve,/PermissionGranted/);
  assert.match(reserve,/Audio_QA_Required__c/);
  assert.match(reserve,/SYSTEM_ERROR/);
  assert.match(reserve,/<name>Source_Record_Modified__c|<field>Source_Record_Modified__c<\/field>/);
  assert.doesNotMatch(reserve,/<actionCalls>|WDEGeminiVideo|<recordUpdates>/);
});

test('one claim create invokes one async-after-commit worker, never update-trigger',()=>{
  assert.match(trigger,/<recordTriggerType>Create<\/recordTriggerType>/);
  assert.match(trigger,/<pathType>AsyncAfterCommit<\/pathType>/);
  assert.match(trigger,/<flowName>WDE_Run_Foreground_Audio_QA<\/flowName>/);
  assert.match(trigger,/<stringValue>RESERVED<\/stringValue>/);
  assert.doesNotMatch(trigger,/<recordUpdates>|<recordCreates>|<actionCalls>|CreateAndUpdate/);
});

test('foreground worker respects 30s rights, stable source, no retry or QA verdict',()=>{
  assert.match(worker,/WDEGeminiVideo\.analyzeVideo/);
  assert.equal((worker.match(/<actionCalls>/g)||[]).length,1);
  assert.match(worker,/<name>f_ClipValid<\/name>/);
  assert.match(worker,/&lt;= 30000/);
  assert.match(worker,/<name>f_SourceValid<\/name>/);
  assert.match(worker,/PermissionGranted/);
  assert.match(worker,/Source_Record_Modified__c/);
  assert.match(worker,/Source_Modified__c/);
  assert.match(worker,/Transcript_Text__c/);
  assert.match(worker,/MEDIA_UNAVAILABLE/);
  assert.match(worker,/UNKNOWN_DO_NOT_RETRY/);
  assert.match(worker,/AMBIGUOUS_CALLOUT/);
  assert.match(worker,/<name>Check_PostSegment<\/name>/);
  assert.match(worker,/<name>Check_PostSource<\/name>/);
  assert.match(worker,/<name>tt_Instruction<\/name>/);
  assert.match(worker,/<status>Draft<\/status>/);
  assert.match(reserve,/<status>Draft<\/status>/);
  assert.match(trigger,/<status>Draft<\/status>/);
  for(const s of [reserve,worker,trigger]) {
    assert.doesNotMatch(s,/<object>Sermon_Segment__c<\/object><\/recordUpdates>/);
    assert.doesNotMatch(s,/<recordDeletes>|<schedule>|<scheduledPaths><connector><targetReference>Run_Foreground<\/targetReference><\/connector><pathType>(?!AsyncAfterCommit)/);
  }
});

test('manifests list only claim schema and three inactive Flow metadata',()=>{
  for(const f of ['WDE_Reserve_Foreground_Audio_QA','WDE_Run_Foreground_Audio_QA','Tgr_WDE_Audio_QA_Foreground_Claim']) assert.match(flowsManifest,new RegExp('<members>'+f+'<\\/members>'));
  for(const f of ['Video_Id__c','Source_Record_Modified__c','Source_Modified__c','Claim_Key__c']) assert.ok(schemaManifest.includes(f),f);
  assert.doesNotMatch(flowsManifest,/FlowDefinition|ApexClass|destructiveChanges/);
  assert.doesNotMatch(schemaManifest,/PermissionSet|ApexClass|destructiveChanges/);
});
