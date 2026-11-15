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
