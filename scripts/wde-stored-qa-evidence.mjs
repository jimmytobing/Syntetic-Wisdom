// Read-only mapper from Salesforce Batch Run evidence storage to signed-receipt QA.
// Never treats database field presence, QA status, or a human-readable label as approval.
// The verifier still needs an independent secret, a fresh record snapshot and live Stage B output.
import { createHash } from 'node:crypto';
import { verifyIndependentQaReceipt } from './wde-independent-qa-receipt.mjs';

const isText = value => typeof value === 'string' && value.trim().length > 0;
export function inspectStoredBatchQaEvidence({
  record, enrichmentText, verificationKey, now = Date.now(),
  // Supplied only by independently authenticated/verifier-owned deployment policy.
  // Default empty: a signed PASS cannot promote an uncalibrated QA model.
  trustedQaVersions = []
}) {
  const reasons = [];
  if (!record || !isText(record.Id) || !isText(record.Sermon_Source__c)) {
    return { verified: false, reasons: ['BATCH_IDENTITY_MISSING'], attestation: null };
  }
  const digest = isText(enrichmentText)
    ? 'sha256:' + createHash('sha256').update(enrichmentText, 'utf8').digest('hex')
    : null;
  if (!digest || digest !== record.QA_Enrichment_SHA256__c ||
      enrichmentText !== record.Approved_Enrichment__c) reasons.push('ENRICHMENT_SNAPSHOT_MISMATCH');
  let receipt;
  try {
    receipt = JSON.parse(record.QA_Signed_Receipt__c);
  } catch {
    reasons.push('QA_RECEIPT_JSON_INVALID');
  }
  const batch = {
    id: record.Id, sourceId: record.Sermon_Source__c,
    enrichmentDigest: digest
  };
  let verification;
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    reasons.push('QA_RECEIPT_MISSING');
  } else {
    verification = verifyIndependentQaReceipt({ receipt, key: verificationKey, batch, now });
    if (!verification.verified) reasons.push(verification.reason);
  }
  if (record.Status__c !== 'NeedsCommitReview') reasons.push('BATCH_NOT_HELD');

  // A valid HMAC authenticates the issuer, not the truth of a semantic verdict.
  // A signed REVIEW/FAIL, uncertain PASS, or uncalibrated prototype cannot be
  // represented as a ready-to-release claim. This is read-only decision support.
  const review = verification?.verified ? verification.attestation?.review : null;
  const releaseBlockers = [...reasons];
  if (review) {
    if (review.verdict !== 'PASS') releaseBlockers.push('QA_VERDICT_NOT_PASS');
    if (review.sourceAnchored !== true ||
        review.boundaryChecksPassed !== true ||
        review.crossSegmentChecksPassed !== true) releaseBlockers.push('QA_SOURCE_OR_COVERAGE_FAILED');
    if (!Number.isFinite(review.confidence) || review.confidence < 0.95) {
      releaseBlockers.push('QA_CONFIDENCE_INSUFFICIENT');
    }
    if (!Array.isArray(review.flags) || review.flags.length > 0) {
      releaseBlockers.push('QA_UNRESOLVED_FLAGS');
    }
    if (!Array.isArray(trustedQaVersions) ||
        !trustedQaVersions.includes(review.qaVersion) ||
        review.qaVersion === 'deterministic-transcript-review-v1') {
      releaseBlockers.push('QA_SEMANTIC_CALIBRATION_NOT_VERIFIED');
    }
  } else {
    releaseBlockers.push('QA_ATTESTATION_UNAVAILABLE');
  }
  return {
    verified: reasons.length === 0,
    reasons,
    attestation: reasons.length === 0 ? verification?.attestation ?? null : null,
    // Readiness is NOT Salesforce authorization. Release still needs a trusted
    // verifier, fresh immutable snapshot, authorized release actor and replay guard.
    releaseCandidate: releaseBlockers.length === 0,
    releaseBlockers: [...new Set(releaseBlockers)],
    // Never return DML payloads, approval tokens, or automatically change statuses.
    releasePerformed: false
  };
}
