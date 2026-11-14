import fs from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';

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
  return {model: MODEL, background:true, input: [
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
  return blocks.join('\n').trim();
}
// Error data is UNTRUSTED: never forward provider messages, headers or bodies.
// Return only a bounded, hard-coded diagnostic classification.
export function classifyProviderError(message) {
  if (typeof message!=='string') return 'UNCLASSIFIED';
  if (/overloaded|overload|capacity|temporar(?:y|ily) unavailable|high demand|high traffic|busy/i.test(message)) return 'CAPACITY_OR_TEMPORARY_UNAVAILABLE';
  if (/timeout|timed out|deadline exceeded/i.test(message)) return 'PROVIDER_TIMEOUT';
  if (/quota|rate limit|resource exhausted|too many requests/i.test(message)) return 'QUOTA_OR_RATE_LIMIT';
  if (/youtube|video processing|media inaccessible|cannot access video/i.test(message)) return 'VIDEO_ACCESS_OR_PROCESSING';
  if (/permission|not authorized|api key|authentication/i.test(message)) return 'AUTH_OR_PERMISSION';
  if (/not found|unsupported|not available/i.test(message)) return 'RESOURCE_UNAVAILABLE';
  return 'UNCLASSIFIED';
}
export function safeErrorDiagnostic(httpStatus,body,retryAfter) {
  const status=String(body?.error?.status||'');
  const safeStatus=/^[A-Z_]{3,40}$/.test(status)?status:'UNKNOWN';
  const code=Number(body?.error?.code);
  const safeCode=Number.isInteger(code) && code>=400 && code<=599?code:null;
  const reason=classifyProviderError(body?.error?.message);
  const ra=typeof retryAfter==='string' && /^\d{1,5}$/.test(retryAfter)
    ? Math.min(Number(retryAfter),3600) : null;
  return {http_status:httpStatus,provider_status:safeStatus,provider_code:safeCode,
    reason_class:reason,retry_after_seconds:ra};
}
async function safeResponseError(response,stage) {
  let body=null;
  try { body=await response.json(); } catch {}
  const detail=safeErrorDiagnostic(response.status,body,response.headers.get('retry-after'));
  // Restrict stage to a fixed internal set (not provider supplied text).
  assert(['Model metadata preflight','Gemini Interactions'].includes(stage),'Invalid error stage');
  throw new Error(stage+' '+JSON.stringify(detail));
}

// Provider interaction IDs are opaque. Never interpolate arbitrary values into URLs.
export function validateInteractionId(id) {
  assert(typeof id==='string' && /^[A-Za-z0-9][A-Za-z0-9_-]{4,127}$/.test(id),'Invalid interaction ID');
  return id;
}
export function validateInteractionStatus(interaction) {
  const state=interaction?.status;
  assert(['in_progress','completed','failed','cancelled','requires_action'].includes(state),'Unknown interaction status');
  if (state==='failed' || state==='cancelled' || state==='requires_action') {
    throw new Error('Background interaction terminal state: '+state);
  }
  return state;
}
export async function pollExistingInteraction({id,headers,initial=null,
  fetcher=fetch,wait=sleep,maxPolls=40,intervalMs=12000}) {
  validateInteractionId(id);
  assert(Number.isInteger(maxPolls) && maxPolls>=0 && maxPolls<=40,'Polling cap invalid');
  assert(Number.isInteger(intervalMs) && intervalMs>=0 && intervalMs<=12000,'Polling delay invalid');
  let current=initial;
  for(let i=0;i<=maxPolls;i++){
    if(current!==null){
      assert(current?.id===id,'Interaction ID mismatch from provider');
      if(validateInteractionStatus(current)==='completed') return current;
    }
    if(i===maxPolls) break;
    if(current!==null) await wait(intervalMs);
    const response=await fetcher(API+'/'+encodeURIComponent(id),{method:'GET',headers,
      redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!response.ok) await safeResponseError(response,'Gemini Interactions');
    current=await response.json();
  }
  throw new Error('Background still in_progress after bounded polling; resume by ID from artifact, do not create another inference');
}

async function main(){
  assert(process.env.GITHUB_REPOSITORY==='jimmytobing/Syntetic-Wisdom','Wrong repository');
  assert(process.env.GITHUB_REF==='refs/heads/main','Only main is allowed to execute');
  assert(process.env.WDE_FREE_TIER_ACK==='FREE_TIER_CONFIRMED','Free Tier attestation required');
  assert(process.env.WDE_RIGHTS_ACK==='REVIEW_PERMITTED','Source review permission attestation required');
  const key=process.env.WDE_GEMINI_API_KEY;
  assert(typeof key==='string' && key.length>12,'Missing Gemini API key secret');
  const headers={'Content-Type':'application/json','x-goog-api-key':key,'Api-Revision':'2026-05-20'};
  // Non-generative metadata preflight. A 200 response DOES NOT establish
  // project entitlement, zero billing, or successful video access.
  const metadata=await fetch(MODEL_METADATA,{method:'GET',redirect:'error',
    headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(15000)});
  if (!metadata.ok) await safeResponseError(metadata,'Model metadata preflight');
  const info=await metadata.json();
  assert(info?.name==='models/'+MODEL,'Unexpected model metadata identity');
  console.log('Non-generative model metadata preflight HTTP 200 (not an entitlement check).');
  // Background: one inference POST at most; subsequent requests are GET of the
  // SAME interaction. A manual resume ID skips POST entirely.
  const resume=String(process.env.WDE_RESUME_INTERACTION_ID||'').trim();
  let raw;
  let id;
  if(resume){
    id=validateInteractionId(resume);
    console.log('Resuming one existing interaction (GET only; zero inference POST).');
    raw=await pollExistingInteraction({id,headers});
  } else {
    const response=await fetch(API,{method:'POST',redirect:'error',headers,
      body:JSON.stringify(buildRequest()),signal:AbortSignal.timeout(30000)});
    if(!response.ok) await safeResponseError(response,'Gemini Interactions');
    const created=await response.json();
    id=validateInteractionId(created?.id);
    // Save the ID immediately, before polling, to permit resume without any
    // further inference if polling exceeds the workflow budget.
    await fs.writeFile(process.env.RUNNER_TEMP+'/wde-gemini-receipt.json',
      JSON.stringify({interaction_id:id,model:MODEL,editorial_status:'BLOCKED',source:'WDE_ISSUE_35'},null,2),{mode:0o600});
    console.log('Background interaction accepted, receipt stored in short-lived artifact.');
    raw=await pollExistingInteraction({id,headers,initial:created});
  }
  assert(raw.status==='completed','Non-completed background interaction');
  let payload=extractOutputText(raw);
  // Accept one fenced JSON block only; never parse arbitrary prose.
  if (payload.startsWith('~~~json') && payload.endsWith('~~~')) {
    payload=payload.slice(7,-3).trim();
  } else if (payload.startsWith('~~~') && payload.endsWith('~~~')) {
    payload=payload.slice(3,-3).trim();
  }
  const result=sanitizeResult(JSON.parse(payload));
  result.interaction_reference=id;
  const path=process.env.RUNNER_TEMP+'/wde-gemini-l1.json';
  await fs.writeFile(path,JSON.stringify(result,null,2),{mode:0o600});
  console.log('Gemini background interaction completed; schema accepted. Editorial gold/approval remain BLOCKED.');
}
if (process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href){
  main().catch(e=>{console.error('AI L1 FAILED: '+String(e.message).replace(/AIza[0-9A-Za-z_-]+/g,'[HIDDEN]'));process.exitCode=1;});
}
