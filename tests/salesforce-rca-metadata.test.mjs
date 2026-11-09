import test from "node:test";
import assert from "node:assert/strict";
import {validateMetadataRequest} from "../scripts/salesforce-rca-metadata.mjs";
import {readRequest} from "../scripts/salesforce-rca-universal.mjs";

const req={action:"metadata_retrieve",types:[{name:"Flow",members:["Tgr_WDE_Auto_Finalize_Summary"]}]};
const issue=(r)=>["### Operasi RCA","universal_read","","### Mode RCA","LIVE","","### RCA Request JSON",
  String.fromCharCode(96).repeat(3)+"json",JSON.stringify(r),String.fromCharCode(96).repeat(3)].join("\n");

test("Flow Metadata SOAP retrieve request is accepted",()=>{
  assert.deepEqual(validateMetadataRequest(req),req);
  assert.deepEqual(readRequest(issue(req)),req);
});
test("supports arbitrary metadata type without a hardcoded object list",()=>{
  assert.deepEqual(validateMetadataRequest({action:"metadata_retrieve",types:[{name:"CustomObject",members:["Operation__c"]}]}).types[0].members,["Operation__c"]);
});
test("rejects extra SOAP operation and unsafe metadata names",()=>{
  for(const bad of [
    {action:"metadata_deploy",types:req.types},
    {action:"metadata_retrieve",types:[{name:"Flow",members:["../../bad"]}]},
    {action:"metadata_retrieve",types:[{name:"Flow",members:["One"]}],deploy:true},
    {action:"metadata_retrieve",types:[{name:"Flow;delete",members:["One"]}]}
  ]) assert.throws(()=>validateMetadataRequest(bad));
});
test("enforces retrieval request size",()=>{
  assert.throws(()=>validateMetadataRequest({action:"metadata_retrieve",types:[]}));
  assert.throws(()=>validateMetadataRequest({action:"metadata_retrieve",types:[{name:"Flow",members:Array(21).fill("A")}]}));
});

test("metadata transport reuses existing RCA OAuth credential names",async()=>{
  const {readFileSync}=await import("node:fs");
  const source=readFileSync(new URL("../scripts/salesforce-rca-metadata.mjs",import.meta.url),"utf8");
  assert.match(source,/SF_RCA_CLIENT_ID/);
  assert.match(source,/SF_RCA_CLIENT_SECRET/);
  assert.match(source,/validateOAuthToken/);
  assert.doesNotMatch(source,/SF_META_/);
  assert.doesNotMatch(source,/<m:deploy>|<m:updateMetadata>|<m:deleteMetadata>/);
});
