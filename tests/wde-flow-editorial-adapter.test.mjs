import test from 'node:test';
import assert from 'node:assert/strict';
import { triageStageBFlowResponse } from '../scripts/wde-flow-editorial-adapter.mjs';

const sourceId = 'a07fj00001J9PShAAN';
const verified = {coverage:{pass:true},handoffs:{pass:true},sourceAuthenticated:true,sourceId};
const flowResponse = [{isSuccess:true,outputValues:{
  varResultStatus:'SUCCESS',varEnrichmentLines:'0;1;Other;topic;summary;false;false|'
}}];
const evidence = {sourceId,source:'INDEPENDENT_QA',flowStatus:'SUCCESS',
  review:{verdict:'PASS',confidence:0.98,sourceAnchored:true,
    evidenceId:'audited-qa-001',qaVersion:'editorial-v1',
    boundaryChecksPassed:true,crossSegmentChecksPassed:true,flags:[]}};
test('actual Flow response without independent QA remains human-review-required',()=>{
  const r=triageStageBFlowResponse({...verified,flowResponse});
  assert.equal(r.stageBSuccess,true);
  assert.equal(r.route,'HUMAN_REVIEW_REQUIRED');
  assert.ok(r.reasons.includes('AI_REVIEW_MISSING'));
  assert.equal(r.approvalPerformed,false);
});
test('read-only adapter supports Salesforce CLI REST wrapper',()=>{
  const r=triageStageBFlowResponse({...verified,flowResponse:{result:{body:flowResponse}},
    independentlyVerifiedAiReview:evidence});
  assert.equal(r.route,'AI_EDITORIAL_CLEAR');
  assert.equal(r.calloutPerformed,false);
  assert.equal(r.approvalPerformed,false);
  assert.equal('varEnrichmentLines' in r,false);
});
test('source mismatched attestation cannot clear review',()=>{
  const r=triageStageBFlowResponse({...verified,flowResponse,
    independentlyVerifiedAiReview:{...evidence,sourceId:'another'}});
  assert.equal(r.route,'HUMAN_REVIEW_REQUIRED');
  assert.ok(r.reasons.includes('INDEPENDENT_QA_ATTESTATION_MISMATCH'));
});
test('Groq/Flow error, missing output and malformed response fail closed',()=>{
  for(const bad of [
    [{isSuccess:false,outputValues:{varResultStatus:'SUCCESS',varEnrichmentLines:'valid'}}],
    [{isSuccess:true,outputValues:{varResultStatus:'ERROR',varEnrichmentLines:'valid'}}],
    [{isSuccess:true,outputValues:{varResultStatus:'SUCCESS',varEnrichmentLines:''}}],
    [],{},[{isSuccess:true,outputValues:{varResultStatus:'SUCCESS'}}]
  ]){
    const r=triageStageBFlowResponse({...verified,flowResponse:bad,
      independentlyVerifiedAiReview:evidence});
    assert.equal(r.route,'HUMAN_REVIEW_REQUIRED');
    assert.equal(r.approvalPerformed,false);
  }
});
test('independent structural failure overrides high-confidence AI review',()=>{
  const r=triageStageBFlowResponse({...verified,handoffs:{pass:false},
    flowResponse,independentlyVerifiedAiReview:evidence});
  assert.equal(r.route,'HUMAN_REVIEW_REQUIRED');
  assert.ok(r.reasons.includes('HANDOFF_FAILED'));
});
test('source must be explicit',()=>{
  assert.throws(()=>triageStageBFlowResponse({...verified,sourceId:'',flowResponse}),/SOURCE_ID_REQUIRED/);
});
