import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(resolve(root, p), 'utf8');
const flow = read('force-app/main/default/flows/WDE_Test_Gemini_Video_30s.flow-meta.xml');
const manifest = read('manifest/wde-gemini-video-30s-pilot-62.xml');
test('media pilot is manual, draft, one-call, and never writes Salesforce data', () => {
  assert.match(flow, /<status>Draft<\/status>/);
  assert.match(flow, /<processType>AutoLaunchedFlow<\/processType>/);
  assert.equal((flow.match(/<actionCalls>/g) || []).length, 1);
  assert.match(flow, /<actionName>WDEGeminiVideo\.analyzeVideo<\/actionName>/);
  assert.doesNotMatch(flow, /<recordUpdates>|<recordCreates>|<recordDeletes>|<recordLookups>|<scheduledPaths>|<subflows>|<triggerType>/);
  assert.doesNotMatch(flow, /Audio_QA_Status__c|CORRECTED_TRANSCRIPT|<isInput>true<\/isInput>/);
});
test('media bounds and consented source are static and one-shot', () => {
  assert.match(flow, /watch\?v=KeA9Xr9KzUI/);
  assert.match(flow, /<stringValue>2288s<\/stringValue>/);
  assert.match(flow, /<stringValue>2318s<\/stringValue>/);
  assert.match(flow, /varA_VideoPart\.videox5fmetadata\.startx5foffset/);
  assert.match(flow, /varA_VideoPart\.videox5fmetadata\.endx5foffset/);
  assert.match(flow, /MEDIA_PILOT_FAULT_DO_NOT_REPLAY/);
  assert.match(flow, /<numberValue>1024<\/numberValue>/);
  assert.doesNotMatch(flow, /background|store|AIza[A-Za-z0-9_-]{12,}/);
});
test('manifest deploys only this pilot', () => {
  assert.match(manifest, /<members>WDE_Test_Gemini_Video_30s<\/members>/);
  assert.match(manifest, /<name>Flow<\/name>/);
  assert.doesNotMatch(manifest, /PermissionSet|CustomObject|destructiveChanges/);
});
