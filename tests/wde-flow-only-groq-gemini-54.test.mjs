import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const file=p=>readFileSync(resolve(root,p),'utf8');
const flows='force-app/main/default/flows/';
test('Groq Stage B success with nonempty enrichment automatically advances to Stage C',()=>{
 const xml=file(flows+'WDE_Orchestrate_Stage_B.flow-meta.xml');
 const match=xml.match(/<name>B_Success<\/name>[\s\S]*?<\/rules>/)?.[0];
 assert.ok(match);
 assert.match(match,/<leftValueReference>bLines<\/leftValueReference>/);
 assert.match(match,/<targetReference>Set_B_Review<\/targetReference>/);
 const update=xml.match(/<name>Set_B_Review<\/name>[\s\S]*?<\/recordUpdates>/)?.[0];
 assert.ok(update);
 assert.match(update,/<stringValue>CommitApproved<\/stringValue>/);
 assert.doesNotMatch(update,/<stringValue>NeedsCommitReview<\/stringValue>/);
});
test('Existing held Batch can resume Stage C through bounded Flow transition',()=>{
 const xml=file(flows+'WDE_Auto_Advance_Batch.flow-meta.xml');
 assert.match(xml,/<name>Save_Validated_Enrichment<\/name>/);
 assert.match(xml,/<stringValue>NeedsCommitReview<\/stringValue>/);
 assert.match(xml,/<stringValue>CommitApproved<\/stringValue>/);
});
test('Gemini audio trigger is conditional on explicit need and retries remain bounded',()=>{
 const xml=file(flows+'Tgr_WDE_Auto_Segment_Audio_QA.flow-meta.xml');
 assert.match(xml,/<field>Audio_QA_Required__c<\/field><operator>EqualTo<\/operator><value><booleanValue>true<\/booleanValue>/);
 assert.match(xml,/<field>Audio_QA_Required__c<\/field><operator>IsChanged<\/operator><value><booleanValue>true<\/booleanValue>/);
 assert.match(xml,/1 AND \(2 OR 3\) AND 4 AND 7 AND \(5 OR 6 OR 8\)/);
 assert.match(xml,/<numberValue>3<\/numberValue>/);
 assert.match(file('force-app/main/default/objects/Sermon_Segment__c/fields/Audio_QA_Required__c.field-meta.xml'),/<defaultValue>false<\/defaultValue>/);
});
test('No OAuth QA release workflow, HMAC runner, or Apex required',()=>{
 for(const p of ['.github/workflows/wde-qa-oauth-release.yml',
                  'scripts/wde-qa-oauth-release.mjs',
                  'scripts/wde-independent-qa-receipt.mjs']) {
  assert.equal(existsSync(resolve(root,p)),false,p);
 }
 const pkg=file('manifest/wde-flow-only-groq-gemini-54.xml');
 assert.doesNotMatch(pkg,/<name>ApexClass<\/name>/);
 assert.match(pkg,/<members>WDE_Orchestrate_Stage_B<\/members>/);
});

test('material segment edits automatically opt in to Gemini audio re-verification',()=>{
 const xml=file(flows+'Tgr_WDE_Reset_Segment_Audio_QA.flow-meta.xml');
 const update=xml.match(/<name>Reset_Audio_QA<\/name>[\s\S]*?<\/assignments>/)?.[0];
 assert.ok(update,'reset assignment is present');
 assert.match(update,/<assignToReference>\$Record.Audio_QA_Required__c<\/assignToReference>[\s\S]*?<booleanValue>true<\/booleanValue>/);
 assert.match(update,/<assignToReference>\$Record.Audio_QA_Status__c<\/assignToReference>[\s\S]*?<stringValue>PENDING<\/stringValue>/);
 assert.match(xml,/<name>Check_Material_Change<\/name>/);
 assert.match(file('manifest/wde-flow-only-groq-gemini-54.xml'),/<members>Tgr_WDE_Reset_Segment_Audio_QA<\/members>/);
});
