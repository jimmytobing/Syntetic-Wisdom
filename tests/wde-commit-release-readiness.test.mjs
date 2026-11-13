import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectCommitReleaseReadiness } from '../scripts/wde-commit-release-readiness.mjs';

const batch = {
  id:'batch-35-1', sourceId:'a07fj00001J9PShAAN',
  enrichmentDigest:'sha256:verified-digest', status:'NeedsCommitReview',
  isLatestSnapshot:true
};
const flowResponse = [{ isSuccess:true, outputValues:{
  varResultStatus:'SUCCESS', varEnrichmentLines:'0;17;Other;topic;summary;false;false|'
}}];
const review = {verdict:'PASS',confidence:0.99,sourceAnchored:true,
  evidenceId:'QA-35-SNAPSHOT',qaVersion:'editorial-v1',
  boundaryChecksPassed:true,crossSegmentChecksPassed:true,flags:[]};
const evidence = {source:'INDEPENDENT_QA',sourceId:batch.sourceId,flowStatus:'SUCCESS',
  batchId:batch.id,enrichmentDigest:batch.enrichmentDigest,review};
const base = {batch,flowResponse,coverage:{pass:true},handoffs:{pass:true},
  sourceAuthenticated:true,independentlyVerifiedAiReview:evidence};
const run = x => inspectCommitReleaseReadiness({...base,...x});
test('complete independent QA yields proposal only, never Salesforce write permission',()=>{
  const r=run({});
  assert.equal(r.decision,'RELEASE_CANDIDATE_ONLY');
  assert.deepEqual(r.blockers,[]);
  assert.equal(r.canWriteSalesforce,false);
  assert.equal(r.publishAuthorized,false);
});
test('missing independent review remains held, not auto-released by Groq SUCCESS',()=>{
  const r=run({independentlyVerifiedAiReview:undefined});
  assert.equal(r.decision,'REMAIN_NEEDS_COMMIT_REVIEW');
  assert.ok(r.blockers.includes('QA_RECEIPT_NOT_BOUND_TO_BATCH'));
  assert.ok(r.blockers.includes('EXCEPTION_ADJUDICATION_REQUIRED'));
});
test('wrong digest and wrong batch cannot reuse QA receipt',()=>{
  for(const e of [{...evidence,enrichmentDigest:'stale'},{...evidence,batchId:'other'}]){
    assert.ok(run({independentlyVerifiedAiReview:e}).blockers.includes('QA_RECEIPT_NOT_BOUND_TO_BATCH'));
  }
});
test('stale batch snapshot or wrong status always remains held',()=>{
  assert.ok(run({batch:{...batch,isLatestSnapshot:false}}).blockers.includes('BATCH_SNAPSHOT_NOT_VERIFIED'));
  assert.ok(run({batch:{...batch,status:'CommitApproved'}}).blockers.includes('BATCH_NOT_HELD_FOR_REVIEW'));
});
test('known real handoff failure cannot be waived by high AI confidence or manual signoff',()=>{
  const humanAdjudication={verdict:'APPROVE',reviewerId:'editor',evidenceId:'review-35',
    batchId:batch.id,sourceId:batch.sourceId,enrichmentDigest:batch.enrichmentDigest};
  const r=run({handoffs:{pass:false},humanAdjudication});
  assert.equal(r.decision,'REMAIN_NEEDS_COMMIT_REVIEW');
  assert.ok(r.blockers.includes('HANDOFF_FAILED'));
});
test('uncertain AI is exception-only and requires a matching human adjudication',()=>{
  const uncertain={...evidence,review:{...review,confidence:0.8,flags:['BOUNDARY_AMBIGUOUS']}};
  assert.ok(run({independentlyVerifiedAiReview:uncertain}).blockers.includes('EXCEPTION_ADJUDICATION_REQUIRED'));
  const humanAdjudication={verdict:'APPROVE',reviewerId:'editor',evidenceId:'review-35',
    batchId:batch.id,sourceId:batch.sourceId,enrichmentDigest:batch.enrichmentDigest};
  const r=run({independentlyVerifiedAiReview:uncertain,humanAdjudication});
  assert.equal(r.decision,'RELEASE_CANDIDATE_ONLY');
  assert.equal(r.wouldRequireHumanReview,true);
  assert.equal(r.canWriteSalesforce,false);
});
test('source and Flow failure cannot be waived by a human reviewer',()=>{
  const humanAdjudication={verdict:'APPROVE',reviewerId:'editor',evidenceId:'review-35',
    batchId:batch.id,sourceId:batch.sourceId,enrichmentDigest:batch.enrichmentDigest};
  for(const x of [
    {sourceAuthenticated:false},
    {coverage:{pass:false}},
    {flowResponse:[{isSuccess:true,outputValues:{varResultStatus:'ERROR',varEnrichmentLines:'bad'}}]}
  ]){
    const r=run({...x,humanAdjudication});
    assert.equal(r.decision,'REMAIN_NEEDS_COMMIT_REVIEW');
    assert.equal(r.canWriteSalesforce,false);
  }
});
test('batch snapshot is mandatory',()=>{
  assert.throws(()=>run({batch:{...batch,id:''}}),/BATCH_SNAPSHOT_REQUIRED/);
  assert.throws(()=>run({batch:null}),/BATCH_SNAPSHOT_REQUIRED/);
});
