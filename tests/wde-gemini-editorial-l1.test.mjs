import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRequest,sanitizeResult,extractOutputText,safeErrorDiagnostic,classifyProviderError} from '../scripts/wde-gemini-editorial-l1.mjs';

const IDs=['w1','w2','w3','w4','w5'];
function windows(status='AI_L1_PROPOSED') {
  return IDs.map(id=>({id,status,transitions:[],audible_evidence_summary:'audible detail',uncertainty:'low'}));
}

test('Interactions API request uses fixed Gemini 3.8 with agentic YouTube media, blind windows',()=>{
  const request=buildRequest();
  assert.equal(request.model,'gemini-3.8-flash');
  assert.deepEqual(request.input[0],{
    type:'video',uri:'https://www.youtube.com/watch?v=4SPC0Ke1Eyg',processing:'agentic'
  });
  assert.equal(request.input[1].type,'text');
  const prompt=request.input[1].text;
  assert.match(prompt,/14:17-14:43/);
  assert.match(prompt,/67:04-67:28/);
  assert.doesNotMatch(prompt,/186\/187|193\/194|1712\/1713|Groq/);
  assert.equal(request.contents,undefined);
  assert.equal(request.generationConfig,undefined);
});

test('Interactions output extraction accepts model_output steps only',()=>{
  const response={id:'int_test123',status:'completed',steps:[
    {type:'user_input',content:[{type:'text',text:'NOT_MODEL_OUTPUT'}]},
    {type:'model_output',content:[{type:'text',text:'{"media_access_status":'}]},
    {type:'model_output',content:[{type:'text',text:'"UNAVAILABLE"}'}]}
  ]};
  const output=extractOutputText(response);
  assert.doesNotMatch(output,/NOT_MODEL_OUTPUT/);
  assert.equal(JSON.parse(output).media_access_status,'UNAVAILABLE');
  assert.throws(()=>extractOutputText({status:'failed',steps:[]}),/failed status/);
  assert.throws(()=>extractOutputText({status:'completed',steps:[]}),/no model output/);
});

test('five-window proposal always remains non-approved and model-reported',()=>{
  const result=sanitizeResult({media_access_status:'ACCESSIBLE',windows:windows()});
  assert.equal(result.editorial_status,'AI_L1_PROPOSED_NOT_GOLD');
  assert.equal(result.model,'gemini-3.8-flash');
  assert.equal(result.windows.length,5);
  assert.equal(result.media_access_status,'MODEL_REPORTED_ACCESSIBLE');
});

test('media unavailable must be unresolved without transitions',()=>{
  assert.throws(()=>sanitizeResult({media_access_status:'UNAVAILABLE',windows:windows()}),/Unavailable/);
  const good=sanitizeResult({media_access_status:'UNAVAILABLE',windows:windows('UNRESOLVED')});
  assert.equal(good.media_access_status,'MODEL_REPORTED_UNAVAILABLE');
});

test('rejects fake category, duplicates and wrong length',()=>{
  const a=windows();
  a[0].transitions=[{time:'14:27',before:'Fake',after:'Worship',reason:'x'}];
  assert.throws(()=>sanitizeResult({media_access_status:'ACCESSIBLE',windows:a}),/Invalid transition/);
  assert.throws(()=>sanitizeResult({media_access_status:'ACCESSIBLE',windows:a.slice(1)}),/Unexpected/);
  const dup=windows();
  dup[1].id='w1';
  assert.throws(()=>sanitizeResult({media_access_status:'ACCESSIBLE',windows:dup}),/duplicate/);
});

test('HTTP 503 diagnostics classify provider status without exposing raw message',()=>{
  const secret='AIzaSUPER_SECRET_KEY_SHOULD_NEVER_LEAK';
  const raw='The model is overloaded for video '+secret+' https://private.example.com/?token=123';
  const result=safeErrorDiagnostic(503,{error:{status:'UNAVAILABLE',code:503,message:raw}},'12');
  assert.deepEqual(result,{http_status:503,provider_status:'UNAVAILABLE',provider_code:503,
    reason_class:'CAPACITY_OR_TEMPORARY_UNAVAILABLE',retry_after_seconds:12});
  assert.doesNotMatch(JSON.stringify(result),/SUPER_SECRET|private\\.example|token=123|overloaded for video/);
});
test('unexpected provider text is not logged and invalid status is discarded',()=>{
  const suspicious='<script>email@example.com KEY:SUPERSECRET</script>';
  const result=safeErrorDiagnostic(503,{error:{status:suspicious,code:503,message:suspicious}},'Sun, 14 Nov 2026 01:00:00 GMT');
  assert.equal(result.provider_status,'UNKNOWN');
  assert.equal(result.reason_class,'UNCLASSIFIED');
  assert.equal(result.retry_after_seconds,null);
  assert.doesNotMatch(JSON.stringify(result),/SUPERSECRET|email@example/);
});
test('diagnostics classify failure modes and bound retry header',()=>{
  assert.equal(classifyProviderError('YouTube video processing failed'),'VIDEO_ACCESS_OR_PROCESSING');
  assert.equal(classifyProviderError('Resource exhausted due to quota'),'QUOTA_OR_RATE_LIMIT');
  assert.equal(classifyProviderError('Deadline exceeded'),'PROVIDER_TIMEOUT');
  assert.equal(safeErrorDiagnostic(503,{},'99999').retry_after_seconds,3600);
  assert.equal(safeErrorDiagnostic(503,{},'12.5').retry_after_seconds,null);
});
