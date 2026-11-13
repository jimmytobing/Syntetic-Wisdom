// WDE knowledge unit acceptance gate. Read-only, pure functions; no Salesforce mutations.
import { readFile } from 'node:fs/promises';
import { parseWdeRawTranscript } from './wde-raw-caption-parser.mjs';

const norm = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const words = value => norm(value).split(/\s+/).filter(Boolean).length;
const integer = value => Number.isInteger(value) && value >= 0;
const problem = (code, detail) => ({ code, detail });

export function evaluateKnowledgeUnits(payload) {
  const issues = [];
  let captions = Array.isArray(payload?.captions) ? payload.captions : [];
  if (typeof payload?.raw_transcript === 'string') {
    if (captions.length) issues.push(problem('CAPTION_SOURCE_AMBIGUOUS','Specify indexed captions or raw transcript, not both.'));
    try { captions = parseWdeRawTranscript(payload.raw_transcript); }
    catch (e) { issues.push(problem('RAW_TRANSCRIPT_INVALID',String(e.message))); captions=[]; }
  }
  const segments = Array.isArray(payload?.segments) ? payload.segments : [];
  const units = Array.isArray(payload?.units) ? payload.units : [];
  const byIndex = new Map();
  const captionIndices = [];
  for (const c of captions) {
    if (!integer(c.index) || byIndex.has(c.index)) {
      issues.push(problem('CAPTION_DUPLICATE_OR_INVALID', String(c.index)));
      continue;
    }
    byIndex.set(c.index, norm(c.text));
    captionIndices.push(c.index);
  }
  captionIndices.sort((a,b)=>a-b);
  for (let i=1;i<captionIndices.length;i++) {
    if (captionIndices[i] !== captionIndices[i-1]+1) issues.push(problem('CAPTION_GAP', `${captionIndices[i-1]}..${captionIndices[i]}`));
  }
  if (!captionIndices.length) issues.push(problem('CAPTIONS_MISSING','Cannot ground knowledge units without indexed source captions.'));
  if (!segments.length) issues.push(problem('SEGMENTS_MISSING','Provide segmentation candidates.'));
  let previousEnd = null;
  for (const [i,s] of segments.entries()) {
    if (!integer(s.start_index)||!integer(s.end_index)||s.end_index<s.start_index) {
      issues.push(problem('SEGMENT_RANGE_INVALID',String(i))); continue;
    }
    if (i===0 && captionIndices.length && s.start_index!==captionIndices[0]) issues.push(problem('SEGMENT_START_MISMATCH',String(i)));
    if (previousEnd!==null && s.start_index!==previousEnd+1) issues.push(problem('SEGMENT_GAP_OR_OVERLAP',String(i)));
    if (!norm(s.topic)||!norm(s.summary)) issues.push(problem('SEGMENT_METADATA_MISSING',String(i)));
    if (norm(s.topic).length>120||norm(s.summary).length>180) issues.push(problem('SEGMENT_METADATA_TOO_LONG',String(i)));
    previousEnd=s.end_index;
  }
  if (segments.length && captionIndices.length && previousEnd!==captionIndices.at(-1)) issues.push(problem('SEGMENT_END_MISMATCH',String(previousEnd)));
  const reports = units.map((u,i)=>{
    if (!u || typeof u !== 'object' || Array.isArray(u)) {
      return {id:String(i),spoken_words:0,status:'NEEDS_REVIEW',issues:[problem('UNIT_INVALID',String(i))]};
    }
    const failures=[];
    const id = norm(u.id)||String(i);
    if (!integer(u.source_start_index)||!integer(u.source_end_index)||u.source_start_index>u.source_end_index ||
      !captionIndices.length || u.source_start_index<captionIndices[0] || u.source_end_index>captionIndices.at(-1)) {
      failures.push(problem('UNIT_RANGE_INVALID',id));
    }
    const core = ['claim','audience_need','application','original_script_45s'];
    for(const field of core) if(!norm(u[field])) failures.push(problem('UNIT_FIELD_MISSING',`${id}:${field}`));
    if (!Array.isArray(u.evidence)||!u.evidence.length) failures.push(problem('UNIT_EVIDENCE_MISSING',id));
    else for(const e of u.evidence){
      if (!e || typeof e !== 'object' || Array.isArray(e)) { failures.push(problem('EVIDENCE_INVALID',id)); continue; }
      const actual=byIndex.get(e.index);
      if (!integer(e.index)||!integer(u.source_start_index)||!integer(u.source_end_index)||
          e.index<u.source_start_index||e.index>u.source_end_index||!actual||
          !norm(e.quote)||!actual.toLocaleLowerCase('id').includes(norm(e.quote).toLocaleLowerCase('id'))) {
        failures.push(problem('EVIDENCE_NOT_GROUNDED',`${id}:${e.index}`));
      }
    }
    const containingSegments=segments.filter(s=>integer(s.start_index)&&integer(s.end_index)&&integer(u.source_start_index)&&integer(u.source_end_index)&&u.source_start_index>=s.start_index&&u.source_end_index<=s.end_index);
    if (containingSegments.length!==1) failures.push(problem('UNIT_CROSSES_SEGMENTS',id));
    const spokenWords=words(u.original_script_45s);
    // 45 s at ~120-155 words/min => about 90-116 words. Use wide editorial envelope.
    if (spokenWords<85||spokenWords>120) failures.push(problem('SCRIPT_LENGTH_REVIEW',`${id}:${spokenWords} words`));
    // Deterministic validation does NOT establish semantic correctness.
    const reviewed=u.human_review==='approved' && norm(u.reviewer) && norm(u.review_notes);
    if (!reviewed) failures.push(problem('SOURCE_EDITORIAL_REVIEW_REQUIRED',id));
    // Self-reported reviewer fields cannot authenticate source-audio, editorial, rights or timing review.
    return {id,spoken_words:spokenWords,status:failures.length?'NEEDS_REVIEW':'STRUCTURALLY_VALID_PENDING_INDEPENDENT_REVIEW',issues:failures};
  });
  if (!units.length) issues.push(problem('UNITS_MISSING','No independently grounded knowledge units supplied.'));
  return {status:issues.length||reports.some(r=>r.issues.length)?'BLOCKED':'STRUCTURALLY_VALID_PENDING_INDEPENDENT_REVIEW',structural_issues:issues,unit_reports:reports,
    disclaimer:'Mechanical gate and human acknowledgment do not prove theological accuracy, source audio fidelity, rights clearance, or publishability.'};
}

if(process.argv[1]?.endsWith('/wde-knowledge-qa.mjs')){
  const path=process.argv[2];
  if(!path){console.error('Usage: node scripts/wde-knowledge-qa.mjs <candidate.json>');process.exitCode=2;}
  else{
    try {
      const data=JSON.parse(await readFile(path,'utf8'));
      const report=evaluateKnowledgeUnits(data);
      console.log(JSON.stringify(report,null,2));
      if(report.status==='BLOCKED')process.exitCode=1;
    }catch(e){console.error('QA input error:',e.message);process.exitCode=2;}
  }
}
