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

test('regression: live WDE licensed-source 0–22 Groq vs Gemini disagreement is editorial FAIL',()=>{
  // Text is intentionally anonymized; index/range/type reproduce live Salesforce result.
  const texts=Array.from({length:23},(_,i)=>i<=15
    ? 'Host introductory remarks '+i
    : 'First-person testimony '+i);
  const raw=texts.map((t,i)=>i+';0;100;'+t+'|').join('');
  const initial=[{Start_Index__c:0,End_Index__c:22,Segment_Type__c:'Testimony'}];
  const review=[
    {start:0,end:15,type:'Other',verdict:'PASS',startEvidence:texts[0],
      endEvidence:texts[15],rationale:'The presenter introduces the testimony before switching speakers.'},
    {start:16,end:22,type:'Testimony',verdict:'PASS',startEvidence:texts[16],
      endEvidence:texts[22],rationale:'First-person account begins at caption sixteen and continues.'}
  ];
  const p={verifiedByTrustedRunner:true,independentProvider:true,
    sourceDigest:'sha256:'+createHash('sha256').update(raw).digest('hex'),
    sourceId:'a07fj00001F216TAAR',runId:'synthetic-provenance-for-live-range-regression'};
  const result=check({rawTranscript:raw,primarySegments:initial,
    independentSegments:review,provenance:p,sourceId:p.sourceId});
  assert.equal(result.decision,'FAIL');
  assert.equal(result.batchStartIndex,0);
  assert.equal(result.batchEndIndex,22);
  assert.deepEqual(result.reasonCodes,[]);
  assert.ok(result.disputes.some(x=>x.code==='SEGMENT_COUNT_DISAGREEMENT'));
  assert.ok(result.disputes.some(x=>x.code==='PRIMARY_INDEPENDENT_DISAGREEMENT'));
  assert.equal(result.releaseAuthorized,false);
});
test('independent indexed batch starting at nonzero caption is supported',()=>{
  const captions=['Initial thought','Transition to prayer','Prayer continues'];
  const raw=captions.map((t,i)=>(210+i)+';0;100;'+t+'|').join('');
  const p=[{start_index:210,end_index:210,segment_type:'Teaching'},
    {start_index:211,end_index:212,segment_type:'Prayer'}];
  const q=[
    {start:210,end:210,type:'Teaching',verdict:'PASS',startEvidence:captions[0],
      endEvidence:captions[0],rationale:'Expository teaching is underway at this caption.'},
    {start:211,end:212,type:'Prayer',verdict:'PASS',startEvidence:captions[1],
      endEvidence:captions[2],rationale:'Direct prayer address begins and continues here.'}
  ];
  const prov={verifiedByTrustedRunner:true,independentProvider:true,
    sourceDigest:'sha256:'+createHash('sha256').update(raw).digest('hex'),
    sourceId:'generic-other-source',runId:'trusted-offset-test'};
  const r=check({rawTranscript:raw,primarySegments:p,independentSegments:q,
    provenance:prov,sourceId:prov.sourceId});
  assert.equal(r.decision,'PASS');
  assert.equal(r.batchStartIndex,210);
  assert.equal(r.batchEndIndex,212);
});
test('known real 0–15 source anchor rejects false model consensus',()=>{
  const texts=Array.from({length:23},(_,i)=>'Source caption '+i);
  const raw=texts.map((t,i)=>i+';0;100;'+t+'|').join('');
  const p=[{start_index:0,end_index:22,segment_type:'Testimony'}];
  const q=[{start:0,end:22,type:'Testimony',verdict:'PASS',
    startEvidence:texts[0],endEvidence:texts[22],
    rationale:'Models agree, but reviewed source markers invalidate this category.'}];
  const prov={verifiedByTrustedRunner:true,independentProvider:true,
    sourceDigest:'sha256:'+createHash('sha256').update(raw).digest('hex'),
    sourceId:'a07fj00001F216TAAR',runId:'trusted-source-anchored-test'};
  const r=check({rawTranscript:raw,primarySegments:p,independentSegments:q,
    provenance:prov,sourceId:prov.sourceId});
  assert.equal(r.decision,'FAIL');
  assert.ok(r.disputes.some(x=>x.code==='SOURCE_ANCHORED_HANDOFF_MISMATCH'));
});
