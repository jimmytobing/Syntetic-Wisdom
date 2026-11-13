import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { inspectCommitReleaseReadiness } from '../scripts/wde-commit-release-readiness.mjs';
import { canonicalQaReceiptPayload, QA_ORG_ID, QA_RECEIPT_VERSION, verifyIndependentQaReceipt } from '../scripts/wde-independent-qa-receipt.mjs';

const key='TEST_ONLY_NOT_A_SECRET_DO_NOT_USE_IN_PRODUCTION_2026';
const now=1794600000000;
const batch={id:'batch-35-1',sourceId:'a07fj00001J9PShAAN',
  enrichmentDigest:'sha256:verified-digest',status:'NeedsCommitReview',
  isLatestSnapshot:true};
const flowResponse=[{isSuccess:true,outputValues:{
  varResultStatus:'SUCCESS',varEnrichmentLines:'0;17;Other;topic;summary;false;false|'
}}];
const review={verdict:'PASS',confidence:0.99,sourceAnchored:true,evidenceId:'QA-35-SNAPSHOT',
  qaVersion:'editorial-v1',boundaryChecksPassed:true,crossSegmentChecksPassed:true,flags:[]};
const payload={version:QA_RECEIPT_VERSION,orgId:QA_ORG_ID,sourceId:batch.sourceId,
  batchId:batch.id,enrichmentDigest:batch.enrichmentDigest,flowStatus:'SUCCESS',
  issuedAt:now-1000,expiresAt:now+300000,review};
const sign=(p,secret=key)=>({payload:p,signature:createHmac('sha256',secret)
  .update(canonicalQaReceiptPayload(p)).digest('hex')});
const receipt=sign(payload);
const base={batch,flowResponse,coverage:{pass:true},handoffs:{pass:true},
  sourceAuthenticated:true,signedQaReceipt:receipt,qaReceiptKey:key,now};
const run=x=>inspectCommitReleaseReadiness({...base,...x});
const humanAdjudication={verdict:'APPROVE',reviewerId:'editor',evidenceId:'review-35',
  batchId:batch.id,sourceId:batch.sourceId,enrichmentDigest:batch.enrichmentDigest};

test('signed independent QA yields release candidate without Salesforce write permission',()=>{
  const r=run({});
  assert.equal(r.decision,'RELEASE_CANDIDATE_ONLY');
  assert.deepEqual(r.blockers,[]);
  assert.equal(r.canWriteSalesforce,false);
  assert.equal(r.publishAuthorized,false);
});

test('unsigned or missing QA claim never clears even if Groq returned SUCCESS',()=>{
  for(const x of [{signedQaReceipt:undefined},{qaReceiptKey:undefined},
    {signedQaReceipt:{payload,signature:''}},
    {signedQaReceipt:undefined,independentlyVerifiedAiReview:{
      source:'INDEPENDENT_QA',sourceId:batch.sourceId,batchId:batch.id,
      enrichmentDigest:batch.enrichmentDigest,flowStatus:'SUCCESS',review
    }}]){
    const r=run(x);
    assert.equal(r.decision,'REMAIN_NEEDS_COMMIT_REVIEW');
    assert.ok(r.blockers.includes('QA_SIGNATURE_MISSING'));
  }
});

test('signed receipt rejects wrong batch, digest and source',()=>{
  for(const changes of [{batchId:'different'},{enrichmentDigest:'changed'},{sourceId:'wrong'}]){
    const r=run({signedQaReceipt:sign({...payload,...changes})});
    assert.ok(r.blockers.includes('QA_RECEIPT_BATCH_MISMATCH'));
  }
});

test('tamper, wrong key, wrong org or extra claims do not authenticate',()=>{
  for(const x of [
    {signedQaReceipt:{...receipt,payload:{...payload,review:{...review,confidence:1}}}},
    {qaReceiptKey:'another-test-signing-key-with-different-bytes'},
    {signedQaReceipt:sign({...payload,orgId:'00D000000000000AAA'})},
    {signedQaReceipt:{...receipt,payload:{...payload,unreviewed:true}}}
  ]){
    assert.equal(run(x).decision,'REMAIN_NEEDS_COMMIT_REVIEW');
  }
});

test('receipt expiry and future issue timestamp fail closed',()=>{
  for(const x of [
    {now:now+300001},
    {signedQaReceipt:sign({...payload,issuedAt:now+10000,expiresAt:now+20000})},
    {signedQaReceipt:sign({...payload,expiresAt:now+900000})}
  ]){
    assert.equal(run(x).decision,'REMAIN_NEEDS_COMMIT_REVIEW');
  }
});

test('stale snapshot and other state cannot release',()=>{
  assert.ok(run({batch:{...batch,isLatestSnapshot:false}}).blockers.includes('BATCH_SNAPSHOT_NOT_VERIFIED'));
  assert.ok(run({batch:{...batch,status:'CommitApproved'}}).blockers.includes('BATCH_NOT_HELD_FOR_REVIEW'));
});

test('known 87–91 handoff failure cannot be waived by high confidence or human',()=>{
  const r=run({handoffs:{pass:false},humanAdjudication});
  assert.equal(r.decision,'REMAIN_NEEDS_COMMIT_REVIEW');
  assert.ok(r.blockers.includes('HANDOFF_FAILED'));
});

test('signed uncertain AI needs human exception review',()=>{
  const uncertain=sign({...payload,review:{...review,confidence:0.8,flags:['BOUNDARY_AMBIGUOUS']}});
  assert.ok(run({signedQaReceipt:uncertain}).blockers.includes('EXCEPTION_ADJUDICATION_REQUIRED'));
  const r=run({signedQaReceipt:uncertain,humanAdjudication});
  assert.equal(r.decision,'RELEASE_CANDIDATE_ONLY');
  assert.equal(r.wouldRequireHumanReview,true);
  assert.equal(r.canWriteSalesforce,false);
});

test('human exception cannot override missing signature, source or Flow failure',()=>{
  for(const x of [
    {signedQaReceipt:undefined},
    {sourceAuthenticated:false},
    {coverage:{pass:false}},
    {flowResponse:[{isSuccess:true,outputValues:{varResultStatus:'ERROR',varEnrichmentLines:'bad'}}]}
  ]){
    const r=run({...x,humanAdjudication});
    assert.equal(r.decision,'REMAIN_NEEDS_COMMIT_REVIEW');
  }
});

test('receipt verifier returns no attestation for malformed or wrong signature',()=>{
  assert.equal(verifyIndependentQaReceipt({receipt:{payload,signature:'0'.repeat(64)},
    key,batch,now}).verified,false);
  assert.equal(verifyIndependentQaReceipt({receipt,key:'',batch,now}).verified,false);
});

test('batch snapshot is mandatory',()=>{
  assert.throws(()=>run({batch:{...batch,id:''}}),/BATCH_SNAPSHOT_REQUIRED/);
  assert.throws(()=>run({batch:null}),/BATCH_SNAPSHOT_REQUIRED/);
});
