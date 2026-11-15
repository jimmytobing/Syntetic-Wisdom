// Issue #54: protected-main only, dedicated OAuth QA release client.
// This script performs Salesforce DML ONLY through the Flow. No Apex, no direct sObject mutations.
// Never run without a genuine source-bound signed PASS and separately configured OAuth credentials.
// Invoke only from a trusted main-branch workflow after code review; never from an Issue payload.
import {assessQaOAuthRelease,WDE_QA_ORG} from './wde-qa-oauth-preflight.mjs';
const host='https://hdbsf-dev-ed.develop.my.salesforce.com';
const env=process.env;
const must=(name)=>{const v=env[name];if(!v||!v.trim())throw Error(name+'_NOT_CONFIGURED');return v.trim();};
const isId=(x)=>/^[a-zA-Z0-9]{18}$/.test(x||'');
const url=(path)=>new URL(path,host);
function preflight(){
  if(env.GITHUB_REPOSITORY!=='jimmytobing/Syntetic-Wisdom'||
     env.GITHUB_REF!=='refs/heads/main'||
     !['workflow_dispatch','schedule'].includes(env.GITHUB_EVENT_NAME)||
     env.WDE_QA_RELEASE_EXECUTE!=='YES')throw Error('QA_PROTECTED_MAIN_GATE_DENIED');
  if(env.SF_INSTANCE_URL?.replace(/\/$/,'')!==host)throw Error('QA_INSTANCE_DENIED');
  const expectedQaUserId=must('WDE_QA_OAUTH_USER_ID');
  const primaryUserId=must('WDE_PRIMARY_API_USER_ID');
  if(!isId(expectedQaUserId)||!isId(primaryUserId)||
      expectedQaUserId===primaryUserId)throw Error('QA_PRINCIPAL_SEPARATION_INVALID');
  const batchId=must('WDE_QA_BATCH_ID');
  if(!isId(batchId))throw Error('QA_BATCH_ID_INVALID');
  const trustedQaVersions=must('WDE_QA_TRUSTED_VERSIONS').split(',').map(x=>x.trim())
      .filter(x=>/^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/.test(x));
  if(!trustedQaVersions.length)throw Error('QA_TRUST_POLICY_EMPTY');
  return {expectedQaUserId,primaryUserId,batchId,trustedQaVersions,
    clientId:must('WDE_QA_SF_CLIENT_ID'),clientSecret:must('WDE_QA_SF_CLIENT_SECRET'),
    receiptKey:must('WDE_QA_RECEIPT_HMAC_KEY')};
}
async function call(path,{method='GET',token,body}={}){
  const resp=await fetch(url(path),{
    method,redirect:'error',signal:AbortSignal.timeout(20000),
    headers:{'Authorization':token?'Bearer '+token:undefined,
      'Content-Type':body?'application/json':undefined},
    ...(body?{body:JSON.stringify(body)}:{})
  });
  const text=await resp.text();
  const json=text?JSON.parse(text):{};
  if(!resp.ok)throw Error('SALESFORCE_HTTP_'+resp.status);
  return json;
}
async function query(token,soql){
  const data=await call('/services/data/v68.0/query?q='+encodeURIComponent(soql),{token});
  if(data.totalSize!==1||data.records?.length!==1)throw Error('UNIQUE_RECORD_NOT_FOUND');
  return data.records[0];
}
async function main(){
  const cfg=preflight();
  const oauth=await fetch(url('/services/oauth2/token'),{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'client_credentials',
      client_id:cfg.clientId,client_secret:cfg.clientSecret})
  });
  if(!oauth.ok)throw Error('DEDICATED_QA_OAUTH_FAILED');
  const tokenPayload=await oauth.json();
  const token=tokenPayload.access_token;
  if(!token)throw Error('QA_OAUTH_TOKEN_MISSING');
  if(env.GITHUB_ACTIONS==='true')process.stdout.write('::add-mask::'+token+'\n');
  if(tokenPayload.instance_url!==host)throw Error('QA_OAUTH_WRONG_INSTANCE');
  const identity=await call('/services/oauth2/userinfo',{token});
  const qaUserId=identity.user_id,orgId=identity.organization_id;
  if(orgId!==WDE_QA_ORG||qaUserId!==cfg.expectedQaUserId)
     throw Error('QA_OAUTH_IDENTITY_MISMATCH');
  const org=await query(token,'SELECT Id, OrganizationType FROM Organization LIMIT 1');
  if(org.Id!==WDE_QA_ORG||org.OrganizationType!=='Developer Edition')
     throw Error('QA_LIVE_ORG_VERIFICATION_FAILED');
  const batch=await query(token,
    "SELECT Id,Sermon_Source__c,Status__c,LastModifiedDate,Approved_Enrichment__c,"+
    "QA_Enrichment_SHA256__c,QA_Signed_Receipt__c FROM WDE_Batch_Run__c WHERE Id = '"+
    cfg.batchId+"' LIMIT 1");
  if(!isId(batch.Sermon_Source__c))throw Error('QA_SOURCE_ID_INVALID');
  const source=await query(token,
    "SELECT Id,Rights_Status__c FROM Sermon_Source__c WHERE Id = '"+
    batch.Sermon_Source__c+"' LIMIT 1");
  let receipt;
  try{receipt=JSON.parse(batch.QA_Signed_Receipt__c);}catch{throw Error('QA_SIGNED_RECEIPT_NOT_VALID_JSON');}
  const decision=assessQaOAuthRelease({
    batch,source,receipt,receiptKey:cfg.receiptKey,qaUserId,
    expectedQaUserId:cfg.expectedQaUserId,primaryUserId:cfg.primaryUserId,
    authenticatedOrgId:org.Id,trustedQaVersions:cfg.trustedQaVersions
  });
  if(!decision.ready)throw Error('QA_RELEASE_DENIED_'+decision.blockers.join('_'));
  const input={...decision.input,
    varDT_ExpectedModifiedAt:new Date(batch.LastModifiedDate).toISOString()};
  // NO retries: ambiguous POST success must be investigated with readback, not replayed.
  const result=await call('/services/data/v68.0/actions/custom/flow/WDE_QA_OAuth_Commit_Release',{
    token,method:'POST',body:{inputs:[input]}
  });
  const flow=result?.[0];
  if(result?.length!==1||flow?.isSuccess!==true||
      flow?.outputValues?.varB_Released!==true)throw Error('QA_FLOW_NOT_COMMITTED');
  const journal=await query(token,
    "SELECT Id,Batch_Run__c,Release_Key__c,Release_Status__c,Authority_Reference__c "+
    "FROM WDE_QA_Release__c WHERE Batch_Claim_Key__c = '"+cfg.batchId+"' LIMIT 1");
  if(journal.Batch_Run__c!==cfg.batchId||
     journal.Release_Key__c!==input.varS_ReleaseKey||
     journal.Authority_Reference__c!==qaUserId||
     journal.Release_Status__c!=='Committed')throw Error('QA_COMMIT_READBACK_MISMATCH');
  console.log(JSON.stringify({result:'VERIFIED_QA_RELEASE',orgId:org.Id,
    batchId:cfg.batchId,journalId:journal.Id,releaseStatus:journal.Release_Status__c}));
}
main().catch(e=>{console.error('QA_RELEASE_BLOCKED:',String(e.message||e).slice(0,250));process.exitCode=1;});
