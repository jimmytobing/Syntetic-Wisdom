// Read-only semantic handoff checks for the verified WDE _tYB8TLFizQ opener.
// Source-specific *acceptance fixture*, not a generic lexical rule. Requires the
// separately retrieved authentic indexed captions and corresponding candidate segments.
export const canonicalOpeningExpectations = Object.freeze([
  {index:87, expectedType:'Other', reason:'Host reaction to preceding testimony (87–89)'},
  {index:88, expectedType:'Other', reason:'Host exhortation, not first-person testimony'},
  {index:89, expectedType:'Other', reason:'Host prediction, not testimony evidence'},
  {index:91, expectedType:'Other', reason:'Host introduces next testimony'},
  {index:92, expectedType:'Testimony', reason:'First-person next testimony begins'}
]);
export function inspectOpeningHandoffs(segments, captionIndices) {
  const findings=[];
  if(!Array.isArray(segments)||!Array.isArray(captionIndices)) throw Error('INPUT_INVALID');
  const available=new Set(captionIndices);
  for(const ex of canonicalOpeningExpectations){
    if(!available.has(ex.index)){findings.push({index:ex.index,code:'SOURCE_CAPTION_MISSING'});continue;}
    const holders=segments.filter(s=>Number(s.start_index??s.Start_Index__c)<=ex.index && Number(s.end_index??s.End_Index__c)>=ex.index);
    if(holders.length!==1){findings.push({index:ex.index,code:'COVERAGE_INVALID',count:holders.length});continue;}
    const actual=holders[0].segment_type??holders[0].Segment_Type__c;
    if(actual!==ex.expectedType)findings.push({index:ex.index,code:'SPEAKER_HANDOFF_MISMATCH',actual,expected:ex.expectedType,reason:ex.reason});
  }
  return {pass:findings.length===0,findings,verifiedSourceRequired:true,
    note:'Human-reviewed transcript-caption acceptance markers; no audio/rights clearance implied.'};
}
