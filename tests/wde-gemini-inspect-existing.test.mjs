import test from 'node:test';
import assert from 'node:assert/strict';
import {parseInspectIssue,verifyEvent,validateReceipt,summarizeInteraction,
  claimOnce,inspectExisting,safeErrorShape} from '../scripts/wde-gemini-inspect-existing.mjs';

const req={operation:'gemini.inspect_error',sourceRunId:43545052586,requestId:'wde35-20261114-001'};
const fence=String.fromCharCode(96).repeat(3);
function issueBody(request=req){return ['## Context','fixed issue','### WDE Request',
  fence+'json',JSON.stringify(request),fence].join('\n');}
const receipt={interaction_id:'v1_sample_internal_123',model:'gemini-3.8-flash',
  editorial_status:'BLOCKED',source:'WDE_ISSUE_35'};

test('only exact Issue header, fixed run ID, strict JSON accepted',()=>{
  assert.deepEqual(parseInspectIssue(issueBody()),req);
  assert.throws(()=>parseInspectIssue(issueBody({...req,sourceRunId:999})),/pinned/);
  assert.throws(()=>parseInspectIssue(issueBody({...req,operation:'!!unsafe command'})),/Invalid operation/);
  assert.throws(()=>parseInspectIssue(issueBody({...req,token:'secret'})),/Unexpected/);
  assert.throws(()=>parseInspectIssue(issueBody()+'\n### WDE Request'),/Exactly one/);
});

test('untrusted actor, issue author, event and branch blocked',()=>{
  const event={action:'edited',issue:{number:35,user:{login:'jimmytobing'},body:issueBody()}};
  assert.deepEqual(verifyEvent(event,'jimmytobing/Syntetic-Wisdom','jimmytobing','refs/heads/main'),req);
  assert.throws(()=>verifyEvent(event,'jimmytobing/Syntetic-Wisdom','stranger','refs/heads/main'),/Untrusted/);
  assert.throws(()=>verifyEvent(event,'jimmytobing/Syntetic-Wisdom','jimmytobing','refs/heads/other'),/Untrusted/);
  assert.throws(()=>verifyEvent({...event,issue:{...event.issue,number:36}},
    'jimmytobing/Syntetic-Wisdom','jimmytobing','refs/heads/main'),/Wrong Issue/);
});

test('receipt must match source, model, editorial status and safe ID',()=>{
  assert.equal(validateReceipt(receipt),'v1_sample_internal_123');
  assert.throws(()=>validateReceipt({...receipt,interaction_id:'../../evil'}),/Unsafe/);
  assert.throws(()=>validateReceipt({...receipt,model:'other'}),/mismatch/);
});

test('summarize provider terminal failure safely without raw message leakage',()=>{
  const key='AIza_TEST_SECRET_MUST_NOT_APPEAR';
  const summary=summarizeInteraction({status:'failed',id:receipt.interaction_id,
    error:{code:'service_unavailable',
      message:'Provider busy due to video processing '+key+' https://private.example/secret'}});
  assert.equal(summary.status,'failed');
  assert.equal(summary.provider_code,'service_unavailable');
  assert.equal(summary.error_category,'MEDIA_OR_VIDEO_PROCESSING');
  assert.equal(summary.error_present,true);
  assert.doesNotMatch(JSON.stringify(summary),/AIza|private.example|Provider busy/);
});

test('unknown provider code is discarded, absent error stays explicit',()=>{
  const out=summarizeInteraction({status:'failed',error:{code:'SURPRISE-SECRET',message:'hidden'}});
  assert.equal(out.provider_code,'UNCLASSIFIED');
  assert.equal(out.error_category,'UNCLASSIFIED');
  assert.equal(summarizeInteraction({status:'failed'}).error_present,false);
  assert.throws(()=>summarizeInteraction({status:'nonsense'}),/Unexpected provider status/);
});

test('inspectExisting issues exactly one GET to fixed Gemini origin and never inference POST',async()=>{
  const calls=[];
  const result=await inspectExisting({receipt,key:'SECRET_FAKE_1234567890',
    fetcher:async(url,opts)=>{
      calls.push({url,method:opts.method});
      return {ok:true,status:200,json:async()=>({id:receipt.interaction_id,
        status:'failed',error:{code:'quota_exceeded',message:'Quota exceeded'}})};
    }});
  assert.equal(result.error_category,'QUOTA_OR_RATE_LIMIT');
  assert.equal(result.provider_code,'quota_exceeded');
  assert.deepEqual(calls.map(x=>x.method),['GET']);
  assert.ok(calls[0].url.startsWith('https://generativelanguage.googleapis.com/v1beta/interactions/'));
  assert.throws(()=>validateReceipt({...receipt,interaction_id:'https://evil.example'}),/Unsafe/);
});

test('claim idempotency blocks repeated request ID before call',async()=>{
  const marker='<!-- WDE_REQUEST:wde35-20261114-001 -->';
  const seen=[];
  const fetcher=async(url,opts)=>{
    seen.push(opts.method);
    return {ok:true,json:async()=>[{body:marker}]};
  };
  await assert.rejects(claimOnce(req,{token:'fake_token_very_long',
    fetcher}),/already claimed/);
  assert.deepEqual(seen,['GET']);
});

test('first claim posts marker exactly once, never content or key',async()=>{
  const calls=[];
  const fetcher=async(url,opts)=>{
    calls.push(opts);
    return {ok:true,json:async()=>opts.method==='GET'?[]:{}};
  };
  await claimOnce(req,{token:'fake_token_very_long',fetcher});
  assert.deepEqual(calls.map(x=>x.method),['GET','POST']);
  const body=JSON.parse(calls[1].body).body;
  assert.match(body,/WDE_REQUEST:wde35-20261114-001/);
  assert.doesNotMatch(body,/AIza|interaction_id|transcript/);
});


test('generic operation name is accepted without hardcoded whitelist, execution remains pinned GET',()=>{
  const request={...req,operation:'custom.future_operation'};
  assert.deepEqual(parseInspectIssue(issueBody(request)),request);
  assert.throws(()=>parseInspectIssue(issueBody({...request,operation:'../../bad'})),/Invalid operation/);
  assert.throws(()=>parseInspectIssue(issueBody({...request,operation:'A'.repeat(80)})),/Invalid operation/);
});

test('safe error shape exposes field names and types only, never provider values',()=>{
  const sensitive='AIzaSUPER_SECRET_1234 https://private.domain/token user@example.com';
  const summary=summarizeInteraction({status:'failed',error:{
    code:503,status:'INTERNAL',message:sensitive,
    details:[{type:sensitive,reason:sensitive}] }});
  assert.equal(summary.error_shape.location,'error');
  assert.equal(summary.error_shape.code_kind,'number');
  assert.equal(summary.error_shape.status_kind,'string');
  assert.equal(summary.error_shape.details_kind,'array');
  assert.equal(summary.error_shape.details_count,1);
  assert.equal(summary.provider_code,'UNCLASSIFIED');
  assert.equal(summary.provider_status,'internal');
  assert.doesNotMatch(JSON.stringify(summary),/SUPER_SECRET|private.domain|example.com/);
  assert.equal(safeErrorShape({status:'failed'}).error_kind,'undefined');
});
