import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inspectOriginalCaptionText, issueIndependentQaReviewReceipt } from '../scripts/wde-independent-qa-issuer.mjs';
import { QA_ORG_ID,verifyIndependentQaReceipt } from '../scripts/wde-independent-qa-receipt.mjs';

const key='THIS_IS_AN_ISOLATED_TEST_SIGNING_KEY_0001';
const now=1794600000000;
const texts=Array.from({length:1620},(_,i)=>i===87?'Host interlude':i===92?'Next testimony':'Caption '+i);
const rawTranscript=texts.map((s,i)=>i+';0;100;'+s+'|').join('');
const seg=(a,b,type)=>({Start_Index__c:a,End_Index__c:b,Segment_Type__c:type,
  Transcript_Text__c:texts.slice(a,b+1).join(' '),WDE_Stitch_Open__c:false});
const segments=[seg(0,86,'Testimony'),seg(87,91,'Other'),seg(92,1619,'Testimony')];
const enrichment='0;86;Testimony;test;summary;false;false|';
const digest='sha256:'+createHash('sha256').update(enrichment).digest('hex');
const batch={id:'a00SYNTHETICQA123',sourceId:'a07fj00001J9PShAAN',orgId:QA_ORG_ID,
  enrichmentDigest:digest,status:'NeedsCommitReview',isLatestSnapshot:true};
const flowResponse=[{isSuccess:true,outputValues:{varResultStatus:'SUCCESS',varEnrichmentLines:enrichment}}];
const issue=(params={})=>issueIndependentQaReviewReceipt({
  batch,flowResponse,rawTranscript,segments,signingKey:key,now,...params
});
test('complete synthetic original caption texts match all 1620 indices',()=>{
  const result=inspectOriginalCaptionText({rawTranscript,segments});
  assert.equal(result.pass,true);
  assert.equal(result.checked,1620);
});
test('signs cryptographically valid REVIEW-only receipt, not editorial PASS',()=>{
  const result=issue();
  assert.equal(result.editorialRoute,'HUMAN_REVIEW_REQUIRED');
  assert.equal(result.approvalPerformed,false);
  assert.equal(result.canWriteSalesforce,false);
  assert.equal(result.receipt.payload.review.verdict,'REVIEW');
  assert.ok(result.receipt.payload.review.flags.includes('SEMANTIC_EDITORIAL_NOT_CERTIFIED'));
  const verified=verifyIndependentQaReceipt({
    receipt:result.receipt,key,batch,now
  });
  assert.equal(verified.verified,true);
});
test('known 87–91 incorrect handoff remains flagged in signed receipt',()=>{
  const bad=[seg(0,91,'Testimony'),seg(92,1619,'Testimony')];
  const result=issue({segments:bad});
  assert.ok(result.receipt.payload.review.flags.includes('EDITORIAL_HANDOFF_FAILED'));
  assert.equal(result.receipt.payload.review.verdict,'REVIEW');
});
test('tampered transcript segments are flagged and never signed as PASS',()=>{
  const changed=structuredClone(segments);
  changed[1].Transcript_Text__c='unrelated';
  const result=issue({segments:changed});
  assert.ok(result.receipt.payload.review.flags.includes('ORIGINAL_TEXT_MISMATCH'));
});
test('missing, extra, reordered caption rows fail original source integrity',()=>{
  for(const raw of [rawTranscript.replace('0;0;100;Caption 0|',''),
    rawTranscript+'1620;0;100;extra|',
    rawTranscript.replace('0;0;100;Caption 0|','0;0;100;changed|')]){
    assert.equal(inspectOriginalCaptionText({rawTranscript:raw,segments}).pass,false);
  }
});
test('rejects stale or tampered Stage B output before signing',()=>{
  for(const response of [
    [{isSuccess:true,outputValues:{varResultStatus:'ERROR',varEnrichmentLines:enrichment}}],
    [{isSuccess:true,outputValues:{varResultStatus:'SUCCESS',varEnrichmentLines:enrichment+'changed'}}],
    [],
  ])assert.throws(()=>issue({flowResponse:response}),/STAGE_B_SOURCE_MISMATCH/);
});
test('issuer requires exact org, held state and signing key',()=>{
  assert.throws(()=>issue({batch:{...batch,orgId:'00Dwrong'}}),/ISSUER_CONTEXT_INVALID/);
  assert.throws(()=>issue({batch:{...batch,status:'CommitApproved'}}),/ISSUER_CONTEXT_INVALID/);
  assert.throws(()=>issue({signingKey:'short'}),/ISSUER_CONTEXT_INVALID/);
});
test('signed payload cannot be silently promoted to PASS',()=>{
  const {receipt}=issue();
  receipt.payload.review.verdict='PASS';
  const result=verifyIndependentQaReceipt({receipt,key,batch,now});
  assert.equal(result.verified,false);
  assert.equal(result.reason,'QA_SIGNATURE_INVALID');
});
