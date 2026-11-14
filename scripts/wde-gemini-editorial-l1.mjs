import fs from 'node:fs/promises';

const API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const VIDEO = 'https://www.youtube.com/watch?v=4SPC0Ke1Eyg';
const WINDOWS = [
  { id:'w1', time:'14:17-14:43' },
  { id:'w2', time:'43:29-43:51' },
  { id:'w3', time:'45:30-45:52' },
  { id:'w4', time:'61:45-62:08' },
  { id:'w5', time:'67:04-67:28' }
];
// 14:27 and 14:33 both sit inside the first blind window.
// No timestamp in this prompt is asserted as a known transition.
const ALLOWED = new Set(['Teaching','Testimony','Prayer','Worship','Other','UNRESOLVED']);
function assert(x, message) { if (!x) throw new Error(message); }
export function buildRequest() {
  const prompt = [
    'Independently inspect actual source VIDEO+AUDIO for every listed interval. Blind editorial review:',
    'do not assume a transition is present, do not use text captions alone, and do not invent details.',
    'Find all changes among Teaching (exposition), Testimony (firsthand account), Prayer (directly addressed prayer),',
    'Worship (audibly sung praise), Other (spoken host/transitions). A spoken invitation is NOT singing or direct prayer.',
    'Intervals (video clock): '+WINDOWS.map(w=>w.id+' '+w.time).join('; ')+'.',
    'Return exactly one JSON object with "media_access_status" (ACCESSIBLE or UNAVAILABLE),',
    '"windows" (five entries): id, status (AI_L1_PROPOSED or UNRESOLVED),',
    'transitions array (time in MM:SS, before, after, reason <=200 characters),',
    'audible_evidence_summary <=200 characters, uncertainty <=120 characters.',
    'No lyrics, personal names or transcript excerpts. If you cannot really access video audio:',
    'media_access_status=UNAVAILABLE and all windows UNRESOLVED with no transitions.',
    'Do not assign any gold label or approve publication.'
  ].join('\n');
  return { contents:[{role:'user',parts:[
    {file_data:{mime_type:'video/mp4',file_uri:VIDEO}},
    {text:prompt}
  ]}], generationConfig:{temperature:0,responseMimeType:'application/json',maxOutputTokens:2200} };
}
export function sanitizeResult(parsed) {
  assert(parsed && typeof parsed==='object', 'JSON response is not object');
  assert(['ACCESSIBLE','UNAVAILABLE'].includes(parsed.media_access_status), 'Invalid media status');
  assert(Array.isArray(parsed.windows) && parsed.windows.length===WINDOWS.length, 'Unexpected windows length');
  const seen=new Set();
  const windows=parsed.windows.map(w=>{
    assert(w && WINDOWS.some(x=>x.id===w.id) && !seen.has(w.id), 'Invalid or duplicate window id');
    seen.add(w.id);
    assert(['AI_L1_PROPOSED','UNRESOLVED'].includes(w.status), 'Invalid decision');
    assert(Array.isArray(w.transitions) && w.transitions.length<=5, 'Invalid transitions');
    const transitions=w.transitions.map(t=>{
      assert(t && /^\d{2}:\d{2}$/.test(t.time) && ALLOWED.has(t.before) && ALLOWED.has(t.after), 'Invalid transition');
      return { time:t.time, before:t.before, after:t.after, reason:String(t.reason||'').slice(0,200) };
    });
    return {id:w.id,interval:WINDOWS.find(x=>x.id===w.id).time,status:w.status,
      transitions, audible_evidence_summary:String(w.audible_evidence_summary||'').slice(0,200),
      uncertainty:String(w.uncertainty||'').slice(0,120)};
  });
  if (parsed.media_access_status==='UNAVAILABLE') assert(windows.every(w=>w.status==='UNRESOLVED' && w.transitions.length===0),'Unavailable must be unresolved');
  return { media_access_status:'MODEL_REPORTED_'+parsed.media_access_status,
    model:'gemini-2.5-flash',video_id:'4SPC0Ke1Eyg',
    editorial_status:'AI_L1_PROPOSED_NOT_GOLD',windows };
}
async function main(){
  assert(process.env.GITHUB_REPOSITORY==='jimmytobing/Syntetic-Wisdom','Wrong repository');
  assert(process.env.GITHUB_REF==='refs/heads/main','Only main is allowed to execute');
  assert(process.env.WDE_FREE_TIER_ACK==='FREE_TIER_CONFIRMED','Free Tier attestation required');
  assert(process.env.WDE_RIGHTS_ACK==='REVIEW_PERMITTED','Source review permission attestation required');
  const key=process.env.WDE_GEMINI_API_KEY;
  assert(typeof key==='string' && key.length>12,'Missing Gemini API key secret');
  const response=await fetch(API,{method:'POST',redirect:'error',
    headers:{'Content-Type':'application/json','x-goog-api-key':key},
    body:JSON.stringify(buildRequest()),signal:AbortSignal.timeout(120000)});
  // No response body, API-key, prompt, raw media, or source text is printed in logs.
  if (!response.ok) throw new Error('Gemini request failed HTTP '+response.status);
  const raw=await response.json();
  const candidate=raw.candidates?.[0];
  assert(candidate?.finishReason==='STOP','Model response incomplete');
  const data=JSON.parse((candidate.content?.parts||[]).filter(p=>typeof p.text==='string').map(p=>p.text).join(''));
  const result=sanitizeResult(data);
  result.usage={prompt_tokens:Number(raw.usageMetadata?.promptTokenCount||0),
    output_tokens:Number(raw.usageMetadata?.candidatesTokenCount||0)};
  const path=process.env.RUNNER_TEMP+'/wde-gemini-l1.json';
  await fs.writeFile(path,JSON.stringify(result,null,2),{mode:0o600});
  console.log('Model response schema accepted; output saved to private short-lived artifact. Editorial status remains unapproved.');
}
if (process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href){
  main().catch(e=>{console.error('AI L1 FAILED: '+String(e.message).replace(/AIza[0-9A-Za-z_-]+/g,'[HIDDEN]'));process.exitCode=1;});
}
