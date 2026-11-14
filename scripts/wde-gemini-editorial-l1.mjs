import fs from 'node:fs/promises';

const API = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MODEL_METADATA = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash';
const MODEL = 'gemini-3.8-flash';
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
  return {model: MODEL, input: [
    {type:'video', uri:VIDEO, processing:'agentic'},
    {type:'text',text:prompt}
  ]};
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
    model:MODEL,video_id:'4SPC0Ke1Eyg',
    editorial_status:'AI_L1_PROPOSED_NOT_GOLD',windows };
}
export function extractOutputText(raw) {
  assert(raw && typeof raw==='object' && raw.status!=='failed', 'Interaction returned failed status');
  // Current Interactions API (post-May 2026) responds with model_output steps.
  const blocks=(raw.steps||[]).filter(s=>s?.type==='model_output')
    .flatMap(s=>Array.isArray(s.content)?s.content:[])
    .filter(x=>x?.type==='text' && typeof x.text==='string').map(x=>x.text);
  assert(blocks.length>0,'Interaction returned no model output text');
  return blocks.join('\\n').trim();
}
async function safeResponseError(response,stage) {
  let status='UNKNOWN';
  try {
    const body=await response.json();
    const code=String(body?.error?.status||'');
    if (/^[A-Z_]{3,40}$/.test(code)) status=code;
  } catch {}
  // Do not expose response body, user text, API key, or media.
  throw new Error(stage+' HTTP '+response.status+' '+status);
}
async function main(){
  assert(process.env.GITHUB_REPOSITORY==='jimmytobing/Syntetic-Wisdom','Wrong repository');
  assert(process.env.GITHUB_REF==='refs/heads/main','Only main is allowed to execute');
  assert(process.env.WDE_FREE_TIER_ACK==='FREE_TIER_CONFIRMED','Free Tier attestation required');
  assert(process.env.WDE_RIGHTS_ACK==='REVIEW_PERMITTED','Source review permission attestation required');
  const key=process.env.WDE_GEMINI_API_KEY;
  assert(typeof key==='string' && key.length>12,'Missing Gemini API key secret');
  const headers={'Content-Type':'application/json','x-goog-api-key':key};
  // Non-generative metadata preflight. A 200 response DOES NOT establish
  // project entitlement, zero billing, or successful video access.
  const metadata=await fetch(MODEL_METADATA,{method:'GET',redirect:'error',
    headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(15000)});
  if (!metadata.ok) await safeResponseError(metadata,'Model metadata preflight');
  const info=await metadata.json();
  assert(info?.name==='models/'+MODEL,'Unexpected model metadata identity');
  console.log('Non-generative model metadata preflight HTTP 200 (not an entitlement check).');
  // Exactly one inference request. No fallback, no automatic retry.
  const response=await fetch(API,{method:'POST',redirect:'error',headers,
    body:JSON.stringify(buildRequest()),signal:AbortSignal.timeout(180000)});
  if (!response.ok) await safeResponseError(response,'Gemini Interactions');
  const raw=await response.json();
  assert(raw?.status!=='in_progress','Unexpected async status: no polling/retry permitted');
  let payload=extractOutputText(raw);
  // Accept a common markdown JSON fence without accepting prose outside it.
  if (/^\\`\\`\\`(?:json)?\\s*[\\s\\S]*\\`\\`\\`$/i.test(payload)) {
    payload=payload.replace(/^\\`\\`\\`(?:json)?\\s*/i,'').replace(/\\s*\\`\\`\\`$/,'');
  }
  const result=sanitizeResult(JSON.parse(payload));
  result.interaction_reference=typeof raw.id==='string' && /^int_[A-Za-z0-9_-]{3,100}$/.test(raw.id)
    ? raw.id : 'NOT_RECORDED';
  const path=process.env.RUNNER_TEMP+'/wde-gemini-l1.json';
  await fs.writeFile(path,JSON.stringify(result,null,2),{mode:0o600});
  console.log('Gemini Interactions HTTP 200; response schema accepted. Editorial gold/approval remain BLOCKED.');
}
if (process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href){
  main().catch(e=>{console.error('AI L1 FAILED: '+String(e.message).replace(/AIza[0-9A-Za-z_-]+/g,'[HIDDEN]'));process.exitCode=1;});
}
