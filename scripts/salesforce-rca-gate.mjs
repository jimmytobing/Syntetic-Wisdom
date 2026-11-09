#!/usr/bin/env node

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const ALLOWED_OPERATIONS = Object.freeze([
  "schema_wde_trend",
  "query_wde_trend_count",
  "tooling_wde_metadata",
]);
const LIVE_ACTOR = "jimmytobing";
const LIVE_REF = "refs/heads/main";
const LIVE_REPO = "jimmytobing/Syntetic-Wisdom";
const APPROVAL_LABEL = "salesforce-rca-approved";

function parseActors(value) {
  return value
    .split(",")
    .map((actor) => actor.trim())
    .filter(Boolean);
}

function parseIssueSection(body, section) {
  const lines = body.split(/\r?\n/);
  const heading = lines.findIndex((line) => line.trim() === `### ${section}`);
  if (heading < 0) return "";
  for (const line of lines.slice(heading + 1)) {
    const value = line.trim();
    if (value.startsWith("### ")) break;
    if (value) return value;
  }
  return "";
}

export function authorizeRequest({
  allowedActors,
  repositoryMode,
  actor,
  eventName,
  issueAuthor = "",
  issueBody = "",
  issueLabel = "",
  repository = "",
  dispatchOperation = "",
  dispatchMock = true,
  ref = "",
}) {
  const allowed = parseActors(allowedActors);
  if (allowed.length === 0) throw new Error("RCA_ALLOWED_ACTORS belum dikonfigurasi.");
  if (!allowed.includes(actor)) throw new Error("Actor tidak diizinkan.");
  if (!new Set(["mock", "live"]).has(repositoryMode)) {
    throw new Error("RCA_MODE harus mock atau live.");
  }

  let operation;
  let mode;
  if (eventName === "issues") {
    if (!allowed.includes(issueAuthor)) throw new Error("Pembuat Issue tidak diizinkan.");
    if (issueLabel !== APPROVAL_LABEL) throw new Error("Label persetujuan tidak sesuai.");
    operation = parseIssueSection(issueBody, "Operasi RCA");
    const requestedMode = parseIssueSection(issueBody, "Mode RCA").toUpperCase();
    if (!["", "MOCK", "LIVE"].includes(requestedMode)) throw new Error("Mode Issue tidak didukung.");
    if (requestedMode === "LIVE") {
      if (actor !== LIVE_ACTOR || issueAuthor !== LIVE_ACTOR || ref !== LIVE_REF || repository !== LIVE_REPO) {
        throw new Error("LIVE Issue ditolak: perlu owner, main, dan repository yang tepat.");
      }
      mode = "live";
    } else {
      mode = "mock";
    }
  } else if (eventName === "workflow_dispatch") {
    operation = dispatchOperation;
    const liveRequested = dispatchMock === false || dispatchMock === "false";
    if (!liveRequested || repositoryMode !== "live") {
      mode = "mock";
    } else {
      if (actor !== LIVE_ACTOR) {
        throw new Error("Live ditolak: actor bukan pemilik yang diizinkan.");
      }
      if (ref !== LIVE_REF) {
        throw new Error("Live ditolak: workflow harus dijalankan dari main.");
      }
      mode = "live";
    }
  } else {
    throw new Error("Event tidak didukung.");
  }

  if (!ALLOWED_OPERATIONS.includes(operation)) {
    throw new Error("Operasi di luar allowlist.");
  }
  return { operation, mode };
}

function main() {
  const result = authorizeRequest({
    allowedActors: process.env.ALLOWED_ACTORS ?? "",
    repositoryMode: process.env.REPOSITORY_MODE ?? "",
    actor: process.env.ACTOR ?? "",
    eventName: process.env.EVENT_NAME ?? "",
    issueAuthor: process.env.ISSUE_AUTHOR ?? "",
    issueBody: process.env.ISSUE_BODY ?? "",
    issueLabel: process.env.ISSUE_LABEL ?? "",
    repository: process.env.GITHUB_REPOSITORY ?? "",
    dispatchOperation: process.env.DISPATCH_OPERATION ?? "",
    dispatchMock: process.env.DISPATCH_MOCK ?? "true",
    ref: process.env.GITHUB_REF ?? "",
  });
  if (!process.env.GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT tidak tersedia.");
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `operation=${result.operation}\nmode=${result.mode}\n`,
    "utf8"
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`Otorisasi RCA gagal: ${error.message}\n`);
    process.exitCode = 1;
  }
}
