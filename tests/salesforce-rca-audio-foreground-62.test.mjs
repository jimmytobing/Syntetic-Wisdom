import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(resolve(root, p), 'utf8');
const xml = read('force-app/main/default/flows/WDE_Test_Gemini_Foreground_Text.flow-meta.xml');
const manifest = read('manifest/wde-gemini-foreground-text-diagnostic-62.xml');
const external = read('force-app/main/default/externalServiceRegistrations/WDEGeminiVideo.externalServiceRegistration-meta.xml');

test('foreground diagnostic stays inactive, manually invoked, and isolated from QA record writes', () => {
  assert.match(xml, /<status>Draft<\/status>/);
  assert.match(xml, /<processType>AutoLaunchedFlow<\/processType>/);
  assert.equal((xml.match(/<actionCalls>/g) || []).length, 1);
  assert.match(xml, /<actionName>WDEGeminiVideo\.analyzeVideo<\/actionName>/);
  assert.doesNotMatch(xml, /<recordCreates>|<recordUpdates>|<recordDeletes>|<recordLookups>|<triggerType>|<scheduledPaths>|<subflows>/);
  assert.doesNotMatch(xml, /WDE_Start_Segment_Audio_Async_QA|Sermon_Segment__c|Audio_QA_Status__c/);
});
test('foreground diagnostic has only bounded fixed text, no media, secrets, or automated retry', () => {
  assert.match(xml, /Balas persis TEST_OK/);
  assert.match(xml, /<numberValue>1024<\/numberValue>/);
  assert.match(xml, /<stringValue>TEST_OK<\/stringValue>/);
  assert.match(xml, /FOREGROUND_DIAGNOSTIC_FAULT_DO_NOT_REPLAY/);
  assert.match(xml, /FOREGROUND_DIAGNOSTIC_NO_CONFIRMED_RESULT_DO_NOT_REPLAY/);
  assert.doesNotMatch(xml, /filex5furi|startx5foffset|endx5foffset|video_metadata|background|store|AIza[A-Za-z0-9_-]{12,}/);
});
test('manifest contains only the isolated diagnostic Flow, and existing credential is reused', () => {
  assert.match(manifest, /<members>WDE_Test_Gemini_Foreground_Text<\/members>/);
  assert.match(manifest, /<name>Flow<\/name>/);
  assert.doesNotMatch(manifest, /ApexClass|destructiveChanges|CustomObject|PermissionSet/);
  assert.match(external, /<namedCredentialReference>GeminiNmCred<\/namedCredentialReference>/);
  assert.match(external, /gemini-3\.6-flash:generateContent/);
});
