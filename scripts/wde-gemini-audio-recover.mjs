import fs from 'node:fs/promises';
import {extractOutputText,parseModelJsonPayload,sanitizeAudioProbeResult,
  validateInteractionId} from './wde-gemini-editorial-l1.mjs';

const REPO='jimmytobing/Syntetic-Wisdom';
const RUN=43552315195;
const HEADING='### WDE Request';
const MARKER='WDE_GEMINI_AUDIO_RECOVER:';
function assert(x,message){if(!x)throw new Error(message);}

export function parseAudioRecoverIssue(body){
  assert(typeof body==='string'&&body.length<100000,'Invalid Issue body');
  const lines=body.split(/\r?\n/);
  const positions=lines.flatMap((line,i)=>line.trim()===HEADING?[i]:[]);
  assert(positions.length===1,'Exactly one WDE Request heading required');
  const i=positions[0],fence=String.fromCharCode(96).repeat(3);
  assert(lines[i+1]?.trim()===fence+'json'&&lines[i+3]?.trim()===fence,
    'Expected one-line fenced JSON');
  let r;try{r=JSON.parse(lines[i+2]);}catch{throw new Error('Invalid JSON');}
  assert(r&&typeof r==='object'&&!Array.isArray(r),'Invalid request object');
  assert(Object.keys(r).sort().join(',')==='operation,requestId,sourceRunId',
    'Unexpected request fields');
  assert(r.operation==='gemini.audio_recover'&&r.sourceRunId===RUN,
    'Only existing audio probe is eligible for GET-only recovery');
  assert(typeof r.requestId==='string'&&/^wde35-[0-9]{8}-[0-9]{3,6}$/.test(r.requestId),
    'Invalid requestId');
  return r;
}
export function verifyAudioRecoverEvent(event,env){
  assert(env.GITHUB_REPOSITORY===REPO&&env.GITHUB_REF==='refs/heads/main'&&
    env.GITHUB_ACTOR==='jimmytobing','Untrusted run context');
  assert(env.GITHUB_EVENT_NAME==='issues'&&event?.action==='edited'&&
    event?.issue?.number===35&&event?.issue?.user?.login==='jimmytobing',
    'Untrusted Issue event');
  return parseAudioRecoverIssue(event.issue.body);
}
export function validateAudioReceipt(receipt){
  assert(receipt?.source==='WDE_ISSUE_35'&&receipt.model==='gemini-3.8-flash'&&
    receipt.mode==='audio_probe'&&receipt.editorial_status==='BLOCKED',
    'Wrong receipt provenance or mode');
  return validateInteractionId(receipt.interaction_id);
}
export async function claimRecover(request,{token,fetcher=fetch}){
  assert(typeof token==='string'&&token.length>12,'Missing GitHub token');
  const marker='<!-- '+MARKER+request.requestId+' -->';
  const url='https://api.github.com/repos/'+REPO+'/issues/35/comments';
  const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28'};
  for(let page=1;page<=30;page++){
    const response=await fetcher(url+'?per_page=100&page='+page,{
      method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(15000)});
    assert(response.ok,'Could not inspect existing claims');
    const comments=await response.json();
    assert(Array.isArray(comments),'Invalid comment response');
    assert(!comments.some(x=>typeof x?.body==='string'&&x.body.includes(marker)),
      'Duplicate recovery requestId');
    if(comments.length<100)break;
    assert(page<30,'Comment search cap');
  }
  const result=await fetcher(url,{method:'POST',headers:{...headers,'Content-Type':'application/json'},
    redirect:'error',signal:AbortSignal.timeout(15000),
    body:JSON.stringify({body:marker+'\nGET-only recovery of completed audio probe from run '+
      RUN+'. No new inference POST. No success claim.'})});
  assert(result.ok,'Could not claim request');
}
export async function retrieveExistingAudio({receipt,key,fetcher=fetch}){
  const id=validateAudioReceipt(receipt);
  assert(typeof key==='string'&&key.length>12,'Missing Gemini key');
  const response=await fetcher(
    'https://generativelanguage.googleapis.com/v1beta/interactions/'+encodeURIComponent(id),
    {method:'GET',redirect:'error',signal:AbortSignal.timeout(20000),
      headers:{'x-goog-api-key':key,'Api-Revision':'2026-05-20'}});
  assert(response.ok,'Existing interaction GET HTTP '+response.status);
  const raw=await response.json();
  assert(raw?.id===id,'Interaction ID mismatch');
  assert(raw.status==='completed','Existing interaction not completed');
  const result=sanitizeAudioProbeResult(parseModelJsonPayload(extractOutputText(raw)));
  // Never treat the model report alone as independently verified source audio.
  result.independently_verified_audio=false;
  result.interaction_reference='REDACTED';
  return result;
}
export async function main(env=process.env,fetcher=fetch){
  const event=JSON.parse(await fs.readFile(env.GITHUB_EVENT_PATH,'utf8'));
  const request=verifyAudioRecoverEvent(event,env);
  await claimRecover(request,{token:env.GH_TOKEN,fetcher});
  const receipt=JSON.parse(await fs.readFile(env.WDE_RECEIPT_PATH,'utf8'));
  const result=await retrieveExistingAudio({receipt,key:env.WDE_GEMINI_API_KEY,fetcher});
  await fs.writeFile(env.RUNNER_TEMP+'/wde-gemini-recovered-audio.json',
    JSON.stringify(result,null,2),{mode:0o600});
  const output=[
    '## WDE Gemini audio probe recovery — GET-only','',
    'Source run: https://github.com/'+REPO+'/actions/runs/'+RUN,
    'Request ID: '+request.requestId,
    'Recovered model response schema: PASS',
    'Source clip: 14:17-14:43 (26 seconds)',
    'Reported media access: '+result.media_access_status,
    'Reported sound: '+result.audio_observation,
    'Reported background: '+result.background_audio,
    'Reported evidence type: '+result.evidence_type,
    'Independent audio verification: NO',
    'Editorial / autoapproval: BLOCKED','',
    'Exactly one GET of the existing interaction; no new inference, no Salesforce mutations.'
  ].join('\n');
  await fs.writeFile(env.RUNNER_TEMP+'/wde-gemini-recovery-issue.md',output,{mode:0o600});
  console.log('GET-only audio recovery output sanitized. No interaction ID or raw provider text emitted.');
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
  main().catch(e=>{console.error('GET-ONLY RECOVERY FAILED: '+String(e.message));process.exitCode=1;});
