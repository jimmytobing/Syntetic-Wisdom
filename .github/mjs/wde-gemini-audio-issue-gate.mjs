import fs from 'node:fs/promises';
import {verifyWdeVideoRights,validateAutomaticCallBudget} from '../../scripts/wde-autonomous-media-preflight.mjs';

const REPO='jimmytobing/Syntetic-Wisdom';
const ISSUE=54;
const VIDEO_ID='4SPC0Ke1Eyg';
const DAILY_CLAIM='WDE_GEMINI_AUTONOMOUS_CALL:';
const HEADER='### WDE Request';
const FENCE=String.fromCharCode(96).repeat(3);
const MARKER='WDE_AUDIO_PROBE_CLAIM:';
const ID=/^wde54-[0-9]{8}-[0-9]{3,6}$/;
function check(ok,message){if(!ok)throw Error(message);}

export function parseIssueAudioProbe(body){
  check(typeof body==='string'&&body.length<=100000,'Invalid Issue body');
  const lines=body.split(/\r?\n/);
  const positions=lines.flatMap((line,i)=>line.trim()===HEADER?[i]:[]);
  check(positions.length===1,'Exactly one WDE Request heading required');
  const i=positions[0];
  check(lines[i+1]?.trim()===FENCE+'json'&&lines[i+3]?.trim()===FENCE,
    'One-line fenced JSON request required');
  let data;
  try{data=JSON.parse(lines[i+2]);}catch{throw Error('Invalid JSON request');}
  check(data && typeof data==='object' && !Array.isArray(data),'Invalid JSON object');
  check(Object.keys(data).sort().join(',')==='operation,requestId,testMode',
    'Unexpected request fields');
  check(data.operation==='gemini.audio_probe' && data.testMode==='audio_probe',
    'This handler supports only the fixed audio probe');
  check(typeof data.requestId==='string'&&ID.test(data.requestId),'Invalid requestId');
  return Object.freeze({requestId:data.requestId});
}

export function verifyAudioProbeEvent(event,env){
  check(env.GITHUB_REPOSITORY===REPO && env.GITHUB_REF==='refs/heads/main',
    'Invalid repository/ref');
  check(env.GITHUB_ACTOR==='jimmytobing','Untrusted actor');
  if(env.GITHUB_EVENT_NAME==='workflow_dispatch'){
    check(['audio_probe','editorial'].includes(env.INPUT_TEST_MODE),'Invalid manual mode');
    const resume=env.INPUT_RESUME_INTERACTION_ID||'';
    check(!resume||/^[A-Za-z0-9][A-Za-z0-9_-]{4,127}$/.test(resume),
      'Invalid manual resume ID');
    return Object.freeze({source:'manual',mode:env.INPUT_TEST_MODE,resume,requestId:''});
  }
  check(env.GITHUB_EVENT_NAME==='issues'&&event?.action==='edited'&&
    event?.issue?.number===ISSUE&&event?.issue?.user?.login==='jimmytobing',
    'Untrusted Issue event/author');
  const parsed=parseIssueAudioProbe(event.issue.body);
  return Object.freeze({source:'issue',mode:'audio_probe',resume:'',
    requestId:parsed.requestId});
}

export async function claimAudioProbeRequest(request,{token,fetcher=fetch}){
  check(typeof token==='string'&&token.length>12,'Missing GitHub token');
  const marker='<!-- '+MARKER+request.requestId+' -->';
  const url='https://api.github.com/repos/'+REPO+'/issues/'+ISSUE+'/comments';
  const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28'};
  for(let page=1;page<=30;page++){
    const result=await fetcher(url+'?per_page=100&page='+page,{
      method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(15000)});
    check(result.ok,'Unable to inspect existing request claims');
    const comments=await result.json();
    check(Array.isArray(comments),'Invalid comment listing');
    check(!comments.some(item=>typeof item?.body==='string'&&item.body.includes(marker)),
      'Duplicate requestId; inference POST blocked');
    if(comments.length<100)break;
    check(page<30,'Comment search cap; fail closed');
  }
  // Claim before inference. The workflow-level concurrency group serializes
  // callers; on failure no automatic retry or second POST is allowed.
  const posted=await fetcher(url,{method:'POST',redirect:'error',headers:{
    ...headers,'Content-Type':'application/json'},
    signal:AbortSignal.timeout(15000),
    body:JSON.stringify({body:marker+'\nFixed 26s Gemini audio probe request claimed before inference. '+
      'No success implied. No credentials or source excerpt.'})});
  check(posted.ok,'Unable to claim request before inference');
}
// A one-POST/day limit is enforced via durable Issue claims under the
// workflow's serialized concurrency group. This is a call cap, not a price quote.
export async function claimDailyGeminiCall({token,runId,day,fetcher=fetch}){
  check(typeof token==='string'&&token.length>12,'GitHub claim token missing');
  check(typeof runId==='string'&&/^[0-9]{5,20}$/.test(runId),'GitHub run identity missing');
  check(typeof day==='string'&&/^\d{8}$/.test(day),'UTC day invalid');
  const url='https://api.github.com/repos/'+REPO+'/issues/'+ISSUE+'/comments';
  const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28'};
  const claims=[];
  for(let page=1;page<=30;page++){
    const res=await fetcher(url+'?per_page=100&page='+page,{
      method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(15000)});
    check(res.ok,'Unable to inspect daily provider-call claims');
    const items=await res.json();
    check(Array.isArray(items),'Invalid claim history');
    for(const x of items){
      const m=typeof x?.body==='string' ?
        x.body.match(/WDE_GEMINI_AUTONOMOUS_CALL:(\d{8}):([0-9]{5,20})/):null;
      if(m?.[1]===day)claims.push(m[2]);
    }
    if(items.length<100)break;
    check(page<30,'Daily claim audit cap reached; fail closed');
  }
  validateAutomaticCallBudget({usedToday:claims.length,maxCallsPerDay:1});
  const marker='<!-- '+DAILY_CLAIM+day+':'+runId+' -->';
  const post=await fetcher(url,{method:'POST',headers:{...headers,'Content-Type':'application/json'},
    redirect:'error',signal:AbortSignal.timeout(15000),
    body:JSON.stringify({body:marker+'\nOne bounded Gemini inference slot claimed; no success or free-tier implied.'})});
  check(post.ok,'Failed to claim bounded provider-call slot');
}
export async function prepare(env=process.env,{fetcher=fetch}={}){
  const event=JSON.parse(await fs.readFile(env.GITHUB_EVENT_PATH,'utf8'));
  const request=verifyAudioProbeEvent(event,env);
  // A fresh rights check is mandatory; prior acknowledgement is neither needed nor sufficient.
  await verifyWdeVideoRights({instanceUrl:env.SF_INSTANCE_URL,
    clientId:env.SF_CLIENT_ID,clientSecret:env.SF_CLIENT_SECRET,
    videoId:VIDEO_ID,fetcher});
  if(request.source==='issue')await claimAudioProbeRequest(request,{token:env.GH_TOKEN,fetcher});
  if(!request.resume){
    const day=new Date().toISOString().slice(0,10).replaceAll('-','');
    await claimDailyGeminiCall({token:env.GH_TOKEN,runId:env.GITHUB_RUN_ID,day,fetcher});
  }
  check(typeof env.GITHUB_ENV==='string'&&env.GITHUB_ENV.length>0,'Missing GITHUB_ENV');
  await fs.appendFile(env.GITHUB_ENV,[
    'WDE_TEST_MODE='+request.mode,
    'WDE_SOURCE_RIGHTS_VERIFIED=true',
    'WDE_PROVIDER_CALL_GUARD_VERIFIED=true',
    'WDE_RESUME_INTERACTION_ID='+request.resume
  ].join('\n')+'\n');
  console.log('WDE gateway prepared with authenticated WDE source clearance and bounded provider-call claim.');
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
  prepare().catch(e=>{console.error('WDE AUDIO GATE BLOCKED: '+String(e.message));process.exitCode=1;});
