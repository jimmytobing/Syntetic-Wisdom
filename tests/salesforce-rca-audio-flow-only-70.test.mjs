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
const runner=read(path+'permissionsets/WDE_Audio_QA_Foreground_Runner.permissionset-meta.xml');

test('Flow-only source does not ship a new Apex runtime or Apex permissions',()=>{
  for(const file of [
    'classes/WDEAudioQaForegroundClaim.cls',
    'classes/WDEAudioQaForegroundClaim.cls-meta.xml',
    'classes/WDEAudioQaForegroundClaimTest.cls',
    'classes/WDEAudioQaForegroundClaimTest.cls-meta.xml'
  ]) assert.equal(existsSync(resolve(root,path+file)),false,file);
  assert.equal(existsSync(resolve(root,'manifest/wde-audio-qa-foreground-claim-70.xml')),false);
  for(const text of [schemaManifest,flowsManifest,operator,runner]) assert.doesNotMatch(text,/ApexClass|AuthorApex|SystemPermission/);
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

test('manual unique-create is the only automatic dispatch entrypoint',()=>{
  assert.match(reserve,/<name>Dispatch_Once<\/name>/);
  assert.match(reserve,/<flowName>WDE_Run_Foreground_Audio_QA<\/flowName>/);
  assert.match(reserve,/<name>Duplicate_Or_Fault<\/name>/);
  assert.match(reserve,/<targetReference>Dispatch_Once<\/targetReference>/);
  assert.match(reserve,/<name>Accept_Claim<\/name>/);
  assert.match(worker,/<flowTransactionModel>Automatic<\/flowTransactionModel>/);
  assert.doesNotMatch(trigger,/<scheduledPaths>|<pathType>AsyncAfterCommit<\/pathType>|<subflows>|<actionCalls>/);
  assert.match(trigger,/<status>Draft<\/status>/);
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

test('production activation remains forbidden until async dispatch is proven idempotent',()=>{
  assert.match(worker,/SECURITY_REVIEW_REQUIRED/);
  assert.match(trigger,/SECURITY HOLD/);
  for(const xml of [reserve,trigger,worker]) assert.match(xml,/<status>Draft<\/status>/);
  assert.match(worker,/<stringValue>RESERVED<\/stringValue>/);
  assert.doesNotMatch(trigger,/<scheduledPaths>|<subflows>/);
  assert.match(reserve,/SECURITY_REVIEW_REQUIRED/);
  assert.match(worker,/WDEGeminiVideo\.analyzeVideo/);
  // Manual unique Create blocks competing starts; direct worker invocation and
  // platform continuation replay must be controlled before activation.
});

test('operator has read-only claim permissions, not claim state mutation',()=>{
  assert.match(operator,/<allowRead>true<\/allowRead>/);
  assert.match(operator,/<allowCreate>false<\/allowCreate>/);
  assert.match(operator,/<allowEdit>false<\/allowEdit>/);
  assert.match(operator,/<allowDelete>false<\/allowDelete>/);
  assert.doesNotMatch(operator,/<editable>true<\/editable>/);
});

test('claim CALLING must be written with an execution fence before the only POST',()=>{
  assert.match(worker,/<name>Reserve_Dispatch<\/name>/);
  assert.match(worker,/<stringValue>CALLING<\/stringValue>/);
  assert.match(worker,/<name>Prepare_Dispatch_Fence<\/name>/);
  assert.match(worker,/<name>Check_Dispatch<\/name>/);
  assert.match(worker,/<name>f_DispatchOwned<\/name>/);
  assert.match(worker,/<elementReference>\$Flow\.InterviewGuid<\/elementReference>/);
  assert.match(worker,/<name>Get_Dispatch<\/name>/);
  for(const name of ['Save_Received','Save_Error','Save_Unknown','Save_Stale']) {
    const chunk=worker.match(new RegExp('<recordUpdates><name>'+name+'<\\/name>[\\s\\S]*?<\\/recordUpdates>'))?.[0];
    assert.ok(chunk,name+' must exist');
    assert.match(chunk,/<field>Fence__c<\/field>/);
    assert.match(chunk,/<stringValue>CALLING<\/stringValue>/);
  }
  assert.match(worker,/<name>Save_Stale_Before<\/name>/);
  // Metadata ordering checks cannot prove a database compare-and-swap.
  // The separate manual entrypoint plus unique claim reduces replay exposure;
  // provider/continuation exactly-once remains an independent review requirement.
});

test('granular Flow access grants parent runner only, not direct worker entry',()=>{
  for(const xml of [reserve,worker]) assert.match(xml,/<isAdditionalPermissionRequiredToRun>true<\/isAdditionalPermissionRequiredToRun>/);
  assert.match(runner,/<flow>WDE_Reserve_Foreground_Audio_QA<\/flow>/);
  assert.doesNotMatch(runner,/<flow>WDE_Run_Foreground_Audio_QA<\/flow>/);
  assert.match(runner,/<allowDelete>false<\/allowDelete>/);
  assert.match(operator,/<allowCreate>false<\/allowCreate>/);
});
