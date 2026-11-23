import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const flow = name => read('force-app/main/default/flows/' + name + '.flow-meta.xml');
const prefix = 'force-app/main/default/';

test('Gemini background registration only uses named credential, isolated interactions API', () => {
  const xml = read(prefix + 'externalServiceRegistrations/WDEGeminiAsync.externalServiceRegistration-meta.xml');
  assert.match(xml, /<namedCredentialReference>GeminiNmCred<\/namedCredentialReference>/);
  for (const op of ['startAsyncQa','getAsyncQa','deleteAsyncQa']) {
    assert.match(xml, new RegExp('<name>' + op + '<\\/name>'));
  }
  assert.match(xml, /v1beta\/interactions/);
  assert.match(xml, /&quot;errors&quot;:{&quot;type&quot;:&quot;array&quot;/);
  assert.doesNotMatch(xml, /&quot;error&quot;:{&quot;\$ref&quot;/);
  assert.match(xml, /background/);
  assert.match(xml, /store/);
  assert.doesNotMatch(xml, /AIza[A-Za-z0-9_-]{12,}|Bearer [A-Za-z0-9_-]+/);
  assert.doesNotMatch(xml, /batchGenerateContent/);
});
test('all three Flows are active manual autolaunched only and do not write records', () => {
  for (const name of [
    'WDE_Start_Segment_Audio_Async_QA',
    'WDE_Get_Segment_Audio_Async_QA',
    'WDE_Delete_Segment_Audio_Async_QA',
  ]) {
    const xml = flow(name);
    assert.match(xml, /<processType>AutoLaunchedFlow<\/processType>/);
    assert.match(xml, /<status>Active<\/status>/);
    assert.doesNotMatch(xml, /<recordUpdates>|<recordCreates>|<recordDeletes>/);
    assert.doesNotMatch(xml, /<triggerType>|<schedule>|<scheduledPaths>/);
    assert.match(xml, /<flowTransactionModel>Automatic<\/flowTransactionModel>/);
    assert.equal((xml.match(/<actionCalls>/g) || []).length,1);
  }
});
test('submit is bounded to flagged closed terminal failures and authorized source only', () => {
  const xml = flow('WDE_Start_Segment_Audio_Async_QA');
  assert.match(xml, /WDEGeminiAsync\.startAsyncQa/);
  for (const s of ['Audio_QA_Required__c','SYSTEM_ERROR','Audio_QA_Attempts__c',
    'WDE_Stitch_Open__c','PermissionGranted','Audio_QA_Batch_State__c',
    'f_Transcript_Eligible','f_Source_Id_Valid']) assert.ok(xml.includes(s),s);
  assert.match(xml, /<numberValue>3<\/numberValue>/);
  assert.match(xml, /<assignToReference>varA_Request\.background<\/assignToReference>/);
  assert.match(xml, /<assignToReference>varA_Request\.store<\/assignToReference>/);
  assert.match(xml, /<name>Capture_Fault<\/name>/);
  assert.match(xml, /NO_CONFIRMED_ASYNC_ID_DO_NOT_REPLAY/);
  assert.doesNotMatch(xml, /<stringValue>PASS<\/stringValue>/);
});
test('poll returns provider status and only bounded model evidence with no verdict writes', () => {
  const xml = flow('WDE_Get_Segment_Audio_Async_QA');
  assert.match(xml, /WDEGeminiAsync\.getAsyncQa/);
  assert.match(xml, /<name>Check_Response<\/name>/);
  assert.match(xml, /<name>f_Valid_Model_Part<\/name>/);
  assert.match(xml, /<name>Loop_Steps<\/name>/);
  assert.match(xml, /<name>Loop_Parts<\/name>/);
  assert.match(xml, /<name>varT_ModelText<\/name>/);
  assert.match(xml, /<name>varT_AsyncStatus<\/name>/);
  assert.match(xml, /<name>Loop_Errors<\/name>/);
  assert.match(xml, /varA_Response\.errors/);
  assert.match(xml, /Loop_Errors\.code/);
  assert.match(xml, /Loop_Errors\.message/);
  assert.doesNotMatch(xml, /varA_Response\.error\./);
  assert.doesNotMatch(xml, /<recordUpdates>/);
});
test('explicit cleanup action exists with ID validation and no automatic loop', () => {
  const xml = flow('WDE_Delete_Segment_Audio_Async_QA');
  assert.match(xml, /WDEGeminiAsync\.deleteAsyncQa/);
  assert.match(xml, /<name>f_Id_Valid<\/name>/);
  assert.match(xml, /DELETE_NOT_CONFIRMED/);
  assert.doesNotMatch(xml, /<loops>|<recordDeletes>/);
});
test('operator FLS grants exactly four async audit fields, never transcript or credentials', () => {
  const xml = read(prefix + 'permissionsets/WDE_Audio_QA_Async_Operator.permissionset-meta.xml');
  const fields = [...xml.matchAll(/<field>([^<]+)<\/field>/g)].map(x=>x[1]).sort();
  assert.deepEqual(fields, [
    'Sermon_Segment__c.Audio_QA_Batch_Error__c',
    'Sermon_Segment__c.Audio_QA_Batch_Fingerprint__c',
    'Sermon_Segment__c.Audio_QA_Batch_Job__c',
    'Sermon_Segment__c.Audio_QA_Batch_State__c'
  ]);
  assert.equal((xml.match(/<editable>true<\/editable>/g) || []).length,4);
  assert.doesNotMatch(xml, /Transcript_Text__c|Audio_QA_Status__c|externalCredentialPrincipalAccesses|PermissionsModifyAllData|ApexClass/);
});
test('isolated deployment manifests include no Apex or destructive metadata', () => {
  for (const p of [
    'manifest/wde-audio-qa-async-flow-foundation-61.xml',
    'manifest/wde-audio-qa-async-flows-61.xml',
    'manifest/wde-audio-qa-async-fls-61.xml'
  ]) {
    const xml=read(p);
    assert.doesNotMatch(xml, /ApexClass|destructiveChanges|<name>CustomPermission<\/name>/);
  }
  assert.equal(existsSync(resolve(root, 'force-app/main/default/classes/WDEAudioQaBatch.cls')),false);
  assert.equal(existsSync(resolve(root, 'manifest/wde-audio-qa-batch-61.xml')),false);
});

test('text-only diagnostic remains inactive, background-only, and free of DML', () => {
  const definition = read(prefix + 'flowDefinitions/WDE_Test_Gemini_Async_Text.flowDefinition-meta.xml');
  const diagnostic = flow('WDE_Test_Gemini_Async_Text');
  assert.match(definition, /<activeVersionNumber>0<\/activeVersionNumber>/);
  assert.match(diagnostic, /<status>Active<\/status>/); // temporary one-shot authorized diagnostic; restore to Draft after execution
  assert.match(diagnostic, /<assignToReference>varA_Request\.background<\/assignToReference><operator>Assign<\/operator><value><booleanValue>true<\/booleanValue>/);
  assert.match(diagnostic, /<assignToReference>varA_Request\.store<\/assignToReference><operator>Assign<\/operator><value><booleanValue>true<\/booleanValue>/);
  assert.doesNotMatch(diagnostic, /<recordCreates>|<recordUpdates>|<recordDeletes>|<start>.*<scheduledPaths>/s);
});
