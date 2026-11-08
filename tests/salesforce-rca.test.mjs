import assert from "node:assert/strict";
import { test } from "node:test";

import { execute, summarizeCount } from "../scripts/salesforce-rca.mjs";

test("COUNT totalSize=7 menghasilkan recordCount 7", () => {
  assert.deepEqual(summarizeCount({ totalSize: 7, done: true, records: [] }), {
    object: "WDE_Audience_Trend__c",
    recordCount: 7,
  });
});

test("COUNT totalSize=0 menghasilkan recordCount 0", () => {
  assert.equal(summarizeCount({ totalSize: 0, done: true, records: [] }).recordCount, 0);
});

test("COUNT tanpa totalSize ditolak", () => {
  assert.throws(() => summarizeCount({ done: true, records: [] }), /tidak memiliki totalSize/);
});

for (const invalid of [-1, 1.5, "7", null, Number.NaN]) {
  test(`COUNT menolak totalSize tidak valid: ${String(invalid)}`, () => {
    assert.throws(() => summarizeCount({ totalSize: invalid }), /integer non-negatif/);
  });
}

for (const operation of [
  "schema_wde_trend",
  "query_wde_trend_count",
  "tooling_wde_metadata",
]) {
  test(`mock operation ${operation}`, async () => {
    const summary = await execute(operation, true);
    assert.equal(typeof summary, "object");
  });
}
