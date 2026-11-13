// Pure read-only acceptance checks. No Salesforce DML or approval side effects.
// expected captions must be independently authenticated against the source transcript.
const integer = (x) => Number.isSafeInteger(x) && x >= 0;
const startOf = (s) => s.start_index ?? s.Start_Index__c;
const endOf = (s) => s.end_index ?? s.End_Index__c;
const typeOf = (s) => s.segment_type ?? s.Segment_Type__c;
const textOf = (s) => s.transcript_text ?? s.Transcript_Text__c;
const stitchOf = (s) => s.stitch_open ?? s.WDE_Stitch_Open__c;

export function inspectSegmentationCoverage(segments, captionIndices, options = {}) {
  if (!Array.isArray(segments) || !Array.isArray(captionIndices) || options === null || typeof options !== 'object') {
    throw Error('INPUT_INVALID');
  }
  const findings = [];
  const expectedTotal = options.expectedTotal ?? 1620;
  if (!integer(expectedTotal) || expectedTotal === 0) throw Error('EXPECTED_TOTAL_INVALID');
  const source = new Set(captionIndices);
  if (source.size !== expectedTotal || captionIndices.some((x) => !integer(x) || x >= expectedTotal) ||
      Array.from({ length: expectedTotal }, (_, i) => i).some((i) => !source.has(i))) {
    findings.push({ code: 'SOURCE_SEQUENCE_INVALID', expectedTotal, actualUnique: source.size });
  }
  const sorted = segments.map((segment, index) => ({ segment, index, start: startOf(segment), end: endOf(segment) }))
    .sort((a, b) => Number(a.start) - Number(b.start));
  let nextStart = 0;
  for (const row of sorted) {
    const { segment, index, start, end } = row;
    if (!integer(start) || !integer(end) || end < start || end >= expectedTotal) {
      findings.push({ code: 'INVALID_SEGMENT_RANGE', index, start, end });
      continue;
    }
    if (start > nextStart) findings.push({ code: 'COVERAGE_GAP', start: nextStart, end: start - 1 });
    if (start < nextStart) findings.push({ code: 'COVERAGE_OVERLAP', index, start, previousEnd: nextStart - 1 });
    nextStart = Math.max(nextStart, end + 1);
    if (options.requireTranscript !== false && (typeof textOf(segment) !== 'string' || !textOf(segment).trim())) {
      findings.push({ code: 'TRANSCRIPT_MISSING', index });
    }
    if (typeof typeOf(segment) !== 'string' || !typeOf(segment).trim()) {
      findings.push({ code: 'SEGMENT_TYPE_MISSING', index });
    }
    if (options.requireClosedStitch !== false && stitchOf(segment) === true) {
      findings.push({ code: 'STITCH_STILL_OPEN', index });
    }
  }
  if (nextStart < expectedTotal) findings.push({ code: 'COVERAGE_GAP', start: nextStart, end: expectedTotal - 1 });
  if (!sorted.length) findings.push({ code: 'NO_SEGMENTS' });
  return { pass: findings.length === 0, findings, expectedTotal, coveredThrough: nextStart - 1,
    sourceVerifiedByCaller: false,
    note: 'Structural coverage only; source authenticity, editorial accuracy and publication rights require independent verification.' };
}

// Review routing only: never promotes a record or clears publication permissions.
// AI output is untrusted; require separately computed structural checks and source evidence.
export function inspectAiEditorialTriage({ coverage, handoffs, aiReview, sourceAuthenticated }) {
  if (!coverage || !handoffs || typeof coverage.pass !== 'boolean' || typeof handoffs.pass !== 'boolean') {
    throw Error('INPUT_INVALID');
  }
  const reasons = [];
  if (!coverage.pass) reasons.push('COVERAGE_FAILED');
  if (!handoffs.pass) reasons.push('HANDOFF_FAILED');
  if (sourceAuthenticated !== true) reasons.push('SOURCE_AUTHENTICATION_MISSING');
  if (!aiReview || typeof aiReview !== 'object' || Array.isArray(aiReview)) {
    reasons.push('AI_REVIEW_MISSING');
  } else {
    if (aiReview.verdict !== 'PASS') reasons.push('AI_REVIEW_NOT_PASS');
    if (typeof aiReview.confidence !== 'number' || !Number.isFinite(aiReview.confidence) ||
        aiReview.confidence < 0.95 || aiReview.confidence > 1) reasons.push('AI_CONFIDENCE_INSUFFICIENT');
    if (aiReview.sourceAnchored !== true || !aiReview.evidenceId?.trim?.() ||
        !aiReview.qaVersion?.trim?.()) reasons.push('AI_EVIDENCE_INCOMPLETE');
    if (aiReview.boundaryChecksPassed !== true || aiReview.crossSegmentChecksPassed !== true) {
      reasons.push('AI_BOUNDARY_UNVERIFIED');
    }
    if (!Array.isArray(aiReview.flags) || aiReview.flags.length !== 0) reasons.push('AI_FLAGS_REQUIRE_REVIEW');
  }
  return {
    route: reasons.length ? 'HUMAN_REVIEW_REQUIRED' : 'AI_EDITORIAL_CLEAR',
    reasons, editorialClear: reasons.length === 0,
    humanReviewRequired: reasons.length !== 0,
    approvalPerformed: false,
    note: 'Triage is not independent proof of accuracy, audio verification or publication rights.'
  };
}

// Fail closed: AI-clear is enough to skip routine *editorial* manual review,
// but ambiguous AI results still require a named human reviewer and adjudication.
export function inspectEditorialApprovalGate({
  coverage, handoffs, reviewer, humanAdjudicated, audioReviewed,
  rightsCleared, sourceAuthenticated, aiReview
}) {
  if (!coverage || !handoffs || typeof coverage.pass !== 'boolean' || typeof handoffs.pass !== 'boolean') {
    throw Error('INPUT_INVALID');
  }
  const blockers = [];
  if (!coverage.pass) blockers.push('COVERAGE_FAILED');
  if (sourceAuthenticated !== true) blockers.push('SOURCE_AUTHENTICATION_MISSING');
  if (!handoffs.pass) blockers.push('HANDOFF_FAILED');
  const triage = inspectAiEditorialTriage({ coverage, handoffs, aiReview, sourceAuthenticated });
  const humanReviewed = typeof reviewer === 'string' && !!reviewer.trim();
  // Backwards compatibility for already-human-reviewed cases. For new exception
  // cases a reviewer name alone is not sufficient: adjudication must be explicit.
  const editorialAccepted = triage.editorialClear ||
    (humanReviewed && (aiReview === undefined || humanAdjudicated === true));
  if (!editorialAccepted) blockers.push('EDITORIAL_REVIEW_REQUIRED');
  if (audioReviewed !== true) blockers.push('AUDIO_REVIEW_MISSING');
  if (rightsCleared !== true) blockers.push('RIGHTS_UNCLEARED');
  return {
    eligible: blockers.length === 0, blockers, approvalPerformed: false,
    editorialRoute: triage.route
  };
}
