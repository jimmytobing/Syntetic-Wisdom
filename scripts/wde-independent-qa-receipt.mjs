// Independently issued, short-lived HMAC QA receipt verifier.
// No signing secret is stored here; caller must supply key from trusted secret store.
// A Groq response or an arbitrary Salesforce field is NOT an attestation authority.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const QA_RECEIPT_VERSION = 'WDE_QA_RECEIPT_V1';
export const QA_ORG_ID = '00Dfj00000eVCOVEA4';
const allowed = [
  'version','orgId','sourceId','batchId','enrichmentDigest','flowStatus',
  'issuedAt','expiresAt','review'
];
const reviewKeys = [
  'verdict','confidence','sourceAnchored','evidenceId','qaVersion',
  'boundaryChecksPassed','crossSegmentChecksPassed','flags'
];
const validText = x => typeof x === 'string' && x.trim() !== '';
const exactKeys = (obj, keys) => obj && typeof obj === 'object' && !Array.isArray(obj) &&
  Object.keys(obj).length === keys.length && keys.every(k => Object.hasOwn(obj,k));

export function canonicalQaReceiptPayload(p) {
  if (!exactKeys(p,allowed) || !exactKeys(p.review,reviewKeys)) {
    throw Error('QA_RECEIPT_SCHEMA_INVALID');
  }
  return JSON.stringify({
    version:p.version,orgId:p.orgId,sourceId:p.sourceId,batchId:p.batchId,
    enrichmentDigest:p.enrichmentDigest,flowStatus:p.flowStatus,
    issuedAt:p.issuedAt,expiresAt:p.expiresAt,
    review:{
      verdict:p.review.verdict,confidence:p.review.confidence,
      sourceAnchored:p.review.sourceAnchored,evidenceId:p.review.evidenceId,
      qaVersion:p.review.qaVersion,boundaryChecksPassed:p.review.boundaryChecksPassed,
      crossSegmentChecksPassed:p.review.crossSegmentChecksPassed,flags:p.review.flags
    }
  });
}

export function verifyIndependentQaReceipt({ receipt, key, batch, now = Date.now() }) {
  const fail = reason => ({verified:false,reason,attestation:null});
  if (!receipt || !batch || typeof receipt !== 'object' || !validText(key) ||
      typeof receipt.signature !== 'string' || !/^[0-9a-f]{64}$/.test(receipt.signature)) {
    return fail('QA_SIGNATURE_MISSING');
  }
  let canonical;
  try { canonical = canonicalQaReceiptPayload(receipt.payload); }
  catch { return fail('QA_RECEIPT_SCHEMA_INVALID'); }
  const p=receipt.payload;
  if (p.version !== QA_RECEIPT_VERSION || p.orgId !== QA_ORG_ID ||
      !validText(p.sourceId) || !validText(p.batchId) || !validText(p.enrichmentDigest) ||
      !validText(p.review.evidenceId) || !validText(p.review.qaVersion) ||
      !Array.isArray(p.review.flags) || p.review.flags.some(x=>!validText(x)) ||
      !Number.isFinite(p.review.confidence) ||
      p.flowStatus !== 'SUCCESS') return fail('QA_RECEIPT_CLAIMS_INVALID');
  if (p.batchId !== batch.id || p.sourceId !== batch.sourceId ||
      p.enrichmentDigest !== batch.enrichmentDigest) return fail('QA_RECEIPT_BATCH_MISMATCH');
  if (!Number.isSafeInteger(p.issuedAt) || !Number.isSafeInteger(p.expiresAt) ||
      !Number.isSafeInteger(now) || p.issuedAt > now || p.expiresAt <= now ||
      p.expiresAt - p.issuedAt > 600000 || p.expiresAt <= p.issuedAt) {
    return fail('QA_RECEIPT_EXPIRED_OR_INVALID');
  }
  const expected=createHmac('sha256',key).update(canonical).digest();
  const provided=Buffer.from(receipt.signature,'hex');
  if (provided.length !== expected.length || !timingSafeEqual(expected,provided)) {
    return fail('QA_SIGNATURE_INVALID');
  }
  return {verified:true,reason:null,attestation:{
    source:'INDEPENDENT_QA',sourceId:p.sourceId,batchId:p.batchId,
    enrichmentDigest:p.enrichmentDigest,flowStatus:p.flowStatus,review:p.review
  }};
}
