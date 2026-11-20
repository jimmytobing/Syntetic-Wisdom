import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WDE_ORG_ID,validateRightRecord,validateAutomaticCallBudget,verifyWdeVideoRights
} from '../scripts/wde-autonomous-media-preflight.mjs';

const videoId='KeA9Xr9KzUI';
const good={Id:'a07fj00001K0zwEAAR',External_Video_Id__c:videoId,Rights_Status__c:'PermissionGranted'};
const input={orgId:WDE_ORG_ID,videoId,records:[good]};
test('existing PermissionGranted rights allow machine preflight (not semantic QA)',()=>{
  assert.equal(validateRightRecord(input).rightsStatus,'PermissionGranted');
});
test('never allow unknown, restricted, different video, duplicate or wrong org',()=>{
  const invalid=[
    {...input,orgId:'00D000000000000AAA'},
    {...input,records:[{...good,Rights_Status__c:'Unknown'}]},
    {...input,records:[{...good,Rights_Status__c:'Restricted'}]},
    {...input,records:[{...good,External_Video_Id__c:'4SPC0Ke1Eyg'}]},
    {...input,records:[good,good]},
    {...input,records:[]}
  ];
  for(const x of invalid)assert.throws(()=>validateRightRecord(x));
});
test('daily Gemini call cap prevents more than one invocation and is not a pricing assertion',()=>{
  assert.equal(validateAutomaticCallBudget({usedToday:0,maxCallsPerDay:1}).remaining,1);
  for(const x of [
    {usedToday:1,maxCallsPerDay:1},{usedToday:0,maxCallsPerDay:0},
    {usedToday:0,maxCallsPerDay:10},{usedToday:-1,maxCallsPerDay:1},
    {usedToday:NaN,maxCallsPerDay:1}
  ])assert.throws(()=>validateAutomaticCallBudget(x));
});
test('Salesforce rights gate verifies authenticated org AND exact source; never returns token',async()=>{
  const calls=[];
  const fetcher=async(url,options)=>{
    calls.push({url:String(url),method:options.method});
    if(String(url).endsWith('/services/oauth2/token'))
      return {ok:true,json:async()=>({access_token:'ONLY_TEST_TOKEN_NOT_REAL'})};
    const q=new URL(String(url)).searchParams.get('q');
    if(q==='SELECT Id,OrganizationType FROM Organization LIMIT 1')
      return {ok:true,json:async()=>({done:true,records:[{Id:WDE_ORG_ID,OrganizationType:'Developer Edition'}]})};
    if(q?.includes("External_Video_Id__c = '"+videoId+"'"))
      return {ok:true,json:async()=>({done:true,records:[good]})};
    throw Error('UNEXPECTED_REQUEST');
  };
  const r=await verifyWdeVideoRights({instanceUrl:'https://hdbsf-dev-ed.develop.my.salesforce.com',
    clientId:'TEST_ID',clientSecret:'TEST_SECRET',videoId,fetcher});
  assert.equal(r.sourceId,good.Id);
  assert.equal('access_token' in r,false);
  assert.equal(calls.length,3);
});
test('authenticated wrong org fails before rights are read',async()=>{
  const fetcher=async(url)=>{
    if(String(url).endsWith('/services/oauth2/token'))
      return {ok:true,json:async()=>({access_token:'ONLY_TEST_TOKEN_NOT_REAL'})};
    return {ok:true,json:async()=>({done:true,records:[{Id:'00D000000000000AAA',OrganizationType:'Developer Edition'}]})};
  };
  await assert.rejects(verifyWdeVideoRights({instanceUrl:'https://hdbsf-dev-ed.develop.my.salesforce.com',
    clientId:'TEST_ID',clientSecret:'TEST_SECRET',videoId,fetcher}),/ORG_NOT_VERIFIED/);
});
test('wrong host and malformed video IDs are rejected before authentication',async()=>{
  await assert.rejects(verifyWdeVideoRights({instanceUrl:'https://example.invalid',
    clientId:'id',clientSecret:'secret',videoId}),/UNTRUSTED_ORG_HOST/);
  await assert.rejects(verifyWdeVideoRights({instanceUrl:'https://hdbsf-dev-ed.develop.my.salesforce.com',
    clientId:'id',clientSecret:'secret',videoId:"x' OR 1=1"}),/VIDEO_ID_INVALID/);
});
