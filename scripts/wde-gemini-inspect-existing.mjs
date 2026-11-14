import fs from 'node:fs/promises';

const REPO='jimmytobing/Syntetic-Wisdom';
const ISSUE=35;
const SOURCE_RUN=43545052586;
const HEADING='### WDE Gemini Inspect';
const API='https://generativelanguage.googleapis.com/v1beta/interactions/';
const CODES=new Set(['invalid_request','failed_precondition','out_of_range','parameter_unknown',
  'rate_limit_exceeded','quota_exceeded','too_many_requests','cancelled','api_error',
  'unimplemented','service_unavailable','not_found','deadline_exceeded','internal']);
const STATES=new Set(['in_progress','completed','failed','cancelled','requires_action']);
function assert(x,msg){if(!x)throw new Error(msg);}

export function parseInspectIssue(body) {
  assert(typeof body==='string' && body.length<100000,'Invalid Issue body');
  const lines=body.split(/\r?\n/);
  const positions=lines.map((s,i)=>s.trim()===HEADING?i:-1).filter(i=>i>=0);
  assert(positions.length===1,'Exactly one WDE Gemini Inspect heading required');
  const i=positions[0];
  const fence=String.fromCharCode(96).repeat(3);
  assert(lines[i+1]?.trim()===fence+'json' && lines[i+3]?.trim()===fence,
    'One-line JSON fenced request required');
  let r;try{r=JSON.parse(lines[i+2]);}catch{throw new Error('Malformed inspect JSON');}
  assert(r && typeof r==='object' && !Array.isArray(r),'Invalid inspect JSON');
  assert(Object.keys(r).sort().join(',')==='action,requestId,sourceRunId','Unexpected inspect fields');
  assert(r.action==='inspect' && r.sourceRunId===SOURCE_RUN,'Only pinned GET-only source run allowed');
  assert(typeof r.requestId==='string' &&
    /^wde35-[0-9]{8}-[0-9]{3,6}$/.test(r.requestId),'Invalid request ID');
  return r;
}
export function verifyEvent(event,repo,actor,ref) {
  assert(repo===REPO && actor==='jimmytobing' && ref==='refs/heads/main','Untrusted gateway context');
  assert(event?.action==='edited' && event?.issue?.number===ISSUE &&
    event?.issue?.user?.login==='jimmytobing','Wrong Issue/event/author');
  return parseInspectIssue(event.issue.body);
}
export function validateReceipt(r) {
  assert(r && typeof r==='object' && !Array.isArray(r),'Invalid artifact receipt');
  assert(r.source==='WDE_ISSUE_35' && r.model==='gemini-3.8-flash' &&
    r.editorial_status==='BLOCKED','Receipt provenance mismatch');
  assert(typeof r.interaction_id==='string' &&
    /^[A-Za-z0-9][A-Za-z0-9_-]{4,127}$/.test(r.interaction_id),'Unsafe interaction ID');
  return r.interaction_id;
}
export function summarizeInteraction(raw) {
  assert(raw && typeof raw==='object' && STATES.has(raw.status),'Unexpected provider status');
  const provider=raw.error ?? (Array.isArray(raw.errors)?raw.errors[0]:undefined);
  const rawCode=provider?.code;
  const safeCode=typeof rawCode==='string' && CODES.has(rawCode)?rawCode:'UNCLASSIFIED';
  const msg=typeof provider?.message==='string'?provider.message:'';
  let category='UNCLASSIFIED';
  if(/quota|rate.limit|resource.exhausted|too.many.requests/i.test(msg) ||
     ['quota_exceeded','rate_limit_exceeded','too_many_requests'].includes(safeCode))category='QUOTA_OR_RATE_LIMIT';
  else if(/video|youtube|media|agentic|source/i.test(msg))category='MEDIA_OR_VIDEO_PROCESSING';
  else if(/overload|capacity|service.unavailable|high.traffic/i.test(msg) ||
    safeCode==='service_unavailable')category='PROVIDER_CAPACITY';
  else if(/timeout|deadline|timed.out/i.test(msg) ||
    safeCode==='deadline_exceeded')category='PROVIDER_TIMEOUT';
  else if(/not.authorized|permission|auth|billing|precondition/i.test(msg) ||
    safeCode==='failed_precondition')category='AUTH_BILLING_OR_PREREQUISITE';
  else if(/invalid|unsupported|unimplemented/i.test(msg) ||
    ['invalid_request','unimplemented'].includes(safeCode))category='REQUEST_UNSUPPORTED';
  return Object.freeze({status:raw.status,provider_code:safeCode,error_category:category,
    error_present:!!provider});
}
export async function claimOnce(request,{token,fetcher=fetch}) {
  assert(typeof token==='string' && token.length>10,'GitHub token unavailable');
  const marker='<!-- WDE_GEMINI_INSPECT:'+request.requestId+' -->';
  const url='https://api.github.com/repos/'+REPO+'/issues/'+ISSUE+'/comments';
  const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28'};
  for(let page=1;page<=30;page++){
    const response=await fetcher(url+'?per_page=100&page='+page,{
      method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(15000)});
    assert(response.ok,'Cannot verify previous request claims');
    const values=await response.json();
    assert(Array.isArray(values),'Invalid Issue comments API response');
    assert(!values.some(x=>typeof x?.body==='string'&&x.body.includes(marker)),
      'Inspection already claimed; no duplicate GET');
    if(values.length<100)break;
    assert(page<30,'Comment search cap exceeded');
  }
  const response=await fetcher(url,{method:'POST',
    headers:{...headers,'Content-Type':'application/json'},
    redirect:'error',signal:AbortSignal.timeout(15000),
    body:JSON.stringify({body:marker+'\nGET-only inspect request claimed. Run: '+SOURCE_RUN+
      '. No inference POST. Request ID: '+request.requestId})});
  assert(response.ok,'Failed to claim request before GET');
}
export async function inspectExisting({receipt,key,fetcher=fetch}) {
  const id=validateReceipt(receipt);
  assert(typeof key==='string' && key.length>12,'Missing Gemini API key');
  const response=await fetcher(API+encodeURIComponent(id),{
    method:'GET',redirect:'error',
    headers:{'x-goog-api-key':key,'Api-Revision':'2026-05-20'},
    signal:AbortSignal.timeout(20000)});
  if(!response.ok) return {http_status:response.status,status:'HTTP_ERROR',
    provider_code:'UNCLASSIFIED',error_category:'UNCLASSIFIED',error_present:false};
  const raw=await response.json();
  assert(raw.id===id,'Provider interaction ID mismatch');
  return {http_status:response.status,...summarizeInteraction(raw)};
}
export async function main(env=process.env,fetcher=fetch){
  const event=JSON.parse(await fs.readFile(env.GITHUB_EVENT_PATH,'utf8'));
  const request=verifyEvent(event,env.GITHUB_REPOSITORY,env.GITHUB_ACTOR,env.GITHUB_REF);
  await claimOnce(request,{token:env.GH_TOKEN,fetcher});
  const receipt=JSON.parse(await fs.readFile(env.WDE_RECEIPT_PATH,'utf8'));
  const result=await inspectExisting({receipt,key:env.WDE_GEMINI_API_KEY,fetcher});
  const report=[
    '## WDE Gemini Inspect — GET-only','',
    'Source run: https://github.com/'+REPO+'/actions/runs/'+SOURCE_RUN,
    'Request ID: '+request.requestId,
    'HTTP: '+result.http_status,
    'Interaction status: '+result.status,
    'Provider error code: '+result.provider_code,
    'Error category: '+result.error_category,
    'Provider error object present: '+result.error_present,'',
    'No inference POST, retry, Salesforce mutation, or editorial approval.',
    'This diagnostic is not proof of media access or successful model output.'
  ].join('\n');
  await fs.writeFile(env.RUNNER_TEMP+'/wde-gemini-inspect-35.md',report,{mode:0o600});
  console.log('GET-only interaction inspection recorded. No media, interaction ID or raw provider message logged.');
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
  main().catch(e=>{console.error('WDE GET INSPECT BLOCKED: '+String(e.message));process.exitCode=1;});
