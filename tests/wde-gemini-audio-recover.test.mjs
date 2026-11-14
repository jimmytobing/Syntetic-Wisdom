import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAudioRecoverIssue,verifyAudioRecoverEvent,validateAudioReceipt,
  claimRecover,retrieveExistingAudio} from '../scripts/wde-gemini-audio-recover.mjs';
const fence=String.fromCharCode(96).repeat(3);
const request={operation:'gemini.audio_recover',sourceRunId:43552315195,
  requestId:'wde35-20261114-006'};
const issueBody=(r=request)=>['## Context','### WDE Request',fence+'json',
  JSON.stringify(r),fence].join('\n');
const receipt={interaction_id:'v1_existing_12345',model:'gemini-3.8-flash',
  source:'WDE_ISSUE_35',mode:'audio_probe',editorial_status:'BLOCKED'};

test('only pinned source run and strict generic Issue header accepted',()=>{
  assert.deepEqual(parseAudioRecoverIssue(issueBody()),request);
  assert.throws(()=>parseAudioRecoverIssue(issueBody({...request,sourceRunId:43545052586})),
    /Only existing audio probe/);
  assert.throws(()=>parseAudioRecoverIssue(issueBody({...request,operation:'shell.exec'})),
    /Only existing audio probe/);
  assert.throws(()=>parseAudioRecoverIssue(issueBody({...request,custom:'x'})),
    /Unexpected request fields/);
  assert.throws(()=>parseAudioRecoverIssue(issueBody()+'\n### WDE Request'),
    /Exactly one WDE Request/);
});

test('trusted repo/main actor and canonical Issue #35 author only',()=>{
  const env={GITHUB_REPOSITORY:'jimmytobing/Syntetic-Wisdom',GITHUB_REF:'refs/heads/main',
    GITHUB_ACTOR:'jimmytobing',GITHUB_EVENT_NAME:'issues'};
  const ev={action:'edited',issue:{number:35,user:{login:'jimmytobing'},body:issueBody()}};
  assert.deepEqual(verifyAudioRecoverEvent(ev,env),request);
  assert.throws(()=>verifyAudioRecoverEvent(ev,{...env,GITHUB_ACTOR:'unknown'}),/Untrusted run/);
  assert.throws(()=>verifyAudioRecoverEvent({...ev,issue:{...ev.issue,number:36}},env),
    /Untrusted Issue/);
});

test('receipt validation rejects incompatible source and unsafe identifiers',()=>{
  assert.equal(validateAudioReceipt(receipt),'v1_existing_12345');
  assert.throws(()=>validateAudioReceipt({...receipt,mode:'editorial'}),/Wrong receipt/);
  assert.throws(()=>validateAudioReceipt({...receipt,interaction_id:'../../wrong'}),/Invalid interaction ID/);
});

test('one GET recovers fenced JSON, never POST or gold approval',async()=>{
  const calls=[];
  const response={media_access_status:'ACCESSIBLE',audio_observation:'SPEECH',
    background_audio:'NO_MUSIC',evidence_type:'AUDIO_SPECIFIC'};
  const payload=fence+'json\n'+JSON.stringify(response)+'\n'+fence;
  const fetcher=async(url,opts)=>{
    calls.push({url,method:opts.method});
    return {ok:true,status:200,json:async()=>({
      id:receipt.interaction_id,status:'completed',
      steps:[{type:'model_output',content:[{type:'text',text:payload}]}]})};
  };
  const result=await retrieveExistingAudio({receipt,key:'FAKE_KEY_1234567890',fetcher});
  assert.deepEqual(calls.map(x=>x.method),['GET']);
  assert.ok(calls[0].url.endsWith('/v1_existing_12345'));
  assert.equal(result.audio_observation,'SPEECH');
  assert.equal(result.independently_verified_audio,false);
  assert.equal(result.autoapproval,'BLOCKED');
  assert.equal(result.interaction_reference,'REDACTED');
});
test('incomplete interaction and unavailable media fail closed',async()=>{
  const fetcher=async()=>({ok:true,status:200,json:async()=>({
    id:receipt.interaction_id,status:'failed',steps:[]})});
  await assert.rejects(retrieveExistingAudio({receipt,key:'FAKE_KEY_1234567890',fetcher}),
    /not completed/);
});
test('duplicate request ID blocked without creating a new claim',async()=>{
  const calls=[];
  const marker='<!-- WDE_GEMINI_AUDIO_RECOVER:wde35-20261114-006 -->';
  const fetcher=async(url,opts)=>{
    calls.push(opts.method);
    return {ok:true,json:async()=>[{body:marker}]};
  };
  await assert.rejects(claimRecover(request,{token:'FAKE_GITHUB_TOKEN_123456',fetcher}),
    /Duplicate recovery/);
  assert.deepEqual(calls,['GET']);
});
