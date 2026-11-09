import test from "node:test";
import assert from "node:assert/strict";
import {readRequest,buildPath,validateSoql} from "../scripts/salesforce-rca-universal.mjs";

function issue(json) {
  return ["### Operasi RCA","universal_read","","### Mode RCA","LIVE","","### RCA Request JSON","```json",JSON.stringify(json),"```"].join("\n");
}

test("describe global dynamic without object allowlist",() => {
  assert.equal(buildPath(readRequest(issue({action:"describe_global"}))),"/services/data/v68.0/sobjects/");
});
test("describe arbitrary custom/standard object",() => {
  assert.equal(buildPath(readRequest(issue({action:"describe_object",object:"Operation__c"}))),"/services/data/v68.0/sobjects/Operation__c/describe");
  assert.equal(buildPath(readRequest(issue({action:"tooling_describe",object:"Flow"}))),"/services/data/v68.0/tooling/sobjects/Flow/describe");
});
test("dynamic SOQL records query bounded",() => {
  const path=buildPath(readRequest(issue({action:"query",soql:"SELECT Id, Name FROM Account LIMIT 10"})));
  assert.match(decodeURIComponent(path),/SELECT Id, Name FROM Account LIMIT 10$/);
});
test("tooling flow metadata query",() => {
  const path=buildPath(readRequest(issue({action:"tooling_query",soql:"SELECT Id, DeveloperName FROM FlowDefinition LIMIT 10"})));
  assert.match(path,/\/tooling\/query\?q=/);
});
test("count SOQL supported",() => {
  assert.equal(validateSoql("SELECT COUNT() FROM Account"),"SELECT COUNT() FROM Account");
});
test("reject DML, unbounded, large-limit, multiple statements, update-for query",() => {
  for (const q of ["DELETE FROM Account","SELECT Id FROM Account","SELECT Id FROM Account LIMIT 101","SELECT Id FROM Account LIMIT 1; DELETE FROM Account","SELECT Id FROM Account FOR UPDATE LIMIT 1"]) {
    assert.throws(() => validateSoql(q),undefined,q);
  }
});
test("reject arbitrary paths, unknown actions and unexpected keys",() => {
  for (const bad of [{action:"custom",path:"/services/data"},{action:"query",soql:"SELECT COUNT() FROM Account",url:"https://evil.example"},{action:"tooling_record",object:"Flow",id:"../foo"}]) {
    assert.throws(() => buildPath(readRequest(issue(bad))));
  }
});
test("reject malformed issue request",() => {
  assert.throws(() => readRequest("### Operasi RCA\nuniversal_read"));
});
