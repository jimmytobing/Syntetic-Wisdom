// Fail-closed preflight for a separate, authenticated Salesforce QA OAuth principal.
// No Apex. This module does not mutate Salesforce or issue PASS receipts.
import {createHash} from 'node:crypto';
import {verifyIndependentQaReceipt} from './wde-independent-qa-receipt.mjs';
import {deriveQaReleaseKey, inspectReleaseSnapshot} from './wde-qa-release-key.mjs';
export const WDE_QA_ORG='00Dfj00000eVCOVEA4';
const ID=/^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/;
const DIGEST=/^sha256:[0-9a-f]{64}$/;
export function assessQaOAuthRelease({
  batch,source,receipt,receiptKey,qaUserId,expectedQaUserId,
  primaryUserId,authenticatedOrgId,trustedQaVersions,now=Date.now()
}={}){
  const blockers=[];
  if(authenticatedOrgId!==WDE_QA_ORG)blockers.push('WRONG_ORG');
  if(!ID.test(qaUserId||'')||qaUserId!==expectedQaUserId||
    !ID.test(primaryUserId||'')||qaUserId===primaryUserId)blockers.push('QA_IDENTITY_NOT_INDEPENDENT');
  if(!source||source.Id!==batch?.Sermon_Source__c||
    source.Rights_Status__c!=='PermissionGranted')blockers.push('SOURCE_RIGHTS_NOT_GRANTED');
  const enrichment=batch?.Approved_Enrichment__c;
  const actualDigest=typeof enrichment==='string'&&enrichment.length?
    'sha256:'+createHash('sha256').update(enrichment,'utf8').digest('hex'):null;
  const snapshot=inspectReleaseSnapshot({
    batch,expectedSourceId:source?.Id,
    expectedDigest:actualDigest,expectedModifiedAt:batch?.LastModifiedDate
  });
  blockers.push(...snapshot.blockers);
  if(!DIGEST.test(actualDigest||''))blockers.push('ENRICHMENT_DIGEST_INVALID');
  let receiptCheck;
  try {
    receiptCheck=verifyIndependentQaReceipt({
      receipt,key:receiptKey,
      batch:{id:batch?.Id,sourceId:source?.Id,enrichmentDigest:actualDigest},now
    });
  }catch{blockers.push('RECEIPT_INVALID');}
  if(!receiptCheck?.verified)blockers.push(receiptCheck?.reason||'RECEIPT_INVALID');
  const review=receiptCheck?.verified?receiptCheck.attestation.review:null;
  if(!review||review.verdict!=='PASS'||review.sourceAnchored!==true||
    review.boundaryChecksPassed!==true||review.crossSegmentChecksPassed!==true||
    !(review.confidence>=0.95)||!Array.isArray(review.flags)||review.flags.length!==0) {
    blockers.push('QA_VERDICT_OR_SOURCE_CHECKS_FAILED');
  }
  // Formal benchmark thresholds are not required. QA provenance is still
  // independently verified by the receipt signature and deploy-owned allowlist.
  if(!Array.isArray(trustedQaVersions)||!review||
    !trustedQaVersions.includes(review.qaVersion)||
    review.qaVersion==='deterministic-transcript-review-v1')
    blockers.push('QA_VERSION_NOT_TRUSTED');
  if(blockers.length)return {ready:false,blockers:[...new Set(blockers)]};
  const releaseKey=deriveQaReleaseKey({
    orgId:WDE_QA_ORG,batchId:batch.Id,sourceId:source.Id,
    enrichmentDigest:actualDigest,qaVersion:review.qaVersion
  });
  const evidenceDigest='sha256:'+createHash('sha256')
    .update(JSON.stringify(receipt),'utf8').digest('hex');
  return {ready:true,blockers:[],input:{
    varS_BatchId:batch.Id,varS_SourceId:source.Id,
    varDT_ExpectedModifiedAt:batch.LastModifiedDate,
    varS_EnrichmentDigest:actualDigest,varS_EvidenceDigest:evidenceDigest,
    varS_QaVersion:review.qaVersion,varS_ReleaseKey:releaseKey,varS_QaVerdict:'PASS'
  }};
}
