import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveQaReleaseKey,inspectReleaseSnapshot} from '../scripts/wde-qa-release-key.mjs';
const orgId='00Dfj00000eVCOVEA4';
const batchId='a0Ifj000003f7BtEAI';
const sourceId='a07fj00001K0zwEAAR';
const digest='sha256:'+'a'.repeat(64);
const payload={orgId,batchId,sourceId,enrichmentDigest:digest,qaVersion:'verified-independent-audio-v1'};
test('same batch, source, digest and calibrated version yields identical replay key',()=>{
  const a=deriveQaReleaseKey(payload),b=deriveQaReleaseKey(payload);
  assert.equal(a,b);
  assert.match(a,/^[0-9a-f]{64}$/);
});
test('different enrichment snapshot or source yields distinct unique-claim keys',()=>{
  const original=deriveQaReleaseKey(payload);
  assert.notEqual(original,deriveQaReleaseKey({...payload,enrichmentDigest:'sha256:'+'b'.repeat(64)}));
  assert.notEqual(original,deriveQaReleaseKey({...payload,sourceId:'a07fj00001F216TAAR'}));
  assert.notEqual(original,deriveQaReleaseKey({...payload,qaVersion:'verified-independent-audio-v2'}));
});
test('wrong org, malformed IDs or digest are rejected',()=>{
  for(const x of [
    {...payload,orgId:'00D000000000000AAA'},
    {...payload,batchId:'malformed'},
    {...payload,enrichmentDigest:'unsigned'},
    {...payload,qaVersion:'../../'}
  ])assert.throws(()=>deriveQaReleaseKey(x),/RELEASE_IDENTITY_INVALID/);
});
test('read-only release snapshot rejects changed status, source, digest or concurrent update',()=>{
  const batch={Id:batchId,Sermon_Source__c:sourceId,Status__c:'NeedsCommitReview',
    QA_Enrichment_SHA256__c:digest,LastModifiedDate:'2026-11-15T10:43:53Z'};
  const expected={batch,expectedSourceId:sourceId,expectedDigest:digest,
    expectedModifiedAt:'2026-11-15T10:43:53Z'};
  assert.equal(inspectReleaseSnapshot(expected).eligible,true);
  for(const change of [
    {batch:{...batch,Status__c:'CommitApproved'}},
    {batch:{...batch,Sermon_Source__c:'a07fj00001F216TAAR'}},
    {batch:{...batch,QA_Enrichment_SHA256__c:'sha256:'+'b'.repeat(64)}},
    {expectedModifiedAt:'2026-11-15T10:43:54Z'}
  ])assert.equal(inspectReleaseSnapshot({...expected,...change}).eligible,false);
  assert.equal(inspectReleaseSnapshot(expected).releasePerformed,false);
});
