import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectSegmentationCoverage, inspectEditorialApprovalGate } from '../scripts/wde-segmentation-acceptance.mjs';

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
  assert.deepEqual(inspectEditorialApprovalGate(verified), { eligible: true, blockers: [], approvalPerformed: false });
  const blocked = inspectEditorialApprovalGate({ ...verified, coverage: { pass: false }, handoffs: { pass: false },
    reviewer: '', audioReviewed: false, rightsCleared: false, sourceAuthenticated: false });
  assert.deepEqual(blocked.blockers, ['COVERAGE_FAILED', 'SOURCE_AUTHENTICATION_MISSING', 'HANDOFF_FAILED', 'HUMAN_REVIEW_MISSING',
    'AUDIO_REVIEW_MISSING', 'RIGHTS_UNCLEARED']);
  assert.equal(blocked.eligible, false);
  assert.equal(blocked.approvalPerformed, false);
});
