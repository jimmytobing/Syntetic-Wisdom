// Non-mutating decision support for WDE Batch Stage B -> Stage C.
// A true result NEVER constitutes a Salesforce authorization or API instruction.
// Caller MUST independently verify the source/record version and QA provenance.
// Do not call this with a Groq-generated "qa" attestation as the evidence authority.
import { triageStageBFlowResponse } from './wde-flow-editorial-adapter.mjs';
import { createHash } from 'node:crypto';
import { verifyIndependentQaReceipt } from './wde-independent-qa-receipt.mjs';

const value = (s) => typeof s === 'string' && s.trim().length > 0;
export function inspectCommitReleaseReadiness({
  batch, flowResponse, coverage, handoffs, sourceAuthenticated,
  independentlyVerifiedAiReview, humanAdjudication, signedQaReceipt, qaReceiptKey, now
}) {
  if (!batch || typeof batch !== 'object' || Array.isArray(batch) ||
      !value(batch.id) || !value(batch.sourceId) || !value(batch.enrichmentDigest)) {
    throw Error('BATCH_SNAPSHOT_REQUIRED');
  }
  const reasons = [];
  const responses = Array.isArray(flowResponse) ? flowResponse :
    (Array.isArray(flowResponse?.result?.body) ? flowResponse.result.body : flowResponse?.body);
  const enrichment = Array.isArray(responses) && responses.length === 1 ?
    responses[0]?.outputValues?.varEnrichmentLines : undefined;
  const computedDigest = typeof enrichment === 'string' ?
    'sha256:' + createHash('sha256').update(enrichment, 'utf8').digest('hex') : null;
  if (!/^sha256:[0-9a-f]{64}$/.test(batch.enrichmentDigest) ||
      computedDigest !== batch.enrichmentDigest) reasons.push('ENRICHMENT_DIGEST_MISMATCH');
  if (batch.status !== 'NeedsCommitReview') reasons.push('BATCH_NOT_HELD_FOR_REVIEW');
  if (batch.isLatestSnapshot !== true) reasons.push('BATCH_SNAPSHOT_NOT_VERIFIED');
  // Reject the old unsigned caller-provided attestation; it can be forged.
  // Trust only a HMAC receipt issued by a separate QA authority.
  const verified = verifyIndependentQaReceipt({
    receipt:signedQaReceipt,key:qaReceiptKey,batch,
    ...(now === undefined ? {} : {now})
  });
  const attestation = verified.verified ? verified.attestation : undefined;
  if (!verified.verified) reasons.push(verified.reason);
  const triage = triageStageBFlowResponse({
    flowResponse, coverage, handoffs, sourceAuthenticated,
    sourceId: batch.sourceId, independentlyVerifiedAiReview: attestation
  });
  if (triage.route !== 'AI_EDITORIAL_CLEAR') {
    const human = humanAdjudication;
    if (!human || human.verdict !== 'APPROVE' || !value(human.reviewerId) ||
        !value(human.evidenceId) || human.batchId !== batch.id ||
        human.enrichmentDigest !== batch.enrichmentDigest ||
        human.sourceId !== batch.sourceId) {
      reasons.push('EXCEPTION_ADJUDICATION_REQUIRED');
    }
  }
  // Never permit human signoff to override failed structure/source/Flow execution.
  if (coverage?.pass !== true) reasons.push('COVERAGE_FAILED');
  if (handoffs?.pass !== true) reasons.push('HANDOFF_FAILED');
  if (sourceAuthenticated !== true) reasons.push('SOURCE_AUTHENTICATION_MISSING');
  if (!triage.stageBSuccess) reasons.push('STAGE_B_NOT_SUCCESS');

  return {
    decision: reasons.length ? 'REMAIN_NEEDS_COMMIT_REVIEW' : 'RELEASE_CANDIDATE_ONLY',
    blockers: [...new Set(reasons)],
    editorialRoute: triage.route,
    wouldRequireHumanReview: triage.route !== 'AI_EDITORIAL_CLEAR',
    // There is no authenticated per-batch QA receipt stored in current Salesforce
    // schema; release must not be applied until a separate authorized gate exists.
    canWriteSalesforce: false, flowActivationAuthorized: false,
    publishAuthorized: false, note: 'Dry-run recommendation only; source-bound evidence is not cryptographic proof.'
  };
}
