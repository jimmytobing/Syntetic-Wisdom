// Parse the existing Salesforce WDE raw transcript contract: index;start_ms;duration_ms;text|
// Fail closed on malformed, duplicated, noncontiguous, or truncated input.
export function parseWdeRawTranscript(raw) {
  if (typeof raw !== 'string' || !raw.endsWith('|')) throw new Error('RAW_TRANSCRIPT_UNTERMINATED');
  const entries=raw.slice(0,-1).split('|');
  if(!entries.length)throw new Error('RAW_TRANSCRIPT_EMPTY');
  const captions=[];
  let prev=-1;
  for(const [position,entry] of entries.entries()){
    const parts=entry.split(';');
    if(parts.length<4)throw new Error('RAW_TRANSCRIPT_FIELD_COUNT:'+position);
    const [idx,start,duration,...textParts]=parts;
    const value=textParts.join(';');
    if(!/^(0|[1-9]\d*)$/.test(idx)||!/^(0|[1-9]\d*)$/.test(start)||!/^(0|[1-9]\d*)$/.test(duration))throw new Error('RAW_TRANSCRIPT_NUMERIC:'+position);
    const index=Number(idx),start_ms=Number(start),duration_ms=Number(duration);
    if(!Number.isSafeInteger(index)||!Number.isSafeInteger(start_ms)||!Number.isSafeInteger(duration_ms))throw new Error('RAW_TRANSCRIPT_INTEGER_RANGE:'+position);
    if(index!==prev+1)throw new Error('RAW_TRANSCRIPT_NONCONTIGUOUS:'+position);
    if(!value.trim())throw new Error('RAW_TRANSCRIPT_EMPTY_CAPTION:'+position);
    captions.push({index,start_ms,duration_ms,text:value});
    prev=index;
  }
  return captions;
}
