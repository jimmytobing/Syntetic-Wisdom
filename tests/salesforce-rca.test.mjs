import assert from "node:assert/strict";
import { test } from "node:test";

import {
  execute,
  markdown,
  summarizeCount,
  summarizeResponse,
  validateOAuthToken,
  safeLoginUrl,
} from "../scripts/salesforce-rca.mjs";

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

const validOAuth = {
  access_token: "unit-test-token-never-logged",
  instance_url: "https://hdbsf-dev-ed.develop.my.salesforce.com",
  id: "https://hdbsf-dev-ed.develop.my.salesforce.com/id/00Dfj00000eVCOVEA4/005fj00000SF7fRAAT",
};


test("OAuth login URL hanya menerima Developer Org RCA", () => {
  assert.equal(
    safeLoginUrl("https://hdbsf-dev-ed.develop.my.salesforce.com"),
    "https://hdbsf-dev-ed.develop.my.salesforce.com"
  );

  for (const url of [
    "https://login.salesforce.com",
    "https://test.salesforce.com",
    "https://another-org.my.salesforce.com",
    "http://hdbsf-dev-ed.develop.my.salesforce.com",
    "https://hdbsf-dev-ed.develop.my.salesforce.com/other",
    "https://hdbsf-dev-ed.develop.my.salesforce.com/?x=1",
  ]) {
    assert.throws(() => safeLoginUrl(url));
  }
});

test("OAuth mock menerima org dan instance yang diizinkan", () => {
  const result = validateOAuthToken(validOAuth);
  assert.equal(result.instance, validOAuth.instance_url);
  assert.equal(result.accessToken, validOAuth.access_token);
});


test("OAuth mock menerima Identity URL login.salesforce.com", () => {
  const result = validateOAuthToken({
    ...validOAuth,
    id: validOAuth.id.replace(
      "hdbsf-dev-ed.develop.my.salesforce.com",
      "login.salesforce.com"
    ),
  });

  assert.equal(result.instance, validOAuth.instance_url);
});

test("OAuth mock menolak User ID yang salah", () => {
  assert.throws(
    () =>
      validateOAuthToken({
        ...validOAuth,
        id: validOAuth.id.replace(
          "005fj00000SF7fRAAT",
          "005000000000001"
        ),
      }),
    /integration user yang diizinkan/
  );
});

test("OAuth mock menolak Org ID lain", () => {
  assert.throws(
    () =>
      validateOAuthToken({
        ...validOAuth,
        id: validOAuth.id.replace("00Dfj00000eVCOVEA4", "00D000000000000AAA"),
      }),
    /bukan milik Developer Org/
  );
});

test("OAuth mock menolak instance lain", () => {
  assert.throws(
    () =>
      validateOAuthToken({
        ...validOAuth,
        instance_url: "https://example.my.salesforce.com",
        id: "https://example.my.salesforce.com/id/00Dfj00000eVCOVEA4/005000000000001",
      }),
    /Developer Org RCA yang diizinkan/
  );
});

test("OAuth mock menolak respons tidak lengkap", () => {
  assert.throws(() => validateOAuthToken({ instance_url: validOAuth.instance_url }), /tidak lengkap/);
});

test("sanitization tidak membawa token atau data record mentah", () => {
  const summary = summarizeResponse("schema_wde_trend", {
    name: "WDE_Audience_Trend__c",
    label: "WDE Audience Trend",
    queryable: true,
    fields: [{ name: "Id", sensitiveValue: "raw-record-secret" }],
    access_token: "raw-access-token",
    records: [{ Email: "private@example.invalid" }],
  });
  const output = markdown("schema_wde_trend", "REST", summary, false);
  assert.doesNotMatch(output, /raw-record-secret|raw-access-token|private@example\.invalid/);
  assert.match(output, /fieldCount \| 1/);
});
