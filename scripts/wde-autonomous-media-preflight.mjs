// Machine-verifiable WDE media clearance. No per-run human acknowledgements.
// This guard is not a QA verdict or a license grant. It reads existing Salesforce
// rights only from the authenticated, immutable Developer Edition org.
export const WDE_ORG_ID='00Dfj00000eVCOVEA4';
const ORIGIN='https://hdbsf-dev-ed.develop.my.salesforce.com';
const VIDEO=/^[A-Za-z0-9_-]{11}$/;
function must(ok,reason){if(!ok)throw Error(reason);}
export function validateRightRecord({orgId,videoId,records}){
  must(orgId===WDE_ORG_ID,'ORG_NOT_VERIFIED');
  must(typeof videoId==='string'&&VIDEO.test(videoId),'VIDEO_ID_INVALID');
  must(Array.isArray(records)&&records.length===1,'RIGHTS_RECORD_NOT_UNIQUE');
  const r=records[0];
  must(r?.External_Video_Id__c===videoId,'VIDEO_RIGHTS_MISMATCH');
  must(r?.Rights_Status__c==='PermissionGranted','MEDIA_RIGHTS_NOT_GRANTED');
  return Object.freeze({orgId,videoId,sourceId:r.Id,rightsStatus:'PermissionGranted'});
}
export async function verifyWdeVideoRights({
  instanceUrl,clientId,clientSecret,videoId,fetcher=fetch
}){
  must(instanceUrl===ORIGIN,'UNTRUSTED_ORG_HOST');
  must(typeof videoId==='string'&&VIDEO.test(videoId),'VIDEO_ID_INVALID');
  must(typeof clientId==='string'&&clientId.length>0 &&
    typeof clientSecret==='string'&&clientSecret.length>0,'SF_CREDENTIALS_MISSING');
  const auth=await fetcher(ORIGIN+'/services/oauth2/token',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'client_credentials',client_id:clientId,client_secret:clientSecret}),
    redirect:'error',signal:AbortSignal.timeout(15000)
  });
  must(auth?.ok,'SF_AUTH_FAILED');
  const token=(await auth.json())?.access_token;
  must(typeof token==='string'&&token.length>10,'SF_TOKEN_MISSING');
  const read=async (query)=>{
    const u=new URL(ORIGIN+'/services/data/v68.0/query');
    u.searchParams.set('q',query);
    const resp=await fetcher(u.href,{
      method:'GET',headers:{Authorization:'Bearer '+token},
      redirect:'error',signal:AbortSignal.timeout(15000)
    });
    must(resp?.ok,'SF_READ_FAILED');
    const result=await resp.json();
    must(result?.done===true&&Array.isArray(result.records),'SF_RESPONSE_INVALID');
    return result.records;
  };
  const org=await read('SELECT Id,OrganizationType FROM Organization LIMIT 1');
  must(org.length===1&&org[0]?.Id===WDE_ORG_ID&&
    org[0]?.OrganizationType==='Developer Edition','ORG_NOT_VERIFIED');
  // videoId is regex-limited; never accept caller-provided SOQL clauses.
  const rows=await read("SELECT Id,External_Video_Id__c,Rights_Status__c FROM Sermon_Source__c WHERE External_Video_Id__c = '"+videoId+"' LIMIT 2");
  // Return only scoped nonsecret status. Never return OAuth token or credentials.
  return validateRightRecord({orgId:org[0].Id,videoId,records:rows});
}
// A bounded provider-call cap, NOT a claim that Gemini will be free of charge.
// Concurrency/claim persistence must be enforced by the trusted workflow before POST.
export function validateAutomaticCallBudget({usedToday,maxCallsPerDay}){
  must(Number.isSafeInteger(maxCallsPerDay)&&maxCallsPerDay>=1&&maxCallsPerDay<=1,
    'BUDGET_CAP_UNCONFIGURED');
  must(Number.isSafeInteger(usedToday)&&usedToday>=0,'BUDGET_COUNTER_UNTRUSTED');
  must(usedToday<maxCallsPerDay,'DAILY_CALL_BUDGET_EXHAUSTED');
  return Object.freeze({eligible:true,maxCallsPerDay,remaining:maxCallsPerDay-usedToday});
}
