import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalOpeningExpectations, inspectOpeningHandoffs, proposeOpeningBoundaryReview } from '../scripts/wde-opener-handoff-qa.mjs';

const source = Array.from({ length: 128 }, (_, index) => index);
const accepted = [
  { start_index: 0, end_index: 86, segment_type: 'Testimony' },
  { start_index: 87, end_index: 91, segment_type: 'Other' },
  { start_index: 92, end_index: 127, segment_type: 'Testimony' }
];
const clone = (segments) => segments.map((s) => ({ ...s }));

test('accepts source-anchored host to testimony handoff', () => {
  const result = inspectOpeningHandoffs(accepted, source);
  assert.equal(result.pass, true);
  assert.deepEqual(result.findings, []);
  assert.equal(result.verifiedSourceRequired, true);
});

test('fixture covers expected host and next testimony markers', () => {
  assert.deepEqual(canonicalOpeningExpectations.map((x) => [x.index, x.expectedType]), [
    [87, 'Other'], [88, 'Other'], [89, 'Other'], [91, 'Other'], [92, 'Testimony']
  ]);
});

test('rejects baseline where host remarks are merged into testimony', () => {
  const result = inspectOpeningHandoffs([
    { start_index: 0, end_index: 91, segment_type: 'Testimony' },
    { start_index: 92, end_index: 127, segment_type: 'Testimony' }
  ], source);
  assert.equal(result.pass, false);
  assert.ok(result.findings.some((f) => f.index === 87 && f.code === 'SPEAKER_HANDOFF_MISMATCH'));
});

test('rejects handoff introduced too late', () => {
  const result = inspectOpeningHandoffs([
    { start_index: 0, end_index: 91, segment_type: 'Other' },
    { start_index: 92, end_index: 127, segment_type: 'Other' }
  ], source);
  assert.equal(result.pass, false);
  assert.ok(result.findings.some((f) => f.index === 92 && f.code === 'SPEAKER_HANDOFF_MISMATCH'));
});

test('rejects missing authentic caption in supplied source', () => {
  const result = inspectOpeningHandoffs(accepted, source.filter((i) => i !== 91));
  assert.equal(result.pass, false);
  assert.ok(result.findings.some((f) => f.index === 91 && f.code === 'SOURCE_CAPTION_MISSING'));
});

test('rejects gap at handoff caption', () => {
  const segments = clone(accepted);
  segments[1].start_index = 88;
  const result = inspectOpeningHandoffs(segments, source);
  assert.equal(result.pass, false);
  assert.ok(result.findings.some((f) => f.index === 87 && f.code === 'COVERAGE_INVALID' && f.count === 0));
});

test('rejects overlap at handoff caption', () => {
  const segments = clone(accepted);
  segments[0].end_index = 87;
  const result = inspectOpeningHandoffs(segments, source);
  assert.equal(result.pass, false);
  assert.ok(result.findings.some((f) => f.index === 87 && f.code === 'COVERAGE_INVALID' && f.count === 2));
});

test('accepts Salesforce field naming convention', () => {
  const segments = accepted.map((s) => ({
    Start_Index__c: s.start_index, End_Index__c: s.end_index, Segment_Type__c: s.segment_type
  }));
  assert.equal(inspectOpeningHandoffs(segments, source).pass, true);
});

test('rejects invalid inputs fail closed', () => {
  assert.throws(() => inspectOpeningHandoffs(null, source), /INPUT_INVALID/);
  assert.throws(() => inspectOpeningHandoffs(accepted, null), /INPUT_INVALID/);
});

const fullCaptions = Array.from({length: 1620}, (_, i) => i);
const liveRanges = [[0,14,'Other'],[15,91,'Testimony'],[92,127,'Testimony'],
  [128,305,'Worship'],[306,423,'Worship'],[424,475,'Teaching'],
  [476,604,'Teaching'],[605,1217,'Teaching'],[1218,1288,'Worship'],
  [1289,1439,'Prayer'],[1440,1548,'Worship'],[1549,1619,'Worship']];
const liveSegments = liveRanges.map(([a,b,type]) => ({
  Start_Index__c: a, End_Index__c: b, Segment_Type__c: type
}));
const propose = (segments=liveSegments, indices=fullCaptions, sourceId='a07fj00001J9PShAAN') =>
  proposeOpeningBoundaryReview({sourceId,segments,captionIndices:indices});

test('live 12-segment range snapshot fails opener editorial acceptance', () => {
  assert.equal(inspectOpeningHandoffs(liveSegments, fullCaptions).pass, false);
});
test('creates only a review-only proposal to split 15–91 at caption 87', () => {
  const result=propose();
  assert.equal(result.status,'REVIEW_PROPOSAL');
  assert.deepEqual(result.proposedChanges[0].proposedRanges,[[15,86,'Testimony'],[87,91,'Other']]);
  assert.equal(result.automaticCommitAllowed,false);
  assert.equal(result.approvalPerformed,false);
});
test('never mutates live records or rewrites transcript', () => {
  const before=JSON.stringify(liveSegments);
  const result=propose();
  assert.equal(JSON.stringify(liveSegments),before);
  assert.ok(result.proposedChanges.every(x=>!('Transcript_Text__c' in x)));
});
test('corrected snapshot passes opener and remains contiguous across all 1620 captions', () => {
  const revised=liveSegments.flatMap(s=>s.Start_Index__c===15?
    [{start_index:15,end_index:86,segment_type:'Testimony'},
     {start_index:87,end_index:91,segment_type:'Other'}]:
    [{start_index:s.Start_Index__c,end_index:s.End_Index__c,segment_type:s.Segment_Type__c}]);
  assert.equal(inspectOpeningHandoffs(revised,fullCaptions).pass,true);
  let next=0;
  for(const s of revised){assert.equal(s.start_index,next);next=s.end_index+1;}
  assert.equal(next,1620);
  assert.deepEqual(propose(revised).proposedChanges,[]);
});
test('rejects wrong source and incomplete or reordered caption input', () => {
  assert.throws(()=>propose(liveSegments,fullCaptions,'other'),/SOURCE_OR_INPUT_INVALID/);
  assert.throws(()=>propose(liveSegments,fullCaptions.slice(0,-1)),/SOURCE_CAPTION_SEQUENCE_INVALID/);
  assert.throws(()=>propose(liveSegments,fullCaptions.slice().reverse()),/SOURCE_CAPTION_SEQUENCE_INVALID/);
});
test('rejects changed live ranges or altered type rather than inventing a fix', () => {
  const changed=structuredClone(liveSegments);
  changed[1].End_Index__c=90;
  assert.throws(()=>propose(changed),/LIVE_SNAPSHOT_MISMATCH/);
  const changedType=structuredClone(liveSegments);
  changedType[1].Segment_Type__c='Other';
  assert.throws(()=>propose(changedType),/LIVE_SNAPSHOT_MISMATCH/);
});
