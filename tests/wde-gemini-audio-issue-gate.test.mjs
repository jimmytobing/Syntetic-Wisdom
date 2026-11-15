import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIssueAudioProbe,verifyAudioProbeEvent,claimAudioProbeRequest,claimDailyGeminiCall
} from '../.github/mjs/wde-gemini-audio-issue-gate.mjs';

const fence=String.fromCharCode(96).repeat(3);
const req={operation:'gemini.audio_probe',testMode:'audio_probe',requestId:'wde54-20261115-004'};
const body=(r=req)=>'Context\\n### WDE Request\\n'+fence+'json\\n'+
  JSON.stringify(r)+'\\n'+fence+'\\n';
const env={GITHUB_REPOSITORY:'jimmytobing/Syntetic-Wisdom',
  GITHUB_REF:'refs/heads/main',GITHUB_ACTOR:'jimmytobing',
  GITHUB_EVENT_NAME:'issues'};
const event=(r=req)=>({action:'edited',issue:{number:54,
  user:{login:'jimmytobing'},body:body(r)}});

test('strict Issue request needs no manual attestations but forbids extra caller controls',()=>{
  assert.deepEqual(parseIssueAudioProbe(body()),{requestId:req.requestId});
  assert.throws(()=>parseIssueAudioProbe(body({...req,operation:'shell.exec'})),/only the fixed/);
  assert.throws(()=>parseIssueAudioProbe(body({...req,testMode:'editorial'})),/only the fixed/);
  assert.throws(()=>parseIssueAudioProbe(body({...req,rightsAck:'REVIEW_PERMITTED'})),/Unexpected/);
  assert.throws(()=>parseIssueAudioProbe(body()+'\\n### WDE Request'),/Exactly one/);
  assert.throws(()=>parseIssueAudioProbe(body({...req,requestId:'bad'})),/Invalid requestId/);
});

test('trusted actor and exact Issue #54 are still security gates',()=>{
  assert.deepEqual(verifyAudioProbeEvent(event(),env),{
    source:'issue',mode:'audio_probe',resume:'',requestId:req.requestId});
  assert.throws(()=>verifyAudioProbeEvent(event(),{...env,GITHUB_ACTOR:'stranger'}),/Untrusted/);
  assert.throws(()=>verifyAudioProbeEvent(event(),{...env,GITHUB_REF:'refs/heads/dev'}),/Invalid repository/);
  assert.throws(()=>verifyAudioProbeEvent({...event(),issue:{...event().issue,number:53}},env),/Untrusted Issue/);
  assert.throws(()=>verifyAudioProbeEvent({...event(),action:'opened'},env),/Untrusted Issue/);
});

test('manual dispatch no longer needs fresh checkboxes, but still restricts mode and resume ID',()=>{
  const manual={...env,GITHUB_EVENT_NAME:'workflow_dispatch',
    INPUT_TEST_MODE:'audio_probe',INPUT_RESUME_INTERACTION_ID:''};
  assert.equal(verifyAudioProbeEvent({},manual).source,'manual');
  assert.throws(()=>verifyAudioProbeEvent({}, {...manual,INPUT_TEST_MODE:'shell'}),/Invalid manual mode/);
  assert.throws(()=>verifyAudioProbeEvent({}, {...manual,INPUT_RESUME_INTERACTION_ID:'../'}),/Invalid manual resume ID/);
});

test('Issue request claim posts once and never exposes provider key or source text',async()=>{
  const methods=[];
  const fake=async(url,opts)=>{
    methods.push(opts.method);
    if(opts.method==='GET')return {ok:true,json:async()=>[]};
    const data=JSON.parse(opts.body).body;
    assert.match(data,/WDE_AUDIO_PROBE_CLAIM:wde54-20261115-004/);
    assert.doesNotMatch(data,/AIza|4SPc|SECRET/);
    return {ok:true,json:async()=>({})};
  };
  await claimAudioProbeRequest({requestId:req.requestId},{token:'TEST_TOKEN_NOT_A_SECRET',fetcher:fake});
  assert.deepEqual(methods,['GET','POST']);
});
test('duplicate request ID blocks replay',async()=>{
  const calls=[];
  const fake=async(url,opts)=>{
    calls.push(opts.method);
    return {ok:true,json:async()=>[{body:'<!-- WDE_AUDIO_PROBE_CLAIM:wde54-20261115-004 -->'}]};
  };
  await assert.rejects(claimAudioProbeRequest({requestId:req.requestId},
    {token:'TEST_TOKEN_NOT_A_SECRET',fetcher:fake}),/Duplicate requestId/);
  assert.deepEqual(calls,['GET']);
});
test('first UTC daily claim consumes the only bounded inference slot',async()=>{
  const methods=[];
  const fake=async(url,opts)=>{
    methods.push(opts.method);
    if(opts.method==='GET')return {ok:true,json:async()=>[]};
    const posted=JSON.parse(opts.body).body;
    assert.match(posted,/WDE_GEMINI_AUTONOMOUS_CALL:20261115:123456/);
    return {ok:true,json:async()=>({})};
  };
  await claimDailyGeminiCall({token:'TEST_TOKEN_NOT_A_SECRET',runId:'123456',
    day:'20261115',fetcher:fake});
  assert.deepEqual(methods,['GET','POST']);
});
test('daily claim cap is enforced even when request ID differs',async()=>{
  const calls=[];
  const fake=async(url,opts)=>{
    calls.push(opts.method);
    return {ok:true,json:async()=>[
      {body:'<!-- WDE_GEMINI_AUTONOMOUS_CALL:20261115:999999 -->'}]};
  };
  await assert.rejects(claimDailyGeminiCall({token:'TEST_TOKEN_NOT_A_SECRET',runId:'123456',
    day:'20261115',fetcher:fake}),/DAILY_CALL_BUDGET_EXHAUSTED/);
  assert.deepEqual(calls,['GET']);
});
