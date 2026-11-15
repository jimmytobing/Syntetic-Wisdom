import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = (name) => readFileSync(new URL('../force-app/main/default/' + name,import.meta.url),'utf8');
test('Issue 54 QA release uses only a draft autolaunched Flow and never Apex',()=>{
  const flow=read('flows/WDE_QA_OAuth_Commit_Release.flow-meta.xml');
  assert.match(flow,/<processType>AutoLaunchedFlow<\/processType>/);
  assert.match(flow,/<status>Draft<\/status>/);
  assert.match(flow,/\$Permission.WDE_QA_Commit_Release/);
  assert.match(flow,/<stringValue>NeedsCommitReview<\/stringValue>/);
  assert.match(flow,/<stringValue>CommitApproved<\/stringValue>/);
  assert.match(flow,/<name>Create_Claim<\/name>/);
  assert.match(flow,/<name>Update_Batch<\/name>/);
  assert.match(flow,/<name>Commit_Claim<\/name>/);
  assert.doesNotMatch(flow,/<faultConnector>|<waits>|<screens>|<apexPluginCalls>/);
  const claim=read('objects/WDE_QA_Release__c/fields/Batch_Claim_Key__c.field-meta.xml');
  assert.match(claim,/<unique>true<\/unique>/);
  assert.match(claim,/<externalId>true<\/externalId>/);
});
test('QA principal permission is explicit and independent of generic Groq access',()=>{
  const ps=read('permissionsets/WDE_QA_OAuth_Commit.permissionset-meta.xml');
  assert.match(ps,/<name>WDE_QA_Commit_Release<\/name>/);
  assert.doesNotMatch(ps,/<allowDelete>true<\/allowDelete>|<modifyAllRecords>true<\/modifyAllRecords>/);
  const flow=read('flows/WDE_QA_OAuth_Commit_Release.flow-meta.xml');
  assert.match(flow,/<field>Authority_Reference__c<\/field>[\s\S]*?<elementReference>\$User.Id<\/elementReference>/);
});

test('QA permission must never enable direct REST update or claim creation bypassing Flow',()=>{
  const ps=read('permissionsets/WDE_QA_OAuth_Commit.permissionset-meta.xml');
  assert.doesNotMatch(ps,/<allowCreate>true<\/allowCreate>|<allowEdit>true<\/allowEdit>|<editable>true<\/editable>/);
  assert.match(ps,/<name>WDE_QA_Commit_Release<\/name>/);
  assert.match(read('flows/WDE_QA_OAuth_Commit_Release.flow-meta.xml'),/<runInMode>SystemModeWithSharing<\/runInMode>/);
});
test('Committed QA journal fails closed unless exact user updated approved Batch',()=>{
  const xml=read('objects/WDE_QA_Release__c/validationRules/Require_Actual_QA_Commit.validationRule-meta.xml');
  assert.match(xml,/<active>true<\/active>/);
  assert.match(xml,/Batch_Run__r.LastModifiedById/);
  assert.match(xml,/CommitApproved/);
});

test('QA release remains fail-closed until trusted in-Flow verifier is configured',()=>{
  const flow=read('flows/WDE_QA_OAuth_Commit_Release.flow-meta.xml');
  const auth=flow.match(/<name>f_RequestAuthorized<\/name>[\s\S]*?<\/formulas>/)?.[0];
  assert.ok(auth,'Authorization formula must exist');
  assert.match(auth,/\$Permission.WDE_QA_Commit_Release/);
  assert.match(auth,/\bFALSE\s*,/,'No direct OAuth invocation may release without cryptographic verification inside Flow');
  assert.match(flow,/<status>Draft<\/status>/);
});
