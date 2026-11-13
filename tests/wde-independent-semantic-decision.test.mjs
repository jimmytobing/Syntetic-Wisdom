import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {adjudicateIndependentSemanticSegments} from '../scripts/wde-independent-semantic-decision.mjs';

const captions=['Selamat datang semua','Kesaksian awal saya dipulihkan','Tuhan menolong keluarga saya',
  'Sekarang mari kita bernyanyi','Kami memuji Tuhan bersama','Mari kita berdoa bagi bangsa'];
const source=captions.map((text,i)=>i+';0;100;'+text+'|').join('');
const digest='sha256:'+createHash('sha256').update(source,'utf8').digest('hex');
const sourceId='synthetic-independent-source';
const primary=[
  {Start_Index__c:0,End_Index__c:0,Segment_Type__c:'Other'},
  {Start_Index__c:1,End_Index__c:2,Segment_Type__c:'Testimony'},
  {Start_Index__c:3,End_Index__c:4,Segment_Type__c:'Worship'},
  {Start_Index__c:5,End_Index__c:5,Segment_Type__c:'Prayer'}
];
const independent=primary.map(s=>({
  start:s.Start_Index__c,end:s.End_Index__c,type:s.Segment_Type__c,verdict:'PASS',
  startEvidence:captions[s.Start_Index__c],endEvidence:captions[s.End_Index__c],
  rationale:'The actual caption content supports this editorial section.'
}));
const provenance={verifiedByTrustedRunner:true,independentProvider:true,
  sourceDigest:digest,sourceId,runId:'trusted-test-run-123'};
const check=changes=>adjudicateIndependentSemanticSegments({
  rawTranscript:source,primarySegments:primary,independentSegments:independent,
  provenance,sourceId,...changes
});
test('independent caption-grounded evidence yields transcript-only PASS',()=>{
  const r=check({});
  assert.equal(r.decision,'PASS');
  assert.equal(r.checkedCaptionCount,6);
  assert.equal(r.releaseAuthorized,false);
  assert.equal(r.audioVerified,false);
});
test('different categories cause independent FAIL not false consensus',()=>{
  const x=structuredClone(independent);x[1].type='Other';
  const r=check({independentSegments:x});
  assert.equal(r.decision,'FAIL');
  assert.ok(r.disputes.some(x=>x.code==='PRIMARY_INDEPENDENT_DISAGREEMENT'));
});
test('uncertain evaluator verdict creates editorial FAIL',()=>{
  const x=structuredClone(independent);x[2].verdict='REVIEW';
  assert.equal(check({independentSegments:x}).decision,'FAIL');
});
test('unverified model supplied provenance never issues PASS',()=>{
  for(const p of [undefined,{...provenance,verifiedByTrustedRunner:false},
    {...provenance,sourceDigest:'wrong'},{...provenance,runId:''}]){
    const r=check({provenance:p});
    assert.equal(r.decision,'REVIEW');
    assert.ok(r.reasonCodes.includes('INDEPENDENCE_NOT_AUTHENTICATED'));
  }
});
test('ungrounded quotes and missing segment fail review',()=>{
  const x=structuredClone(independent);x[0].startEvidence='invented';
  assert.ok(check({independentSegments:x}).reasonCodes.includes('SEMANTIC_EVIDENCE_NOT_GROUNDED'));
  assert.equal(check({independentSegments:independent.slice(0,3)}).decision,'REVIEW');
});
test('source-specific handoff 87-92 is not silently accepted as testimony',()=>{
  const n=93;const texts=Array.from({length:n},(_,i)=>'Original indexed caption '+i);
  const raw=texts.map((t,i)=>i+';0;100;'+t+'|').join('');
  const p=[{Start_Index__c:0,End_Index__c:91,Segment_Type__c:'Testimony'},
    {Start_Index__c:92,End_Index__c:92,Segment_Type__c:'Testimony'}];
  const q=p.map(s=>({start:s.Start_Index__c,end:s.End_Index__c,type:s.Segment_Type__c,
    verdict:'PASS',startEvidence:texts[s.Start_Index__c],endEvidence:texts[s.End_Index__c],
    rationale:'Independent section-level classification from authenticated indexed captions.'}));
  const result=check({rawTranscript:raw,primarySegments:p,independentSegments:q,
    sourceId:'a07fj00001J9PShAAN',
    provenance:{...provenance,sourceId:'a07fj00001J9PShAAN',
      sourceDigest:'sha256:'+createHash('sha256').update(raw).digest('hex')}});
  assert.equal(result.decision,'FAIL');
  assert.ok(result.disputes.some(x=>x.code==='SOURCE_ANCHORED_HANDOFF_MISMATCH'));
});
test('cannot pass without complete indexed text or well-formed evidence',()=>{
  const r=check({rawTranscript:source.replace('0;0;100;','2;0;100;')});
  assert.equal(r.decision,'REVIEW');
  assert.ok(r.reasonCodes.includes('SOURCE_CAPTION_INVALID'));
});
