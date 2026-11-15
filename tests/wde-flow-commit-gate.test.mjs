import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = new URL('../force-app/main/default/', import.meta.url);
const load = (file) => readFileSync(new URL(file, root), 'utf8');
const block = (xml, tag, name) => {
  const start = xml.indexOf('<name>' + name + '</name>');
  if (start < 0) throw Error('METADATA_ELEMENT_MISSING: ' + name);
  const end = xml.indexOf('</' + tag + '>', start);
  if (end < 0) throw Error('METADATA_ELEMENT_INVALID: ' + name);
  return xml.slice(start, end);
};

test('Stage B holds successful enrichment for independent editorial review', () => {
  // Issue #53: the thin trigger delegates all business DML to this orchestrator.
  const trigger = load('flows/Tgr_WDE_Run_Stage_B.flow-meta.xml');
  const xml = load('flows/WDE_Orchestrate_Stage_B.flow-meta.xml');
  assert.match(trigger, /<flowName>WDE_Orchestrate_Stage_B<\/flowName>/);
  const update = block(xml, 'recordUpdates', 'Set_B_Review');
  assert.match(update, /<field>Approved_Enrichment__c<\/field>/);
  assert.match(update, /<field>Status__c<\/field>[\s\S]*?<stringValue>NeedsCommitReview<\/stringValue>/);
  assert.doesNotMatch(update, /<stringValue>CommitApproved<\/stringValue>/);
});

test('NeedsCommitReview is an actual WDE_Batch_Run status', () => {
  const field = load('objects/WDE_Batch_Run__c/fields/Status__c.field-meta.xml');
  assert.match(field, /<fullName>NeedsCommitReview<\/fullName>/);
});

test('Stage C remains gated by CommitApproved and cannot auto-persist the held batch', () => {
  const trigger = load('flows/Tgr_WDE_Run_Stage_C.flow-meta.xml');
  const xml = load('flows/WDE_Orchestrate_Stage_C.flow-meta.xml');
  assert.match(trigger, /<flowName>WDE_Orchestrate_Stage_C<\/flowName>/);
  assert.match(trigger, /<stringValue>CommitApproved<\/stringValue>/);
  assert.match(xml, /<stringValue>CommitApproved<\/stringValue>/);
  assert.match(xml, /<name>varCommitRecords<\/name>[\s\S]*?<booleanValue>true<\/booleanValue>/);
});

test('Stage C still requires a separately reviewed transition before persisting', () => {
  const b = load('flows/WDE_Orchestrate_Stage_B.flow-meta.xml');
  const c = load('flows/WDE_Orchestrate_Stage_C.flow-meta.xml');
  assert.doesNotMatch(block(b, 'recordUpdates', 'Set_B_Review'), /<stringValue>CommitApproved<\/stringValue>/);
  assert.match(c, /<stringValue>CommitApproved<\/stringValue>/);
});

test('legacy auto advance cannot bypass signed independent QA approval', () => {
  const xml = load('flows/WDE_Auto_Advance_Batch.flow-meta.xml');
  const a = block(xml, 'recordUpdates', 'Save_Validated_Boundaries');
  assert.match(a, /<field>Status__c<\/field>[\s\S]*?<stringValue>BoundariesApproved<\/stringValue>/);
  assert.doesNotMatch(a, /<field>Approved_Enrichment__c<\/field>/);
  assert.doesNotMatch(xml, /<stringValue>CommitApproved<\/stringValue>/);
  assert.match(xml, /<name>Hold_For_Independent_QA<\/name>/);
  assert.match(xml, /<name>Advance_B<\/name>[\s\S]*?<targetReference>Hold_For_Independent_QA<\/targetReference>/);
});

test('Stage B to Stage C requires an explicit independent release', () => {
  const b = load('flows/WDE_Orchestrate_Stage_B.flow-meta.xml');
  const c = load('flows/WDE_Orchestrate_Stage_C.flow-meta.xml');
  const reviewUpdate = block(b, 'recordUpdates', 'Set_B_Review');
  assert.match(reviewUpdate, /<stringValue>NeedsCommitReview<\/stringValue>/);
  assert.doesNotMatch(reviewUpdate, /<stringValue>CommitApproved<\/stringValue>/);
  assert.match(c, /<name>Ready_For_C<\/name>[\s\S]*?<stringValue>CommitApproved<\/stringValue>/);
});
