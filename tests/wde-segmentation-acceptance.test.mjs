import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectSegmentationCoverage, inspectEditorialApprovalGate, inspectAiEditorialTriage } from '../scripts/wde-segmentation-acceptance.mjs';

const captions = Array.from({ length: 1620 }, (_, i) => i);
const seg = (start, end, extra = {}) => ({
  Start_Index__c: start, End_Index__c: end, Segment_Type__c: 'Testimony',
  Transcript_Text__c: 'Original caption passage', WDE_Stitch_Open__c: false, ...extra
});
const batches = [seg(0, 450), seg(451, 996), seg(997, 1124), seg(1125, 1619)];
const check = (rows = batches, source = captions, options) => inspectSegmentationCoverage(rows, source, options);

test('accepts contiguous cross-batch 0–1619 coverage with original text and closed stitch', () => {
  assert.equal(check().pass, true);
});
test('rejects a gap between batches', () => {
  assert.ok(check([seg(0, 450), seg(452, 1619)]).findings.some(x => x.code === 'COVERAGE_GAP'));
});
test('rejects overlap between batches', () => {
  assert.ok(check([seg(0, 450), seg(450, 1619)]).findings.some(x => x.code === 'COVERAGE_OVERLAP'));
});
test('rejects incomplete tail', () => {
  assert.ok(check([seg(0, 1124)]).findings.some(x => x.code === 'COVERAGE_GAP' && x.end === 1619));
});
test('rejects incomplete source indices', () => {
  assert.ok(check(batches, captions.filter(x => x !== 921)).findings.some(x => x.code === 'SOURCE_SEQUENCE_INVALID'));
});
test('rejects invalid reversed, fractional and out of range indices', () => {
  for (const invalid of [seg(12, 11), seg(2.5, 9), seg(0, 1620)]) {
    assert.ok(check([invalid]).findings.some(x => x.code === 'INVALID_SEGMENT_RANGE'));
  }
});
test('rejects missing text or type', () => {
  assert.ok(check([seg(0, 1619, { Transcript_Text__c: '' })]).findings.some(x => x.code === 'TRANSCRIPT_MISSING'));
  assert.ok(check([seg(0, 1619, { Segment_Type__c: '' })]).findings.some(x => x.code === 'SEGMENT_TYPE_MISSING'));
});
test('rejects open stitch at any batch', () => {
  assert.ok(check([seg(0, 1619, { WDE_Stitch_Open__c: true })]).findings.some(x => x.code === 'STITCH_STILL_OPEN'));
});
test('supports read-only structural checks with explicit smaller verified fixtures', () => {
  assert.equal(check([seg(0, 2)], [0, 1, 2], { expectedTotal: 3 }).pass, true);
});
test('fails closed on missing required inputs', () => {
  assert.throws(() => check(null), /INPUT_INVALID/);
  assert.throws(() => check([], [], { expectedTotal: 0 }), /EXPECTED_TOTAL_INVALID/);
});
test('approval gate requires editorial, source coverage, reviewer, audio and rights', () => {
  const verified = { coverage: { pass: true }, handoffs: { pass: true },
    reviewer: 'Human editor', audioReviewed: true, rightsCleared: true, sourceAuthenticated: true };
  assert.deepEqual(inspectEditorialApprovalGate(verified), { eligible: true, blockers: [], approvalPerformed: false, editorialRoute: 'HUMAN_REVIEW_REQUIRED' });
  const blocked = inspectEditorialApprovalGate({ ...verified, coverage: { pass: false }, handoffs: { pass: false },
    reviewer: '', audioReviewed: false, rightsCleared: false, sourceAuthenticated: false });
  assert.deepEqual(blocked.blockers, ['COVERAGE_FAILED', 'SOURCE_AUTHENTICATION_MISSING', 'HANDOFF_FAILED', 'EDITORIAL_REVIEW_REQUIRED',
    'AUDIO_REVIEW_MISSING', 'RIGHTS_UNCLEARED']);
  assert.equal(blocked.eligible, false);
  assert.equal(blocked.approvalPerformed, false);
});

const passed = { coverage: { pass: true }, handoffs: { pass: true }, sourceAuthenticated: true };
const aiReview = {
  verdict: 'PASS', confidence: 0.98, sourceAnchored: true,
  evidenceId: 'source-check-2026-11-13', qaVersion: 'editorial-v1',
  boundaryChecksPassed: true, crossSegmentChecksPassed: true, flags: []
};
test('AI-first routes fully evidenced high confidence result without human reviewer', () => {
  assert.deepEqual(inspectAiEditorialTriage({ ...passed, aiReview }).route, 'AI_EDITORIAL_CLEAR');
  const result = inspectEditorialApprovalGate({
    ...passed, aiReview, audioReviewed: true, rightsCleared: true
  });
  assert.equal(result.eligible, true);
  assert.equal(result.approvalPerformed, false);
});
test('AI-clear does not override missing audio and source rights', () => {
  const result=inspectEditorialApprovalGate({ ...passed, aiReview });
  assert.deepEqual(result.blockers, ['AUDIO_REVIEW_MISSING', 'RIGHTS_UNCLEARED']);
  assert.equal(result.eligible, false);
});
test('ambiguous AI review requires human adjudication, not mere reviewer text', () => {
  const uncertain={ ...aiReview, confidence: 0.8, flags: ['SPEAKER_CHANGE'] };
  const triage=inspectAiEditorialTriage({ ...passed, aiReview: uncertain });
  assert.equal(triage.route, 'HUMAN_REVIEW_REQUIRED');
  const blocked=inspectEditorialApprovalGate({
    ...passed, aiReview: uncertain, reviewer:'Editor', audioReviewed: true, rightsCleared: true
  });
  assert.deepEqual(blocked.blockers, ['EDITORIAL_REVIEW_REQUIRED']);
  const adjudicated=inspectEditorialApprovalGate({
    ...passed, aiReview: uncertain, reviewer:'Editor', humanAdjudicated: true,
    audioReviewed:true, rightsCleared:true
  });
  assert.equal(adjudicated.eligible,true);
});
test('AI reported pass cannot bypass independently failed handoff or coverage', () => {
  for (const failure of [{coverage:{pass:false}},{handoffs:{pass:false}},{sourceAuthenticated:false}]) {
    const r=inspectAiEditorialTriage({ ...passed, ...failure, aiReview });
    assert.equal(r.humanReviewRequired,true);
  }
});
test('AI missing metadata, unknown confidence, invalid flags fail closed', () => {
  for (const review of [
    undefined,
    {...aiReview,confidence: NaN},
    {...aiReview,confidence: 1.1},
    {...aiReview,qaVersion:''},
    {...aiReview,evidenceId:''},
    {...aiReview,flags:['speaker ambiguity']},
    {...aiReview,flags:null},
    {...aiReview,boundaryChecksPassed:false}
  ]) {
    const result=inspectAiEditorialTriage({ ...passed, aiReview: review });
    assert.equal(result.editorialClear,false);
    assert.equal(result.approvalPerformed,false);
  }
});
test('current live 87-91 speaker handoff mismatch routes to human review', () => {
  const r=inspectAiEditorialTriage({
    coverage:{pass:true},handoffs:{pass:false},sourceAuthenticated:true,aiReview
  });
  assert.equal(r.route,'HUMAN_REVIEW_REQUIRED');
  assert.ok(r.reasons.includes('HANDOFF_FAILED'));
});
