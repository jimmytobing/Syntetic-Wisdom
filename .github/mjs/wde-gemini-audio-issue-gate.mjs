import fs from 'node:fs/promises';

const REPO='jimmytobing/Syntetic-Wisdom';
const HEADER='### WDE Request';
const FENCE=String.fromCharCode(96).repeat(3);
const MARKER='WDE_AUDIO_PROBE_CLAIM:';
const ID=/^wde35-[0-9]{8}-[0-9]{3,6}$/;
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
  check(Object.keys(data).sort().join(',')==='freeTierAck,operation,requestId,rightsAck,testMode',
    'Unexpected request fields');
  check(data.operation==='gemini.audio_probe' && data.testMode==='audio_probe',
    'This handler supports only the fixed audio probe');
  check(typeof data.requestId==='string'&&ID.test(data.requestId),'Invalid requestId');
  check(data.freeTierAck==='FREE_TIER_CONFIRMED' &&
    data.rightsAck==='REVIEW_PERMITTED','Fresh explicit Free Tier and media rights acknowledgements required');
  return Object.freeze({requestId:data.requestId});
}

export function verifyAudioProbeEvent(event,env){
  check(env.GITHUB_REPOSITORY===REPO && env.GITHUB_REF==='refs/heads/main',
    'Invalid repository/ref');
  check(env.GITHUB_ACTOR==='jimmytobing','Untrusted actor');
  if(env.GITHUB_EVENT_NAME==='workflow_dispatch'){
    check(env.INPUT_FREE_TIER_ACK==='FREE_TIER_CONFIRMED' &&
      env.INPUT_RIGHTS_ACK==='REVIEW_PERMITTED','Manual acknowledgement invalid');
    check(['audio_probe','editorial'].includes(env.INPUT_TEST_MODE),'Invalid manual mode');
    const resume=env.INPUT_RESUME_INTERACTION_ID||'';
    check(!resume||/^[A-Za-z0-9][A-Za-z0-9_-]{4,127}$/.test(resume),
      'Invalid manual resume ID');
    return Object.freeze({source:'manual',mode:env.INPUT_TEST_MODE,resume,requestId:''});
  }
  check(env.GITHUB_EVENT_NAME==='issues'&&event?.action==='edited'&&
    event?.issue?.number===35&&event?.issue?.user?.login==='jimmytobing',
    'Untrusted Issue event/author');
  const parsed=parseIssueAudioProbe(event.issue.body);
  return Object.freeze({source:'issue',mode:'audio_probe',resume:'',
    requestId:parsed.requestId});
}

export async function claimAudioProbeRequest(request,{token,fetcher=fetch}){
  check(typeof token==='string'&&token.length>12,'Missing GitHub token');
  const marker='<!-- '+MARKER+request.requestId+' -->';
  const url='https://api.github.com/repos/'+REPO+'/issues/35/comments';
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
export async function prepare(env=process.env,{fetcher=fetch}={}){
  const event=JSON.parse(await fs.readFile(env.GITHUB_EVENT_PATH,'utf8'));
  const request=verifyAudioProbeEvent(event,env);
  if(request.source==='issue')await claimAudioProbeRequest(request,{token:env.GH_TOKEN,fetcher});
  check(typeof env.GITHUB_ENV==='string'&&env.GITHUB_ENV.length>0,'Missing GITHUB_ENV');
  await fs.appendFile(env.GITHUB_ENV,[
    'WDE_TEST_MODE='+request.mode,
    'WDE_FREE_TIER_ACK=FREE_TIER_CONFIRMED',
    'WDE_RIGHTS_ACK=REVIEW_PERMITTED',
    'WDE_RESUME_INTERACTION_ID='+request.resume
  ].join('\n')+'\n');
  console.log('WDE gateway prepared '+request.source+' request; inference not yet submitted.');
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href)
  prepare().catch(e=>{console.error('WDE AUDIO GATE BLOCKED: '+String(e.message));process.exitCode=1;});
