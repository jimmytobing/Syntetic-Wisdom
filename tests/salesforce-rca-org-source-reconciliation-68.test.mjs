import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../force-app/main/default/${path}`, import.meta.url), "utf8");
const flow = (name) => read(`flows/${name}.flow-meta.xml`);
const field = (object, name) => read(`objects/${object}/fields/${name}.field-meta.xml`);

test("PR #68 captures the existing orchestrator and does not promote QA flows", () => {
  const orchestrator = flow("WDE_Orchestrator_Weekly_Sermon");
  assert.match(orchestrator, /<status>Active<\/status>/);
  assert.match(orchestrator, /<actionName>WDEYouTubePlaylist\.playlistItems<\/actionName>/);
  assert.match(orchestrator, /<object>Sermon_Source__c<\/object>/);
  for (const name of ["WDE_Get_Editorial_Audio_Context", "WDE_QA_OAuth_Commit_Release"]) {
    assert.match(flow(name), /<status>Draft<\/status>/, name);
    assert.doesNotMatch(flow(name), /<status>Active<\/status>/, name);
  }
});

test("QA OAuth release remains permission-gated and protects the immutable journal", () => {
  const release = flow("WDE_QA_OAuth_Commit_Release");
  assert.match(release, /\$Permission\.WDE_QA_Commit_Release/);
  assert.match(release, /<runInMode>SystemModeWithSharing<\/runInMode>/);
  assert.match(release, /<name>Create_Claim<\/name>/);
  assert.match(release, /<name>Commit_Claim<\/name>/);
  for (const name of ["Release_Key__c", "Batch_Claim_Key__c"]) {
    const key = field("WDE_QA_Release__c", name);
    assert.match(key, /<unique>true<\/unique>/, name);
    assert.match(key, /<externalId>true<\/externalId>/, name);
    assert.match(key, /<required>true<\/required>/, name);
  }
  const object = read("objects/WDE_QA_Release__c/WDE_QA_Release__c.object-meta.xml");
  assert.match(object, /<sharingModel>Private<\/sharingModel>/);
  const rule = read("objects/WDE_QA_Release__c/validationRules/Require_Actual_QA_Commit.validationRule-meta.xml");
  assert.match(rule, /<active>true<\/active>/);
  assert.match(rule, /Batch_Run__r\.Status__c/);
});

test("all scope-limited Org-only fields and QA release fields are retained", () => {
  const fields = {
    Sermon_Source__c: ["Raw_Transcript_Text__c", "Transcript_Caption_Count__c", "Transcript_Character_Count__c"],
    Sermon_Segment__c: ["WDE_Stitch_Open__c"],
    WDE_Batch_Run__c: ["Auto_Next_Enabled__c"],
    WDE_QA_Release__c: [
      "Authority_Reference__c", "Batch_Claim_Key__c", "Batch_Run__c",
      "Consumed_At__c", "Evidence_Digest__c", "QA_Version__c",
      "Release_Key__c", "Release_Status__c",
    ],
  };
  for (const [object, names] of Object.entries(fields)) {
    for (const name of names) {
      const xml = field(object, name);
      assert.match(xml, /<CustomField\b/, `${object}.${name}`);
      assert.ok(xml.includes(`<fullName>${name}</fullName>`), `${object}.${name}`);
    }
  }
});
