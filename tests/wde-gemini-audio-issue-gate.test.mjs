import test from 'node:test';
import assert from 'node:assert/strict';
import {parseIssueAudioProbe,verifyAudioProbeEvent,claimAudioProbeRequest}
  from '../.github/mjs/wde-gemini-audio-issue-gate.mjs';

const fence=String.fromCharCode(96).repeat(3);
const req={operation:'gemini.audio_probe',testMode:'audio_probe',
  requestId:'wde35-20261114-004',freeTierAck:'FREE_TIER_CONFIRMED',
  rightsAck:'REVIEW_PERMITTED'};
const body=(r=req)=>'Context\n### WDE Request\n'+fence+'json\n'+
  JSON.stringify(r)+'\n'+fence+'\n';
const env={GITHUB_REPOSITORY:'jimmytobing/Syntetic-Wisdom',
  GITHUB_REF:'refs/heads/main',GITHUB_ACTOR:'jimmytobing',
  GITHUB_EVENT_NAME:'issues'};
const event=(r=req)=>({action:'edited',issue:{number:35,
  user:{login:'jimmytobing'},body:body(r)}});

test('strict generic Issue heading accepts one fixed 26s audio probe, not arbitrary commands',()=>{
  assert.deepEqual(parseIssueAudioProbe(body()),{requestId:req.requestId});
  assert.throws(()=>parseIssueAudioProbe(body({...req,operation:'shell.exec'})),/only the fixed/);
  assert.throws(()=>parseIssueAudioProbe(body({...req,testMode:'editorial'})),/only the fixed/);
  assert.throws(()=>parseIssueAudioProbe(body({...req,arbitraryUrl:'https://evil'})),/Unexpected/);
  assert.throws(()=>parseIssueAudioProbe(body()+'\n### WDE Request'),/Exactly one/);
});
test('fresh Free Tier and media rights attestations are mandatory in the Issue payload',()=>{
  assert.throws(()=>parseIssueAudioProbe(body({...req,freeTierAck:'NOT_CONFIRMED'})),/acknowledgements/);
  assert.throws(()=>parseIssueAudioProbe(body({...req,rightsAck:'UNKNOWN'})),/acknowledgements/);
  assert.throws(()=>parseIssueAudioProbe(body({...req,requestId:'bad'})),/Invalid requestId/);
});
test('verify original author, trusted editor, main branch and exact issue number',()=>{
  assert.deepEqual(verifyAudioProbeEvent(event(),env),{
    source:'issue',mode:'audio_probe',resume:'',requestId:req.requestId});
  assert.throws(()=>verifyAudioProbeEvent(event(),{...env,GITHUB_ACTOR:'stranger'}),/Untrusted/);
  assert.throws(()=>verifyAudioProbeEvent(event(),{...env,GITHUB_REF:'refs/heads/dev'}),/Invalid repository/);
  assert.throws(()=>verifyAudioProbeEvent({...event(),issue:{...event().issue,number:36}},env),/Untrusted Issue/);
  assert.throws(()=>verifyAudioProbeEvent({...event(),action:'opened'},env),/Untrusted Issue/);
});
test('manual workflow_dispatch remains supported with explicit attestations',()=>{
  const manual={...env,GITHUB_EVENT_NAME:'workflow_dispatch',
    INPUT_FREE_TIER_ACK:'FREE_TIER_CONFIRMED',INPUT_RIGHTS_ACK:'REVIEW_PERMITTED',
    INPUT_TEST_MODE:'audio_probe',INPUT_RESUME_INTERACTION_ID:''};
  assert.equal(verifyAudioProbeEvent({},manual).source,'manual');
  assert.throws(()=>verifyAudioProbeEvent({}, {...manual,INPUT_RIGHTS_ACK:'NO'}),/acknowledgement/);
  assert.throws(()=>verifyAudioProbeEvent({}, {...manual,INPUT_RESUME_INTERACTION_ID:'../'}),/Invalid manual resume ID/);
});
test('issue claim posts only once after checking existing comments',async()=>{
  const methods=[];
  const fake=async(url,opts)=>{
    methods.push(opts.method);
    if(opts.method==='GET')return {ok:true,json:async()=>[]};
    const data=JSON.parse(opts.body).body;
    assert.match(data,/WDE_AUDIO_PROBE_CLAIM:wde35-20261114-004/);
    assert.doesNotMatch(data,/AIza|4SPC|SECRET/);
    return {ok:true,json:async()=>({})};
  };
  await claimAudioProbeRequest({requestId:req.requestId},{token:'TEST_TOKEN_NOT_A_SECRET',fetcher:fake});
  assert.deepEqual(methods,['GET','POST']);
});
test('duplicate claim prevents another inference regardless of edit replay',async()=>{
  const calls=[];
  const fake=async(url,opts)=>{
    calls.push(opts.method);
    return {ok:true,json:async()=>[{body:'<!-- WDE_AUDIO_PROBE_CLAIM:wde35-20261114-004 -->'}]};
  };
  await assert.rejects(claimAudioProbeRequest({requestId:req.requestId},
    {token:'TEST_TOKEN_NOT_A_SECRET',fetcher:fake}),/Duplicate requestId/);
  assert.deepEqual(calls,['GET']);
});
