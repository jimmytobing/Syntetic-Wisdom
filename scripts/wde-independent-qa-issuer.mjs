// Source-anchored, read-only independent QA receipt issuer prototype.
// Never signs a PASS: deterministic text checks alone cannot certify semantic editorial accuracy.
// Do not expose the signing key to Groq, Salesforce Flow users, GitHub logs, or issues.
import { createHash, createHmac } from 'node:crypto';
import { inspectSegmentationCoverage } from './wde-segmentation-acceptance.mjs';
import { inspectOpeningHandoffs } from './wde-opener-handoff-qa.mjs';
import { adjudicateIndependentSemanticSegments } from './wde-independent-semantic-decision.mjs';
import { canonicalQaReceiptPayload, QA_ORG_ID, QA_RECEIPT_VERSION } from './wde-independent-qa-receipt.mjs';

const normalize = v => String(v ?? '').toLowerCase().normalize('NFKC')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const text = v => typeof v === 'string' && v.trim().length > 0;
const startOf = s => s.Start_Index__c ?? s.start_index;
const endOf = s => s.End_Index__c ?? s.end_index;
const transcriptOf = s => s.Transcript_Text__c ?? s.transcript_text;

export function inspectOriginalCaptionText({ rawTranscript, segments, expectedTotal=null }) {
  if (!text(rawTranscript) || !rawTranscript.endsWith('|') || !Array.isArray(segments) ||
      !Number.isSafeInteger(expectedTotal) || expectedTotal < 1) {
    return {pass:false, findings:['SOURCE_INPUT_INVALID'], total:0, checked:0};
  }
  const captions=rawTranscript.slice(0,-1).split('|');
  const total=expectedTotal ?? captions.length;
  if (!Number.isSafeInteger(total) || total < 1 || captions.length !== total) {
    return {pass:false, findings:['SOURCE_COUNT_MISMATCH'], total:captions.length, checked:0};
  }
  const values=[];
  for(let i=0;i<captions.length;i++) {
    const fields=captions[i].split(';');
    if(fields.length !== 4 || Number(fields[0]) !== i || !text(fields[3])) {
      return {pass:false, findings:['SOURCE_CAPTION_FORMAT_INVALID'], total:captions.length, checked:i};
    }
    values.push(fields[3]);
  }
  const findings=[];
  let checked=0;
  for(const s of segments) {
    const start=startOf(s),end=endOf(s);
    if(!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      start<0 || end<start || end>=total) {
      findings.push('INVALID_SEGMENT_RANGE');continue;
    }
    const original=normalize(values.slice(start,end+1).join(' '));
    if (!original || original !== normalize(transcriptOf(s))) findings.push('SOURCE_TEXT_MISMATCH');
    else checked += end-start+1;
  }
  return {pass:findings.length===0 && checked===total,findings:[...new Set(findings)],
    total:captions.length,checked};
}

export function issueIndependentQaReviewReceipt({
  batch, flowResponse, rawTranscript, segments, signingKey, independentEditorial,
  now=Date.now()
}) {
  if(!batch || batch.orgId !== QA_ORG_ID || !text(batch.id) ||
    !text(batch.sourceId) || !text(batch.enrichmentDigest) ||
    batch.status !== 'NeedsCommitReview' || batch.isLatestSnapshot !== true ||
    !text(signingKey) || Buffer.byteLength(signingKey,'utf8') < 32 ||
    !Number.isSafeInteger(now)) throw Error('ISSUER_CONTEXT_INVALID');
  const flow = Array.isArray(flowResponse) && flowResponse.length===1 ? flowResponse[0]:null;
  const enriched=flow?.outputValues?.varEnrichmentLines;
  if(flow?.isSuccess !== true || flow.outputValues?.varResultStatus !== 'SUCCESS' ||
    !text(enriched) || 'sha256:'+createHash('sha256').update(enriched,'utf8').digest('hex') !== batch.enrichmentDigest) {
    throw Error('STAGE_B_SOURCE_MISMATCH');
  }
  // Derive the total from the authenticated raw snapshot rather than another video's fixed count.
  const expectedTotal=text(rawTranscript) && rawTranscript.endsWith('|')
    ? rawTranscript.slice(0,-1).split('|').length : 0;
  if(expectedTotal < 1) throw Error('SOURCE_CAPTION_COUNT_INVALID');
  const indices=Array.from({length:expectedTotal},(_,i)=>i);
  const coverage=inspectSegmentationCoverage(segments,indices,{expectedTotal});
  const textCheck=inspectOriginalCaptionText({rawTranscript,segments,expectedTotal});
  // Opening-handoff fixture is verified only for this specific 1,620-caption video.
  const handoffs=batch.sourceId==='a07fj00001J9PShAAN'
    ? inspectOpeningHandoffs(segments,indices)
    : {pass:false,findings:[{code:'SOURCE_SPECIFIC_HANDOFF_NOT_CALIBRATED'}]};
  const flags=[];
  if(!coverage.pass) flags.push('COVERAGE_FAILED');
  if(!textCheck.pass) flags.push('ORIGINAL_TEXT_MISMATCH');
  if(!handoffs.pass) flags.push('EDITORIAL_HANDOFF_FAILED');
  // Semantic PASS requires a separately authenticated, caption-grounded evaluator.
  // Even a PASS is transcript-only; empirical calibration is required for automation.
  let semantic;
  if(independentEditorial) {
    semantic = adjudicateIndependentSemanticSegments({
      rawTranscript,primarySegments:segments,
      independentSegments:independentEditorial.segments,
      provenance:independentEditorial.provenance,sourceId:batch.sourceId
    });
    if(semantic.decision !== 'PASS') flags.push('INDEPENDENT_SEMANTIC_'+semantic.decision);
  } else flags.push('INDEPENDENT_SEMANTIC_MISSING');
  if(!semantic || semantic.decision !== 'PASS') flags.push('SEMANTIC_EDITORIAL_NOT_CERTIFIED');
  // Absence of a real, separately adjudicated calibration prohibits automatic
  // AI-clear even if the independent transcript semantic verdict is PASS.
  flags.push('SEMANTIC_CALIBRATION_NOT_VERIFIED');
  const review={
    verdict:'REVIEW',
    confidence:0,sourceAnchored:textCheck.pass,
    evidenceId:'qa:'+createHash('sha256').update(batch.id+'\n'+batch.enrichmentDigest).digest('hex').slice(0,32),
    qaVersion:'deterministic-transcript-review-v1',
    boundaryChecksPassed:coverage.pass && handoffs.pass,
    crossSegmentChecksPassed:coverage.pass && textCheck.pass,
    flags
  };
  const payload={
    version:QA_RECEIPT_VERSION,orgId:QA_ORG_ID,
    sourceId:batch.sourceId,batchId:batch.id,enrichmentDigest:batch.enrichmentDigest,
    flowStatus:'SUCCESS',issuedAt:now,expiresAt:now+300000,review
  };
  const signature=createHmac('sha256',signingKey).update(canonicalQaReceiptPayload(payload)).digest('hex');
  return {receipt:{payload,signature},semanticDecision:semantic?.decision ?? 'REVIEW',
    editorialRoute:'HUMAN_REVIEW_REQUIRED',approvalPerformed:false,canWriteSalesforce:false,
    notes:'Independent transcript semantic result can be PASS/FAIL/REVIEW; empirical calibration, audio and rights remain blocked.'};
}
