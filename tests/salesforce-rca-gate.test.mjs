import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { authorizeRequest } from "../scripts/salesforce-rca-gate.mjs";

const base = {
  allowedActors: "jimmytobing",
  actor: "jimmytobing",
  eventName: "workflow_dispatch",
  dispatchOperation: "schema_wde_trend",
};

for (const dispatchMock of [true, false, "true", "false"]) {
  test(`RCA_MODE=mock memaksa dispatch ${String(dispatchMock)} tetap mock`, () => {
    assert.equal(
      authorizeRequest({ ...base, repositoryMode: "mock", dispatchMock }).mode,
      "mock"
    );
  });
}

for (const operation of [
  "schema_wde_trend",
  "query_wde_trend_count",
  "tooling_wde_metadata",
]) {
  test(`RCA_MODE=mock memaksa event Issue ${operation} tetap mock`, () => {
    const result = authorizeRequest({
      ...base,
      repositoryMode: "mock",
      eventName: "issues",
      issueAuthor: "jimmytobing",
      issueBody: `### Operasi RCA\n\n${operation}\n\n### Konteks\n\nMock`,
    });
    assert.equal(result.mode, "mock");
  });
}

test("RCA_MODE=live belum cukup jika dispatch meminta mock", () => {
  assert.equal(
    authorizeRequest({ ...base, repositoryMode: "live", dispatchMock: true }).mode,
    "mock"
  );
});

test("live hanya dipilih saat repository live dan dispatch eksplisit non-mock", () => {
  assert.equal(
    authorizeRequest({ ...base, repositoryMode: "live", dispatchMock: false }).mode,
    "live"
  );
});

test("unauthorized actor ditolak", () => {
  assert.throws(
    () => authorizeRequest({ ...base, repositoryMode: "mock", actor: "attacker" }),
    /Actor tidak diizinkan/
  );
});

test("unauthorized Issue author ditolak", () => {
  assert.throws(
    () =>
      authorizeRequest({
        ...base,
        repositoryMode: "mock",
        eventName: "issues",
        issueAuthor: "attacker",
        issueBody: "### Operasi RCA\n\nschema_wde_trend",
      }),
    /Pembuat Issue tidak diizinkan/
  );
});

test("invalid operation ditolak", () => {
  assert.throws(
    () =>
      authorizeRequest({
        ...base,
        repositoryMode: "mock",
        dispatchOperation: "SELECT Id FROM User",
      }),
    /Operasi di luar allowlist/
  );
});

for (const eventName of ["issues", "workflow_dispatch"]) {
  test(`RCA_MODE kosong ditolak untuk ${eventName}`, () => {
    assert.throws(
      () =>
        authorizeRequest({
          ...base,
          repositoryMode: "",
          eventName,
          issueAuthor: "jimmytobing",
          issueBody: "### Operasi RCA\n\nschema_wde_trend",
        }),
      /RCA_MODE harus mock atau live/
    );
  });
}

test("workflow memisahkan mock dan live serta tidak memakai pull_request_target", async () => {
  const workflow = await readFile(".github/workflows/salesforce-rca.yml", "utf8");
  assert.doesNotMatch(workflow, /pull_request_target/);
  assert.match(workflow, /^  mock:/m);
  assert.match(workflow, /^  live:/m);
  assert.match(workflow, /environment:\s*salesforce-hdbsf-rca/);
  assert.match(workflow, /secrets\.SF_RCA_ENVIRONMENT_READY/);
  assert.match(workflow, /Environment live belum dikonfigurasi lengkap/);
  assert.match(workflow, /needs\.authorize\.outputs\.mode == 'mock'/);
  assert.match(workflow, /needs\.authorize\.outputs\.mode == 'live'/);
  assert.match(workflow, /github\.event\.label\.name == 'salesforce-rca-approved'/);

  const mockJob = workflow.slice(workflow.indexOf("  mock:"), workflow.indexOf("  live:"));
  assert.doesNotMatch(mockJob, /secrets\.SF_RCA_/);
});
