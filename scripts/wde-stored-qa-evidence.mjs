// Read-only mapper from Salesforce Batch Run evidence storage to signed-receipt QA.
// Never treats database field presence, QA status, or a human-readable label as approval.
// The verifier still needs an independent secret, a fresh record snapshot and live Stage B output.
import { createHash } from 'node:crypto';
import { verifyIndependentQaReceipt } from './wde-independent-qa-receipt.mjs';

const isText = value => typeof value === 'string' && value.trim().length > 0;
export function inspectStoredBatchQaEvidence({
  record, enrichmentText, verificationKey, now = Date.now()
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
  if (receipt) {
    verification = verifyIndependentQaReceipt({ receipt, key: verificationKey, batch, now });
    if (!verification.verified) reasons.push(verification.reason);
  }
  if (record.Status__c !== 'NeedsCommitReview') reasons.push('BATCH_NOT_HELD');
  return {
    verified: reasons.length === 0,
    reasons,
    attestation: reasons.length === 0 ? verification?.attestation ?? null : null,
    // Never return a DML payload or an approval decision.
    releasePerformed: false
  };
}
