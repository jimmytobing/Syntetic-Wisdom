import assert from "node:assert/strict";
import { test } from "node:test";

import { authorizeRequest } from "../scripts/salesforce-rca-gate.mjs";

const base = {
  allowedActors: "jimmytobing",
  actor: "jimmytobing",
  eventName: "workflow_dispatch",
  dispatchOperation: "schema_wde_trend",
  ref: "refs/heads/main",
};

for (const dispatchMock of [true, false, "true", "false"]) {
  test(`RCA_MODE=mock memaksa dispatch ${String(dispatchMock)} tetap mock`, () => {
    assert.equal(
      authorizeRequest({ ...base, repositoryMode: "mock", dispatchMock }).mode,
      "mock"
    );
  });
}

for (const repositoryMode of ["mock", "live"]) {
  for (const operation of [
    "schema_wde_trend",
    "query_wde_trend_count",
    "tooling_wde_metadata",
  ]) {
    test(`Issue ${operation} selalu mock saat RCA_MODE=${repositoryMode}`, () => {
      const result = authorizeRequest({
        ...base,
        repositoryMode,
        eventName: "issues",
        issueAuthor: "jimmytobing",
        issueLabel: "salesforce-rca-approved",
        issueBody: `### Operasi RCA\n\n${operation}\n\n### Konteks\n\nMock`,
      });
      assert.equal(result.mode, "mock");
    });
  }
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

test("permintaan live dipaksa mock jika RCA_MODE bukan live", () => {
  assert.equal(
    authorizeRequest({ ...base, repositoryMode: "mock", dispatchMock: false }).mode,
    "mock"
  );
});

test("live ditolak untuk actor selain jimmytobing meskipun ada di allowlist", () => {
  assert.throws(
    () =>
      authorizeRequest({
        ...base,
        allowedActors: "jimmytobing,maintainer",
        actor: "maintainer",
        repositoryMode: "live",
        dispatchMock: false,
      }),
    /actor bukan pemilik/
  );
});

test("live ditolak jika ref bukan main", () => {
  assert.throws(
    () =>
      authorizeRequest({
        ...base,
        repositoryMode: "live",
        dispatchMock: false,
        ref: "refs/heads/feat/untrusted",
      }),
    /dijalankan dari main/
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

test("Legacy RCA runtime stays retired; gateway workflows are owned by WDE", async () => {
  const { access } = await import("node:fs/promises");
  await assert.rejects(access(".github/workflows/salesforce-rca.yml"), /ENOENT/);
});
