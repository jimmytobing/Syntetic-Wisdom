import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRequest,sanitizeResult} from '../scripts/wde-gemini-editorial-l1.mjs';

test('single fixed YouTube media part and blind question',()=>{
  const request=buildRequest();
  assert.equal(request.contents[0].parts[0].file_data.file_uri,'https://www.youtube.com/watch?v=4SPC0Ke1Eyg');
  const prompt=request.contents[0].parts[1].text;
  assert.match(prompt,/14:17-14:43/);
  assert.match(prompt,/67:04-67:28/);
  assert.doesNotMatch(prompt,/186\/187|193\/194|1712\/1713|Groq/);
  assert.equal(request.generationConfig.responseMimeType,'application/json');
});

test('valid five-window proposal sanitized and always non-approved',()=>{
  const windows=['w1','w2','w3','w4','w5'].map(id=>({id,status:'AI_L1_PROPOSED',transitions:[],audible_evidence_summary:'audible detail',uncertainty:'low'}));
  const result=sanitizeResult({media_access_status:'ACCESSIBLE',windows});
  assert.equal(result.editorial_status,'AI_L1_PROPOSED_NOT_GOLD');
  assert.equal(result.windows.length,5);
  assert.equal(result.media_access_status,'MODEL_REPORTED_ACCESSIBLE');
});

test('missing media requires unresolved windows',()=>{
  const windows=['w1','w2','w3','w4','w5'].map(id=>({id,status:'AI_L1_PROPOSED',transitions:[]}));
  assert.throws(()=>sanitizeResult({media_access_status:'UNAVAILABLE',windows}),/Unavailable/);
});

test('rejects fake category and incorrect window count',()=>{
  const windows=['w1','w2','w3','w4','w5'].map(id=>({id,status:'AI_L1_PROPOSED',transitions:[]}));
  windows[0].transitions=[{time:'14:27',before:'Fake',after:'Worship',reason:'x'}];
  assert.throws(()=>sanitizeResult({media_access_status:'ACCESSIBLE',windows}),/Invalid transition/);
  assert.throws(()=>sanitizeResult({media_access_status:'ACCESSIBLE',windows:windows.slice(1)}),/Unexpected/);
});
