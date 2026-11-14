import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRequest,sanitizeResult,extractOutputText,safeErrorDiagnostic,classifyProviderError,pollExistingInteraction,validateInteractionId,validateInteractionStatus,buildAudioProbeRequest,sanitizeAudioProbeResult,AUDIO_PROBE} from '../scripts/wde-gemini-editorial-l1.mjs';

const IDs=['w1','w2','w3','w4','w5'];
function windows(status='AI_L1_PROPOSED') {
  return IDs.map(id=>({id,status,transitions:[],audible_evidence_summary:'audible detail',uncertainty:'low'}));
}

test('Interactions API request uses fixed Gemini 3.8 with agentic YouTube media, blind windows',()=>{
  const request=buildRequest();
  assert.equal(request.model,'gemini-3.8-flash');
  assert.equal(request.background,true);
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

test('background polling GET-only reuses one validated ID to completion',async()=>{
  const calls=[];
  let count=0;
  const fakeFetch=async(url,options)=>{
    calls.push({url,method:options.method});
    count++;
    return {ok:true,json:async()=>({id:'int_example_123',status:count===1?'in_progress':'completed',
      steps:[{type:'model_output',content:[{type:'text',text:'{}'}]}]})};
  };
  const result=await pollExistingInteraction({id:'int_example_123',headers:{},
    initial:{id:'int_example_123',status:'in_progress'},
    fetcher:fakeFetch,wait:async()=>{},maxPolls:3,intervalMs:0});
  assert.equal(result.status,'completed');
  assert.deepEqual(calls.map(x=>x.method),['GET','GET']);
  assert.ok(calls.every(x=>x.url.endsWith('/int_example_123')));
});

test('resume polling retrieves existing interaction without any inference POST',async()=>{
  const calls=[];
  const fakeFetch=async(url,options)=>{
    calls.push(options.method);
    return {ok:true,json:async()=>({id:'int_resume_123',status:'completed',steps:[]})};
  };
  const result=await pollExistingInteraction({id:'int_resume_123',headers:{},fetcher:fakeFetch,
    maxPolls:2,intervalMs:0});
  assert.equal(result.status,'completed');
  assert.deepEqual(calls,['GET']);
});

test('background poll is bounded and does not create a second inference',async()=>{
  let requests=0;
  const fakeFetch=async(url,options)=>{
    requests++;
    assert.equal(options.method,'GET');
    return {ok:true,json:async()=>({id:'int_pending_123',status:'in_progress'})};
  };
  await assert.rejects(pollExistingInteraction({id:'int_pending_123',headers:{},
    initial:{id:'int_pending_123',status:'in_progress'},
    fetcher:fakeFetch,wait:async()=>{},maxPolls:2,intervalMs:0}),/bounded polling/);
  assert.equal(requests,2);
});

test('reject unsafe resume IDs, mismatched provider ID and terminal states',async()=>{
  for(const bad of ['https://evil.test','../evil','x/y','', 'a'.repeat(200)]){
    assert.throws(()=>validateInteractionId(bad),/Invalid interaction ID/);
  }
  assert.throws(()=>validateInteractionStatus({status:'requires_action'}),/terminal state/);
  assert.throws(()=>validateInteractionStatus({status:'failed'}),/terminal state/);
  assert.throws(()=>validateInteractionStatus({status:'weird'}),/Unknown interaction status/);
  await assert.rejects(pollExistingInteraction({id:'int_safe_123',headers:{},
    initial:{id:'int_other_123',status:'completed'},maxPolls:0,intervalMs:0}),/ID mismatch/);
});

test('completed initial interaction does not poll',async()=>{
  const result=await pollExistingInteraction({id:'int_done_123',headers:{},
    initial:{id:'int_done_123',status:'completed'},maxPolls:0,intervalMs:0,
    fetcher:()=>{throw Error('must not call');}});
  assert.equal(result.status,'completed');
});

test('Proof of Audio Access uses fixed 26-second actual static clip, not agentic full video',()=>{
  const request=buildAudioProbeRequest();
  assert.equal(request.model,'gemini-3.8-flash');
  assert.equal(request.background,true);
  assert.deepEqual(AUDIO_PROBE,{start:857,end:883,range:'14:17-14:43'});
  assert.deepEqual(request.input[0],{
    type:'video',uri:'https://www.youtube.com/watch?v=4SPC0Ke1Eyg',
    processing:{type:'static',start_offset:'857s',end_offset:'883s'}
  });
  assert.match(request.input[1].text,/ACTUAL audible sound/);
  assert.doesNotMatch(request.input[1].text,/14:27|14:33|Groq|gold label/);
  assert.equal(Number.parseInt(request.input[0].processing.end_offset)-Number.parseInt(request.input[0].processing.start_offset),26);
  const wire=JSON.parse(JSON.stringify(request));
  assert.equal(typeof wire.input[0].processing.start_offset,'string');
  assert.equal(typeof wire.input[0].processing.end_offset,'string');
  assert.deepEqual([wire.input[0].processing.start_offset,wire.input[0].processing.end_offset],['857s','883s']);
});
test('Proof of Audio Access remains model-reported, not independently verified, with approval blocked',()=>{
  const result=sanitizeAudioProbeResult({media_access_status:'ACCESSIBLE',
    audio_observation:'SPEECH',background_audio:'NO_MUSIC',evidence_type:'AUDIO_SPECIFIC'});
  assert.equal(result.independently_verified_audio,false);
  assert.equal(result.media_access_status,'MODEL_REPORTED_ACCESSIBLE');
  assert.equal(result.evidence_type,'MODEL_REPORTED_AUDIO_SPECIFIC');
  assert.equal(result.autoapproval,'BLOCKED');
  assert.equal(result.editorial_status,'AI_L1_PROPOSED_NOT_GOLD');
  assert.equal(result.clip_end_seconds-result.clip_start_seconds,26);
});
test('audio unavailable, fabricated category, unverifiable claims and injected extra fields fail closed',()=>{
  const a={media_access_status:'UNAVAILABLE',audio_observation:'UNRESOLVED',
    background_audio:'UNRESOLVED',evidence_type:'UNVERIFIABLE'};
  assert.equal(sanitizeAudioProbeResult(a).media_access_status,'MODEL_REPORTED_UNAVAILABLE');
  assert.throws(()=>sanitizeAudioProbeResult({...a,audio_observation:'SINGING'}),/Unavailable/);
  assert.throws(()=>sanitizeAudioProbeResult({...a,evidence_type:'AUDIO_SPECIFIC'}),/Unavailable/);
  assert.throws(()=>sanitizeAudioProbeResult({...a,media_access_status:'ACCESSIBLE',
    audio_observation:'SINGING'}),/Unverifiable/);
  assert.throws(()=>sanitizeAudioProbeResult({...a,audio_observation:'FAKE'}),/Invalid audio observation/);
  assert.throws(()=>sanitizeAudioProbeResult({...a,raw_transcript:'SECRET'}),/schema/);
});
