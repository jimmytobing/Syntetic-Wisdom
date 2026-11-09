// Explicit per-org OAuth trust anchor; never trust an Issue supplied host/URL.
export const TARGETS = Object.freeze(["HDBSF","BFI_DEV","BFI_SIT","BFI_UAT","BFI_PROD"]);
const ID=/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/;
export function orgConfiguration(env=process.env) {
  const target=env.RCA_TARGET_ORG||"HDBSF";
  if(!TARGETS.includes(target))throw Error("Unknown Salesforce target");
  const isBfi=target!=="HDBSF";
  const expectedOrgId=isBfi?env.RCA_EXPECTED_ORG_ID:"00Dfj00000eVCOVEA4";
  const expectedUserId=isBfi?env.RCA_EXPECTED_USER_ID:"005fj00000SF7fRAAT";
  const expectedInstance=isBfi?env.RCA_EXPECTED_INSTANCE:"https://hdbsf-dev-ed.develop.my.salesforce.com";
  if(!ID.test(expectedOrgId||"")||!expectedOrgId.startsWith("00D")||
     !ID.test(expectedUserId||"")||!expectedUserId.startsWith("005"))throw Error("Expected Org/User IDs missing or malformed");
  const parsed=new URL(expectedInstance||"");
  if(parsed.protocol!=="https:"||parsed.username||parsed.password||parsed.port||parsed.search||parsed.hash||
    parsed.pathname!=="/"||!parsed.hostname.endsWith(".salesforce.com"))
    throw Error("Expected instance URL invalid");
  if(!env.SF_RCA_CLIENT_ID||!env.SF_RCA_CLIENT_SECRET||!env.SF_RCA_LOGIN_URL)
    throw Error("Target Salesforce OAuth secrets are not configured");
  const login=new URL(env.SF_RCA_LOGIN_URL);
  if(login.origin!==parsed.origin||login.pathname!=="/"||login.username||login.password||
    login.search||login.hash)throw Error("OAuth URL differs from expected instance");
  return {target,expectedOrgId,expectedUserId,instance:parsed.origin,clientId:env.SF_RCA_CLIENT_ID,clientSecret:env.SF_RCA_CLIENT_SECRET};
}

export function verifyOrgToken(token,configuration) {
  if(!token?.access_token||!token?.id||!token?.instance_url)throw Error("Incomplete Salesforce OAuth response");
  const instance=new URL(token.instance_url);
  if(instance.origin!==configuration.instance||instance.pathname!=="/"||
    instance.username||instance.password||instance.search||instance.hash)
    throw Error("Salesforce OAuth instance mismatch");
  const identity=new URL(token.id);
  const path=identity.pathname.split("/").filter(Boolean);
  if(identity.protocol!=="https:"||identity.username||identity.password||identity.port||identity.search||identity.hash||
    !new Set(["login.salesforce.com","test.salesforce.com",new URL(configuration.instance).hostname]).has(identity.hostname)||
    path.length!==3||path[0]!=="id"||path[1].slice(0,15)!==configuration.expectedOrgId.slice(0,15)||
    path[2].slice(0,15)!==configuration.expectedUserId.slice(0,15))
    throw Error("Salesforce OAuth token is not the expected org/user");
  return {accessToken:token.access_token,instance:configuration.instance,target:configuration.target};
}

export async function loginToOrg(env=process.env) {
  const conf=orgConfiguration(env);
  const result=await fetch(conf.instance+"/services/oauth2/token",{
    method:"POST",redirect:"error",
    headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({grant_type:"client_credentials",client_id:conf.clientId,client_secret:conf.clientSecret}),
    signal:AbortSignal.timeout(20000)
  });
  if(!result.ok)throw Error("OAuth refused: HTTP "+result.status);
  return verifyOrgToken(await result.json(),conf);
}
