// Read-only bridge for the actual Salesforce Flow REST output shape.
// The Stage B Flow does not return confidence or independent QA evidence.
// Never infer an AI pass or spoof HumanApproved/HumanReviewed input flags.
import { inspectAiEditorialTriage } from './wde-segmentation-acceptance.mjs';

const shape = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.result?.body)) return payload.result.body;
  if (Array.isArray(payload?.body)) return payload.body;
  return null;
};

export function triageStageBFlowResponse({
  flowResponse, coverage, handoffs, sourceAuthenticated,
  sourceId, independentlyVerifiedAiReview
}) {
  if (typeof sourceId !== 'string' || !sourceId.trim()) throw Error('SOURCE_ID_REQUIRED');
  const responses = shape(flowResponse);
  const flow = responses?.length === 1 ? responses[0] : null;
  const o = flow?.outputValues;
  const stagePass = flow?.isSuccess === true && o?.varResultStatus === 'SUCCESS' &&
    typeof o?.varEnrichmentLines === 'string' && o.varEnrichmentLines.trim().length > 0;
  // AI review is NEVER sourced from the model's Stage B response itself.
  // A separate, independently evaluated, source-scoped QA must supply this evidence.
  const attested = independentlyVerifiedAiReview?.sourceId === sourceId &&
    independentlyVerifiedAiReview?.source === 'INDEPENDENT_QA' &&
    independentlyVerifiedAiReview?.flowStatus === 'SUCCESS';
  const triage = inspectAiEditorialTriage({
    coverage, handoffs, sourceAuthenticated,
    aiReview: stagePass && attested ? independentlyVerifiedAiReview.review : undefined
  });
  const reasons = [...triage.reasons];
  if (!flow) reasons.push('FLOW_RESPONSE_SHAPE_INVALID');
  else if (!stagePass) reasons.push('STAGE_B_NOT_SUCCESS');
  if (independentlyVerifiedAiReview && !attested) reasons.push('INDEPENDENT_QA_ATTESTATION_MISMATCH');
  return {
    route: reasons.length ? 'HUMAN_REVIEW_REQUIRED' : 'AI_EDITORIAL_CLEAR',
    reasons,
    stageBSuccess: stagePass,
    hasEnrichment: Boolean(o?.varEnrichmentLines?.trim?.()),
    humanReviewRequired: reasons.length > 0,
    approvalPerformed: false,
    calloutPerformed: false,
    // Deliberately do not return enriched text or allow DML instructions.
    note: 'Audit/triage only; Flow Stage B lacks independent QA confidence, do not auto-confirm.'
  };
}
