#!/usr/bin/env node
// Dynamic Salesforce RCA: fixed origin, read-only GET, bounded evidence.
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { safeLoginUrl, validateOAuthToken } from "./salesforce-rca.mjs";

const BASE = "https://hdbsf-dev-ed.develop.my.salesforce.com";
const PREFIX = "/services/data/v68.0";
const MAX_EVIDENCE_BYTES = 50000;
const MAX_RESPONSE_BYTES = 1000000;
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]*$/;
const RECORD_ID = /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/;

function section(body, heading) {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex(x => x.trim() === "### " + heading);
  if (start === -1) throw new Error("Issue kehilangan section: " + heading);
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("### ")) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

export function readRequest(issueBody) {
  const raw = section(issueBody, "RCA Request JSON");
  const match = raw.match(/^\x60\x60\x60(?:json)?\s*\n([\s\S]*?)\n\x60\x60\x60$/i);
  if (!match || Buffer.byteLength(match[1]) > 12000) throw new Error("Request harus satu code fence JSON <=12 KB");
  const request = JSON.parse(match[1]);
  if (!request || typeof request !== "object" || Array.isArray(request)) throw new Error("Request bukan object JSON");
  const allowed = new Set(["describe_global","describe_object","query","tooling_query","tooling_describe","tooling_record"]);
  if (!allowed.has(request.action)) throw new Error("Action tidak diizinkan");
  const requiredKeys = {describe_global:["action"],describe_object:["action","object"],query:["action","soql"],tooling_query:["action","soql"],tooling_describe:["action","object"],tooling_record:["action","object","id"]};
  const keys = requiredKeys[request.action];
  if (Object.keys(request).some(k => !keys.includes(k)) || keys.some(k => !(k in request))) {
    throw new Error("Parameter request tidak cocok dengan action");
  }
  return request;
}

function validateIdentifier(value) {
  if (typeof value !== "string" || value.length > 100 || !IDENTIFIER.test(value)) {
    throw new Error("Nama object tidak valid");
  }
  return value;
}

export function validateSoql(value) {
  if (typeof value !== "string" || value.length > 8000) throw new Error("Panjang SOQL tidak valid");
  const trimmed = value.trim();
  if (!/^SELECT\s+/i.test(trimmed) || /;|--|\/\*|\*\//.test(trimmed)) throw new Error("Hanya satu query SELECT tanpa komentar");
  if (/\bFOR\s+(?:UPDATE|VIEW|REFERENCE)\b|\bUPDATE\s+TRACKING\b/i.test(trimmed)) {
    throw new Error("Query memiliki side-effect yang tidak diizinkan");
  }
  // Limit results; COUNT() has a scalar response. Read-only query cannot mutate Salesforce data.
  if (!/\bCOUNT\s*\(/i.test(trimmed)) {
    const limits = [...trimmed.matchAll(/\bLIMIT\s+(\d+)\b/gi)];
    if (!limits.length || limits.some(m => Number(m[1]) < 1 || Number(m[1]) > 100)) {
      throw new Error("SOQL biasa wajib LIMIT 1..100");
    }
  }
  return trimmed;
}

export function buildPath(request) {
  switch (request.action) {
    case "describe_global": return PREFIX + "/sobjects/";
    case "describe_object": return PREFIX + "/sobjects/" + encodeURIComponent(validateIdentifier(request.object)) + "/describe";
    case "query": return PREFIX + "/query?q=" + encodeURIComponent(validateSoql(request.soql));
    case "tooling_query": return PREFIX + "/tooling/query?q=" + encodeURIComponent(validateSoql(request.soql));
    case "tooling_describe": return PREFIX + "/tooling/sobjects/" + encodeURIComponent(validateIdentifier(request.object)) + "/describe";
    case "tooling_record":
      if (typeof request.id !== "string" || !RECORD_ID.test(request.id)) throw new Error("Record ID invalid");
      return PREFIX + "/tooling/sobjects/" + encodeURIComponent(validateIdentifier(request.object)) + "/" + request.id;
    default: throw new Error("Action tidak dikenal");
  }
}

async function main() {
  if (!process.env.RUNNER_TEMP) throw new Error("RUNNER_TEMP tidak tersedia");
  const request = readRequest(process.env.ISSUE_BODY ?? "");
  const url = buildPath(request);
  const login = safeLoginUrl(process.env.SF_RCA_LOGIN_URL ?? "");
  if (login !== BASE) throw new Error("Org tidak diizinkan");
  const authResponse = await fetch(login + "/services/oauth2/token", {
    method: "POST", redirect: "error",
    headers: {"content-type":"application/x-www-form-urlencoded"},
    body: new URLSearchParams({grant_type:"client_credentials",client_id:process.env.SF_RCA_CLIENT_ID ?? "",client_secret:process.env.SF_RCA_CLIENT_SECRET ?? ""}),
    signal: AbortSignal.timeout(20000)
  });
  if (!authResponse.ok) throw new Error("Salesforce OAuth gagal HTTP " + authResponse.status);
  const auth = validateOAuthToken(await authResponse.json());
  const response = await fetch(auth.instance + url, {
    method: "GET", redirect: "error",
    headers: {authorization:"Bearer " + auth.accessToken, accept:"application/json","Sforce-Query-Options":"batchSize=100"},
    signal: AbortSignal.timeout(30000)
  });
  const length = Number(response.headers.get("content-length") || "0");
  if (length > MAX_RESPONSE_BYTES) throw new Error("Response Salesforce melebihi 1 MB");
  // Read bounded response even when Content-Length is not provided.
  const stream = response.body?.getReader();
  if (!stream) throw new Error("Tidak ada response stream");
  const chunks = [];
  let size = 0;
  while (true) {
    const {done,value} = await stream.read();
    if (done) break;
    size += value.length;
    if (size > MAX_RESPONSE_BYTES) {
      await stream.cancel();
      throw new Error("Response Salesforce melebihi 1 MB");
    }
    chunks.push(value);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  const data = JSON.parse(raw);
  if (!data || typeof data !== "object") throw new Error("JSON Salesforce invalid");
  const apiFailed = !response.ok;
  const comment = [
    "## Salesforce RCA F.4 — RAW LIVE Evidence",
    "",
    "- Mode: **LIVE**",
    "- Result: **" + (apiFailed ? "FAILED (Salesforce API)" : "SUCCESS") + "**",
    "- Action: `" + request.action + "`",
    "- API: Salesforce REST v68.0",
    "- Method: GET (read-only)",
    "- HTTP Status: " + response.status,
    "- Request: `" + url.split("?")[0] + "`",
    "",
    "```json", raw, "```", ""
  ].join("\n");
  if (Buffer.byteLength(comment,"utf8") > MAX_EVIDENCE_BYTES) {
    throw new Error("RAW JSON melebihi 50 KB single-comment; request lebih sempit diperlukan");
  }
  await writeFile(process.env.RUNNER_TEMP + "/sf-raw-evidence.md",comment,{mode:0o600});
  if (apiFailed) {
    console.error("FAIL: Salesforce GET HTTP " + response.status + " (RAW error evidence telah disiapkan)");
    process.exitCode = 1;
  } else {
    console.log("PASS: Universal Salesforce read-only RAW evidence siap");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => {console.error("FAIL:",e.message);process.exitCode=1;});
}
