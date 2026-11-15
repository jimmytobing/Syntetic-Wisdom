import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {assessQaOAuthRelease} from '../scripts/wde-qa-oauth-preflight.mjs';
import {canonicalQaReceiptPayload,QA_RECEIPT_VERSION} from '../scripts/wde-independent-qa-receipt.mjs';
const orgId='00Dfj00000eVCOVEA4', batchId='a0Ifj000003f7BtEAI';
const sourceId='a07fj00001K0zwEAAR',qaUserId='005fj00000QaTestAA',primaryUserId='005fj00000ApiTestA';
const qaVersion='independent-audio-editorial-v2';
const secret='q'.repeat(40),enrichment='hello;original;source';
const digest='sha256:'+createHash('sha256').update(enrichment).digest('hex');
const batch={Id:batchId,Sermon_Source__c:sourceId,Status__c:'NeedsCommitReview',
  Approved_Enrichment__c:enrichment,QA_Enrichment_SHA256__c:digest,
  LastModifiedDate:'2026-11-15T10:43:53.000+0000'};
const source={Id:sourceId,Rights_Status__c:'PermissionGranted'};
const now=1_800_000_000_000;
function receipt(){
 const payload={version:QA_RECEIPT_VERSION,orgId,sourceId,batchId,
   enrichmentDigest:digest,flowStatus:'SUCCESS',issuedAt:now-1000,expiresAt:now+240000,
   review:{verdict:'PASS',confidence:0.98,sourceAnchored:true,
     evidenceId:'qa:test-actual-record',qaVersion,boundaryChecksPassed:true,
     crossSegmentChecksPassed:true,flags:[]}};
 return {payload,signature:createHmac('sha256',secret)
   .update(canonicalQaReceiptPayload(payload)).digest('hex')};
}
function run(overrides={}){return assessQaOAuthRelease({
 batch,source,receipt:receipt(),receiptKey:secret,qaUserId,expectedQaUserId:qaUserId,
 primaryUserId,authenticatedOrgId:orgId,trustedQaVersions:[qaVersion],now,...overrides
});}
test('authentic signed PASS is only a candidate, never automatically writes',()=>{
 const result=run();assert.equal(result.ready,true);
 assert.equal(result.input.varS_BatchId,batchId);
 assert.match(result.input.varS_ReleaseKey,/^[0-9a-f]{64}$/);
 assert.equal(result.input.varS_QaVerdict,'PASS');
});
test('reject missing trusted QA authority',()=>{
 assert.equal(run({trustedQaVersions:[]}).ready,false);
 assert.ok(run({trustedQaVersions:[]}).blockers.includes('QA_VERSION_NOT_TRUSTED'));
});
test('reject wrong user or reused generation principal',()=>{
 assert.ok(run({qaUserId:primaryUserId}).blockers.includes('QA_IDENTITY_NOT_INDEPENDENT'));
 assert.ok(run({authenticatedOrgId:'00D000000000000AAA'}).blockers.includes('WRONG_ORG'));
});
test('reject forged PASS, expired receipt, wrong source, stale batch',()=>{
 const forged=receipt();forged.payload.review.confidence=1;
 assert.equal(run({receipt:forged}).ready,false);
 assert.equal(run({now:now+300001}).ready,false);
 assert.equal(run({source:{...source,Rights_Status__c:'Restricted'}}).ready,false);
 assert.equal(run({batch:{...batch,Status__c:'Completed'}}).ready,false);
 assert.equal(run({batch:{...batch,QA_Enrichment_SHA256__c:'sha256:'+'0'.repeat(64)}}).ready,false);
});
test('signed REVIEW or unresolved flags cannot release',()=>{
 const review=receipt();review.payload.review.verdict='REVIEW';
 review.signature=createHmac('sha256',secret).update(canonicalQaReceiptPayload(review.payload)).digest('hex');
 assert.equal(run({receipt:review}).ready,false);
 const flagged=receipt();flagged.payload.review.flags=['UNKNOWN_AUDIO'];
 flagged.signature=createHmac('sha256',secret).update(canonicalQaReceiptPayload(flagged.payload)).digest('hex');
 assert.equal(run({receipt:flagged}).ready,false);
});
