// Independent editorial adjudication, source-anchored. Pure/read-only.
// A separately authenticated evaluator must produce the judgement; metadata
// supplied by the model itself does not establish provider independence.
import { createHash } from 'node:crypto';

const types = new Set(['Other','Testimony','Worship','Teaching','Prayer']);
const sha = s=>'sha256:'+createHash('sha256').update(s,'utf8').digest('hex');
const norm = s => String(s??'').normalize('NFKC').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
const typeOf = s=>s.segment_type??s.Segment_Type__c;
const startOf = s=>s.start_index??s.Start_Index__c;
const endOf = s=>s.end_index??s.End_Index__c;
const verdicts = new Set(['PASS','REVIEW','FAIL']);
const knownHandoffs = Object.freeze([
  {start:87,end:91,type:'Other'},
  {start:92,end:92,type:'Testimony'}
]);

export function adjudicateIndependentSemanticSegments({
  rawTranscript, primarySegments, independentSegments, provenance, sourceId,
  requiredEvidence='all'
}) {
  if(typeof rawTranscript!=='string' || !rawTranscript.endsWith('|') ||
     !Array.isArray(primarySegments)||!Array.isArray(independentSegments) ||
     typeof sourceId!=='string'||!sourceId.trim()) throw Error('SEMANTIC_INPUT_INVALID');
  const reasons = [];
  const sourceRows=rawTranscript.slice(0,-1).split('|');
  const captions=[];
  for(let i=0;i<sourceRows.length;i++){
    const fields=sourceRows[i].split(';');
    if(fields.length<4 || Number(fields[0])!==i || !fields.slice(3).join(';').trim())
      reasons.push('SOURCE_CAPTION_INVALID');
    captions.push(fields.slice(3).join(';'));
  }
  // These booleans MUST be set by a trusted runner after verifying separate
  // execution/provenance. The model response must never supply this object.
  if(provenance?.verifiedByTrustedRunner!==true ||
     provenance?.independentProvider!==true ||
     provenance?.sourceDigest!==sha(rawTranscript) ||
     provenance?.sourceId!==sourceId ||
     typeof provenance?.runId!=='string'||!provenance.runId.trim())
    reasons.push('INDEPENDENCE_NOT_AUTHENTICATED');
  if(primarySegments.length!==independentSegments.length || !primarySegments.length)
    reasons.push('SEGMENT_COUNT_DISAGREEMENT');
  const primary=[...primarySegments].sort((a,b)=>startOf(a)-startOf(b));
  const independent=[...independentSegments].sort((a,b)=>a.start-a.start);
  let next=0, totalChecked=0;
  const disputes=[];
  for(let i=0;i<independent.length;i++){
    const s=independent[i],p=primary[i];
    if(!Number.isSafeInteger(s.start)||!Number.isSafeInteger(s.end)||
      s.start!==next||s.end<s.start||s.end>=captions.length ||
      !types.has(s.type)||!verdicts.has(s.verdict)){
      reasons.push('INDEPENDENT_SEGMENT_INVALID');continue;
    }
    next=s.end+1;
    const startText=norm(captions[s.start]),endText=norm(captions[s.end]);
    if(!startText||!endText||norm(s.startEvidence)!==startText||
       norm(s.endEvidence)!==endText ||
       typeof s.rationale!=='string'||s.rationale.trim().length<12)
      reasons.push('SEMANTIC_EVIDENCE_NOT_GROUNDED');
    if(s.verdict!=='PASS') disputes.push({start:s.start,end:s.end,code:'INDEPENDENT_'+s.verdict});
    if(!p || startOf(p)!==s.start||endOf(p)!==s.end||typeOf(p)!==s.type)
      disputes.push({start:s.start,end:s.end,code:'PRIMARY_INDEPENDENT_DISAGREEMENT'});
    totalChecked+=s.end-s.start+1;
  }
  if(next!==captions.length || totalChecked!==captions.length)
    reasons.push('SEMANTIC_COVERAGE_INCOMPLETE');
  // Known human-reviewed source anchors constrain *both* independent and primary labels.
  if(sourceId==='a07fj00001J9PShAAN'){
    for(const anchor of knownHandoffs){
      const at=independent.find(s=>s.start<=anchor.start&&s.end>=anchor.end);
      if(!at||at.type!==anchor.type)disputes.push({
        start:anchor.start,end:anchor.end,code:'SOURCE_ANCHORED_HANDOFF_MISMATCH'
      });
    }
  }
  if(requiredEvidence!=='all') reasons.push('EVIDENCE_POLICY_UNSUPPORTED');
  const decision=reasons.length?'REVIEW':disputes.length?'FAIL':'PASS';
  return {decision,reasonCodes:[...new Set(reasons)],
    disputes,captionCount:captions.length,checkedCaptionCount:totalChecked,
    independentDecision:true,editorialScope:'TRANSCRIPT_ONLY',
    // PASS is independent transcript-level assessment, not publication approval.
    audioVerified:false,rightsCleared:false,releaseAuthorized:false,
    note:'No self-reported model confidence used. Trusted execution provenance required.'};
}
