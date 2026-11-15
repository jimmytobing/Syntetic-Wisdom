// Deterministic replay key for WDE_QA_Release__c.Release_Key__c.
// This is NOT an authorization token or a replacement for authenticated identity.
// The trusted Salesforce release transaction must CREATE the journal row (not UPSERT)
// in the same atomic flow as its guarded status transition, failing on duplicate key.
import {createHash} from 'node:crypto';
const WDE_ORG_ID='00Dfj00000eVCOVEA4';
const salesforceId=/^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/;
const sha=/^sha256:[0-9a-f]{64}$/;
const version=/^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/;
export function deriveQaReleaseKey({orgId,batchId,sourceId,enrichmentDigest,qaVersion}={}){
  if(orgId!==WDE_ORG_ID||!salesforceId.test(batchId||'')||
    !salesforceId.test(sourceId||'')||!sha.test(enrichmentDigest||'')||
    !version.test(qaVersion||''))throw Error('RELEASE_IDENTITY_INVALID');
  const canonical=['WDE-QA-RELEASE-V1',orgId,batchId,sourceId,enrichmentDigest,qaVersion].join('|');
  return createHash('sha256').update(canonical,'utf8').digest('hex');
}
export function inspectReleaseSnapshot({batch,expectedSourceId,expectedDigest,expectedModifiedAt}={}){
  const blockers=[];
  if(!batch||!salesforceId.test(batch.Id||'')||
    batch.Status__c!=='NeedsCommitReview')blockers.push('BATCH_NOT_HELD');
  if(batch?.Sermon_Source__c!==expectedSourceId)blockers.push('SOURCE_MISMATCH');
  if(!sha.test(expectedDigest||'')||
    batch?.QA_Enrichment_SHA256__c!==expectedDigest)blockers.push('ENRICHMENT_MISMATCH');
  if(typeof expectedModifiedAt!=='string'||!expectedModifiedAt||
    batch?.LastModifiedDate!==expectedModifiedAt)blockers.push('STALE_SNAPSHOT');
  return {eligible:!blockers.length,blockers,releasePerformed:false};
}
