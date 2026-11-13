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

 
// Source-scoped editorial *proposal* only; no DML and no rewriting source captions.
// Anchored to the read-only Salesforce snapshot recorded in Issue #35, 13 Nov 2026.
export function proposeOpeningBoundaryReview({ sourceId, segments, captionIndices }) {
  if (sourceId !== 'a07fj00001J9PShAAN' || !Array.isArray(segments) || !Array.isArray(captionIndices)) {
    throw Error('SOURCE_OR_INPUT_INVALID');
  }
  const indices = new Set(captionIndices);
  if (captionIndices.length !== 1620 || indices.size !== 1620 ||
      captionIndices.some((x, i) => !Number.isSafeInteger(x) || x !== i)) {
    throw Error('SOURCE_CAPTION_SEQUENCE_INVALID');
  }
  const range = (s) => [s.start_index ?? s.Start_Index__c, s.end_index ?? s.End_Index__c];
  const type = (s) => s.segment_type ?? s.Segment_Type__c;
  const byRange = (start, end) => segments.filter((s) => {
    const [a, b] = range(s);
    return a === start && b === end;
  });
  const current = byRange(15, 91);
  const alreadySplit = byRange(15, 86).length === 1 && byRange(87, 91).length === 1;
  if (alreadySplit) {
    if (type(byRange(15, 86)[0]) !== 'Testimony' || type(byRange(87, 91)[0]) !== 'Other' ||
        byRange(92, 127).length !== 1 || type(byRange(92, 127)[0]) !== 'Testimony' ||
        !inspectOpeningHandoffs(segments, captionIndices).pass) throw Error('EXISTING_BOUNDARY_UNEXPECTED');
    return { status: 'NO_CHANGE_NEEDED', proposedChanges: [], requiresHumanReview: true,
      automaticCommitAllowed: false, approvalPerformed: false };
  }
  if (segments.length !== 12 || current.length !== 1 || type(current[0]) !== 'Testimony' ||
      byRange(0, 14).length !== 1 || type(byRange(0, 14)[0]) !== 'Other' ||
      byRange(92, 127).length !== 1 || type(byRange(92, 127)[0]) !== 'Testimony') {
    throw Error('LIVE_SNAPSHOT_MISMATCH');
  }
  const expected = [[0,14],[15,91],[92,127],[128,305],[306,423],[424,475],
    [476,604],[605,1217],[1218,1288],[1289,1439],[1440,1548],[1549,1619]];
  if (expected.some(([a,b], i) => !segments.some((s) => {
    const [x,y] = range(s);
    return x === a && y === b;
  }))) throw Error('LIVE_SNAPSHOT_MISMATCH');
  const revised = segments.flatMap((s) => {
    const [a,b] = range(s);
    if (a === 15 && b === 91) {
      return [
        { start_index: 15, end_index: 86, segment_type: 'Testimony' },
        { start_index: 87, end_index: 91, segment_type: 'Other' }
      ];
    }
    return [{ start_index: a, end_index: b, segment_type: type(s) }];
  });
  if (!inspectOpeningHandoffs(revised, captionIndices).pass) throw Error('PROPOSAL_HANDOFF_FAILED');
  let cursor = 0;
  for (const s of [...revised].sort((a,b) => a.start_index - b.start_index)) {
    if (s.start_index !== cursor) throw Error('PROPOSAL_COVERAGE_INVALID');
    cursor = s.end_index + 1;
  }
  if (cursor !== 1620) throw Error('PROPOSAL_COVERAGE_INVALID');
  return {
    status: 'REVIEW_PROPOSAL',
    proposedChanges: [
      { action: 'SPLIT_EXISTING_SEGMENT', originalRange: [15,91],
        proposedRanges: [[15,86,'Testimony'],[87,91,'Other']],
        transcriptPolicy: 'REBUILD_EACH_PROPOSED_RANGE_FROM_AUTHENTIC_SOURCE_CAPTIONS' }
    ],
    requiresHumanReview: true, automaticCommitAllowed: false, approvalPerformed: false
  };
}
