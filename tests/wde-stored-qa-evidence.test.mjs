import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import { inspectStoredBatchQaEvidence } from '../scripts/wde-stored-qa-evidence.mjs';
import { QA_ORG_ID, QA_RECEIPT_VERSION, canonicalQaReceiptPayload } from '../scripts/wde-independent-qa-receipt.mjs';

const key='TEST_ONLY_32_BYTES_OR_MORE_NOT_A_PRODUCTION_SECRET';
const now=1794600000000;
const enrichment='0;17;Other;topic;summary;false;false|';
const digest='sha256:'+createHash('sha256').update(enrichment).digest('hex');
const batch={Id:'a00TESTBATCH123456',Sermon_Source__c:'a07fj00001J9PShAAN',
  Status__c:'NeedsCommitReview',Approved_Enrichment__c:enrichment,
  QA_Enrichment_SHA256__c:digest};
const payload={version:QA_RECEIPT_VERSION,orgId:QA_ORG_ID,
  sourceId:batch.Sermon_Source__c,batchId:batch.Id,enrichmentDigest:digest,
  flowStatus:'SUCCESS',issuedAt:now-1000,expiresAt:now+300000,
  review:{verdict:'PASS',confidence:0.98,sourceAnchored:true,
    evidenceId:'QA-35-TEST',qaVersion:'editorial-v1',
    boundaryChecksPassed:true,crossSegmentChecksPassed:true,flags:[]}};
const receipt=p=>JSON.stringify({payload:p,signature:createHmac('sha256',key)
  .update(canonicalQaReceiptPayload(p)).digest('hex')});
const record={...batch,QA_Signed_Receipt__c:receipt(payload)};
const verify=(changes={})=>inspectStoredBatchQaEvidence({
  record, enrichmentText:enrichment, verificationKey:key, now, ...changes
});

test('Salesforce metadata uses two minimal optional QA evidence fields',()=>{
  const base=new URL('../force-app/main/default/objects/WDE_Batch_Run__c/fields/',import.meta.url);
  const signed=readFileSync(new URL('QA_Signed_Receipt__c.field-meta.xml',base),'utf8');
  const hash=readFileSync(new URL('QA_Enrichment_SHA256__c.field-meta.xml',base),'utf8');
  assert.match(signed,/<type>LongTextArea<\/type>/);
  assert.match(signed,/<length>32768<\/length>/);
  assert.match(hash,/<type>Text<\/type>/);
  assert.match(hash,/<length>71<\/length>/);
  assert.doesNotMatch(signed+hash,/<required>true<\/required>/);
});
test('signed stored receipt and exact enrichment produce verified read-only evidence',()=>{
  const r=verify();
  assert.equal(r.verified,true);
  assert.equal(r.releasePerformed,false);
  assert.equal(r.attestation.source,'INDEPENDENT_QA');
});
test('stored receipt missing, malformed or wrong signature fails closed',()=>{
  for(const value of ['',null,'{}','not-json',
    JSON.stringify({payload,signature:'0'.repeat(64)})]){
    assert.equal(verify({record:{...record,QA_Signed_Receipt__c:value}}).verified,false);
  }
});
test('stale or tampered text/digest prevents reuse of signed QA',()=>{
  for(const change of [
    {record:{...record,Approved_Enrichment__c:'other'}},
    {record:{...record,QA_Enrichment_SHA256__c:'sha256:changed'}},
    {enrichmentText:'tampered'},
    {record:{...record,Sermon_Source__c:'different'}}
  ]){
    assert.equal(verify(change).verified,false);
  }
});
test('stale stage status, expiry and wrong WDE org fail closed',()=>{
  assert.equal(verify({record:{...record,Status__c:'CommitApproved'}}).verified,false);
  assert.equal(verify({now:now+500000}).verified,false);
  const forged=receipt({...payload,orgId:'00D000000000000AAA'});
  assert.equal(verify({record:{...record,QA_Signed_Receipt__c:forged}}).verified,false);
});
test('stored QA verification does not create a stage C transition',()=>{
  const r=verify();
  assert.equal('statusUpdate' in r,false);
  assert.equal('dml' in r,false);
  assert.equal('approvalPerformed' in r,false);
});
