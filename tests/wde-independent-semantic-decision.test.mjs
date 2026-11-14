import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {adjudicateIndependentSemanticSegments} from '../scripts/wde-independent-semantic-decision.mjs';
import {provisionalBoundaryCases,inspectEditorialGoldReadiness,WDE_CALIBRATION_SOURCE_ID,WDE_CALIBRATION_CAPTION_COUNT} from '../scripts/wde-semantic-calibration-audit.mjs';
import {persistedEditorialBoundaries,inspectBoundaryReviewInventory} from '../scripts/wde-editorial-boundary-inventory.mjs';

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

test('out-of-order independent segments are canonically sorted before contiguous comparison',()=>{
  const shuffled=[independent[3],independent[1],independent[0],independent[2]];
  const r=check({independentSegments:shuffled});
  assert.equal(r.decision,'PASS');
  assert.equal(r.checkedCaptionCount,6);
});

test('shifted prayer entry between exhortation and direct prayer fails closed',()=>{
  // Structural regression for the observed 1559|1560 vs 1567|1568 disagreement.
  // Synthetic text is not certified editorial gold.
  const words=Array.from({length:20},(_,i)=>i<8?'Invitation to pray '+i:'Direct prayer '+i);
  const raw=words.map((t,i)=>(1559+i)+';0;100;'+t+'|').join('');
  const original=[{start_index:1559,end_index:1559,segment_type:'Teaching'},
    {start_index:1560,end_index:1578,segment_type:'Prayer'}];
  const independentProposal=[
    {start:1559,end:1567,type:'Teaching',verdict:'PASS',
      startEvidence:words[0],endEvidence:words[8],
      rationale:'The initial lines invite the audience before direct prayer begins.'},
    {start:1568,end:1578,type:'Prayer',verdict:'PASS',
      startEvidence:words[9],endEvidence:words[19],
      rationale:'Direct prayer speech starts after the preceding exhortation.'}
  ];
  const p={verifiedByTrustedRunner:true,independentProvider:true,
    sourceDigest:'sha256:'+createHash('sha256').update(raw).digest('hex'),
    sourceId:'synthetic-prayer-transition',runId:'regression-transition'};
  const result=check({rawTranscript:raw,primarySegments:original,
    independentSegments:independentProposal,provenance:p,sourceId:p.sourceId});
  assert.equal(result.decision,'FAIL');
  assert.ok(result.disputes.some(x=>x.code==='PRIMARY_INDEPENDENT_DISAGREEMENT'));
  assert.equal(result.releaseAuthorized,false);
});
test('independent evaluator outage cannot be interpreted as semantic PASS',()=>{
  const result=check({independentSegments:[],provenance:undefined});
  assert.equal(result.decision,'REVIEW');
  assert.ok(result.reasonCodes.includes('INDEPENDENCE_NOT_AUTHENTICATED'));
  assert.ok(result.reasonCodes.includes('SEGMENTS_MISSING'));
  assert.equal(result.releaseAuthorized,false);
});

test('all five live boundary triage cases remain provisional, not human-certified gold',()=>{
  assert.equal(provisionalBoundaryCases.length,5);
  assert.ok(provisionalBoundaryCases.every(x=>x.status==='PROVISIONAL'));
  const result=inspectEditorialGoldReadiness({
    sourceId:WDE_CALIBRATION_SOURCE_ID,captionCount:WDE_CALIBRATION_CAPTION_COUNT
  });
  assert.equal(result.status,'HUMAN_REVIEW_REQUIRED');
  assert.equal(result.goldCaseCount,0);
  assert.equal(result.pendingCases.length,5);
  assert.equal(result.falsePassRate,null);
  assert.equal(result.autoApprovalAllowed,false);
  assert.ok(result.findingCodes.includes('FALSE_PASS_RATE_NOT_ESTIMABLE'));
});
test('model-supplied or forged gold verdict cannot bypass provenance checks',()=>{
  const digest='sha256:'+'a'.repeat(64);
  const attestation={caseId:'PRAYER_1568',status:'GOLD_VERIFIED',
    acceptedBoundaries:[1568],adjudicationId:'claimed-by-model',
    sourceDigest:digest,trustedReviewerVerified:true,independentOfModel:true};
  const args={sourceId:WDE_CALIBRATION_SOURCE_ID,
    captionCount:WDE_CALIBRATION_CAPTION_COUNT,sourceDigest:digest};
  const untrusted=inspectEditorialGoldReadiness({...args,attestations:[attestation]});
  assert.equal(untrusted.autoApprovalAllowed,false);
  assert.equal(untrusted.goldCaseCount,0);
  assert.equal(untrusted.falsePassRate,null);
  assert.ok(untrusted.findingCodes.includes('TRUSTED_SOURCE_PROVENANCE_MISSING'));
  const mismatch=inspectEditorialGoldReadiness({...args,trustedRunnerVerified:true,
    attestations:[{...attestation,sourceDigest:'sha256:'+'b'.repeat(64)}]});
  assert.equal(mismatch.goldCaseCount,0);
  assert.ok(mismatch.findingCodes.includes('EDITORIAL_ATTESTATION_UNVERIFIED'));
});
test('even all five claimed attestations cannot certify representative false-PASS rate',()=>{
  const digest='sha256:'+'a'.repeat(64);
  const attestations=provisionalBoundaryCases.map((c,i)=>({
    caseId:c.id,status:'GOLD_VERIFIED',sourceDigest:digest,
    trustedReviewerVerified:true,independentOfModel:true,
    adjudicationId:'trusted-synthetic-'+i,acceptedBoundaries:[c.proposedBoundaries[0]]
  }));
  const result=inspectEditorialGoldReadiness({sourceId:WDE_CALIBRATION_SOURCE_ID,
    captionCount:WDE_CALIBRATION_CAPTION_COUNT,sourceDigest:digest,
    trustedRunnerVerified:true,attestations});
  assert.equal(result.goldCaseCount,0);
  assert.ok(result.findingCodes.includes('EDITORIAL_ATTESTATIONS_NOT_AUTHENTICATED'));
  assert.equal(result.falsePassRate,null);
  assert.equal(result.autoApprovalAllowed,false);
  assert.ok(result.findingCodes.includes('FALSE_PASS_RATE_NOT_ESTIMABLE'));
});

test('23 persisted boundaries are ordered, contiguous and not human-certified',()=>{
  const report=inspectBoundaryReviewInventory();
  assert.equal(report.status,'READY_FOR_HUMAN_REVIEW');
  assert.equal(report.expectedBoundaries,23);
  assert.equal(report.certifiedGoldCount,0);
  assert.equal(report.autoApprovalAllowed,false);
  assert.equal(persistedEditorialBoundaries.filter(x=>x.priority==='HIGH').length,8);
  assert.ok(persistedEditorialBoundaries.every(x=>x.rightStart===x.leftEnd+1));
});
test('tampered or false-certified boundary inventory is rejected',()=>{
  const rows=persistedEditorialBoundaries.map(x=>({...x}));
  rows[17].rightStart++;
  assert.equal(inspectBoundaryReviewInventory(rows).status,'INVALID_INVENTORY');
  const claimed=persistedEditorialBoundaries.map(x=>({...x}));
  claimed[0].goldVerified=true;claimed[0].decision='PASS';
  assert.ok(inspectBoundaryReviewInventory(claimed).findings.includes('UNVERIFIED_GOLD_CLAIM'));
  assert.equal(inspectBoundaryReviewInventory(claimed).certifiedGoldCount,0);
});
