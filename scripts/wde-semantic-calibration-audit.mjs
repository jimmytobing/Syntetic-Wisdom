// Issue #35: candidate boundaries are triage, not human-certified gold.
// Pure read-only preparation for independent editorial calibration.
export const WDE_CALIBRATION_SOURCE_ID = 'a07fj00001F216TAAR';
export const WDE_CALIBRATION_CAPTION_COUNT = 1921;

export const provisionalBoundaryCases = Object.freeze([
  {id:'HANDOFF_186', window:[178,195], proposedBoundaries:[187,194], types:['Testimony','Worship'], reason:'Spoken invitation to praise precedes singing'},
  {id:'INTERLUDE_397', window:[389,408], proposedBoundaries:[397,401], types:['Worship','Other','Worship'], reason:'Short spoken interlude among sung lines'},
  {id:'TESTIMONY_1254', window:[1188,1263], proposedBoundaries:[1196,1254], types:['Teaching','Testimony','Teaching'], reason:'Personal emergency-prayer account transitions into teaching about Peter'},
  {id:'PRAYER_1568', window:[1550,1578], proposedBoundaries:[1560,1568], types:['Teaching','Prayer'], reason:'Exhortation begins before direct spoken prayer; category rule unresolved'},
  {id:'BLESSING_1723', window:[1705,1732], proposedBoundaries:[1713,1723], types:['Worship','Prayer','Worship'], reason:'Spoken blessing occurs between worship passages'}
].map(x=>Object.freeze({...x,window:Object.freeze(x.window),proposedBoundaries:Object.freeze(x.proposedBoundaries),types:Object.freeze(x.types),status:'PROVISIONAL'})));

const allowed = new Set(provisionalBoundaryCases.map(x=>x.id));
const validDigest=x=>typeof x==='string' && /^sha256:[a-f0-9]{64}$/.test(x);

// This is an audit/readiness report, NOT a verifier of external signatures.
// Authentication of reviewer identity, data snapshot and source digest must
// occur in a separate trusted runner. Callers must not pass LLM self-claims.
export function inspectEditorialGoldReadiness({sourceId,captionCount,cases=provisionalBoundaryCases,
  attestations=[],sourceDigest=null, trustedRunnerVerified=false}={}) {
  const findings=[];
  if(sourceId!==WDE_CALIBRATION_SOURCE_ID || captionCount!==WDE_CALIBRATION_CAPTION_COUNT)
    findings.push('SOURCE_SNAPSHOT_MISMATCH');
  if(!validDigest(sourceDigest) || trustedRunnerVerified!==true)
    findings.push('TRUSTED_SOURCE_PROVENANCE_MISSING');
  if(!Array.isArray(cases) || cases.length!==provisionalBoundaryCases.length ||
     new Set(cases.map(c=>c?.id)).size!==allowed.size || cases.some(c=>!allowed.has(c?.id)))
    findings.push('REVIEW_CASE_INVENTORY_INCOMPLETE');
  if(!Array.isArray(attestations)) findings.push('EDITORIAL_ATTESTATIONS_INVALID');
  const validAttestations=Array.isArray(attestations)?attestations:[];
  const certifiedIds=new Set();
  const globalProvenanceValid=sourceId===WDE_CALIBRATION_SOURCE_ID &&
    captionCount===WDE_CALIBRATION_CAPTION_COUNT && validDigest(sourceDigest) &&
    trustedRunnerVerified===true;
  for(const a of validAttestations) {
    if(!globalProvenanceValid || !allowed.has(a?.caseId) || a?.status!=='GOLD_VERIFIED' ||
       a?.trustedReviewerVerified!==true || a?.independentOfModel!==true ||
       a?.sourceDigest!==sourceDigest || !validDigest(sourceDigest) ||
       typeof a?.adjudicationId!=='string' || !a.adjudicationId.trim() ||
       !Array.isArray(a?.acceptedBoundaries) || !a.acceptedBoundaries.length ||
       a.acceptedBoundaries.some(n=>!Number.isSafeInteger(n)||n<1||n>=captionCount))
      findings.push('EDITORIAL_ATTESTATION_UNVERIFIED');
    else if(certifiedIds.has(a.caseId))
      findings.push('DUPLICATE_EDITORIAL_ATTESTATION');
    else certifiedIds.add(a.caseId);
  }
  const pending=provisionalBoundaryCases.filter(c=>!certifiedIds.has(c.id)).map(c=>c.id);
  if(pending.length)findings.push('EDITORIAL_GOLD_INCOMPLETE');
  // Do not calculate accuracy/false-PASS from selected conflict cases:
  // calibration needs representative, independently adjudicated AI outcomes.
  findings.push('FALSE_PASS_RATE_NOT_ESTIMABLE');
  return {status:'HUMAN_REVIEW_REQUIRED',goldCaseCount:certifiedIds.size,
    totalCandidateCases:provisionalBoundaryCases.length,pendingCases:pending,
    findingCodes:[...new Set(findings)],falsePassRate:null,
    autoApprovalAllowed:false,certifiedSemanticPass:false,
    note:'Provisional windows are biased toward disagreement; no empirical automatic PASS claim.'};
}
