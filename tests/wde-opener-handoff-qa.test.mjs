import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalOpeningExpectations, inspectOpeningHandoffs } from '../scripts/wde-opener-handoff-qa.mjs';

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
