#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const API_VERSION = "v68.0";
const MAX_RESPONSE_BYTES = 1_000_000;
const EXPECTED_ORG_ID = "00Dfj00000eVCOVEA4";
const EXPECTED_INSTANCE = "https://hdbsf-dev-ed.develop.my.salesforce.com";

export function summarizeCount(body) {
  if (!Object.hasOwn(body, "totalSize")) {
    throw new Error("Respons COUNT() tidak memiliki totalSize.");
  }
  if (!Number.isInteger(body.totalSize) || body.totalSize < 0) {
    throw new Error("totalSize COUNT() harus integer non-negatif.");
  }
  return {
    object: "WDE_Audience_Trend__c",
    recordCount: body.totalSize,
  };
}

const OPERATIONS = Object.freeze({
  schema_wde_trend: {
    api: "REST",
    path: `/services/data/${API_VERSION}/sobjects/WDE_Audience_Trend__c/describe`,
    summarize: (body) => ({
      object: body.name,
      label: body.label,
      queryable: body.queryable === true,
      fieldCount: Array.isArray(body.fields) ? body.fields.length : 0,
    }),
  },
  query_wde_trend_count: {
    api: "REST",
    path: `/services/data/${API_VERSION}/query?q=${encodeURIComponent(
      "SELECT COUNT() FROM WDE_Audience_Trend__c"
    )}`,
    summarize: summarizeCount,
  },
  tooling_wde_metadata: {
    api: "REST",
    path: `/services/data/${API_VERSION}/query?q=${encodeURIComponent(
      "SELECT QualifiedApiName, Label FROM EntityDefinition WHERE QualifiedApiName = 'WDE_Audience_Trend__c'"
    )}`,
    summarize: (body) => ({
      found: body.totalSize === 1,
      object: body.records?.[0]?.QualifiedApiName ?? "tidak ditemukan",
      label: body.records?.[0]?.Label ?? "tidak ditemukan",
      limitApplied: false,
    }),
  },
});

const MOCKS = Object.freeze({
  schema_wde_trend: {
    name: "WDE_Audience_Trend__c",
    label: "WDE Audience Trend",
    queryable: true,
    fields: [{ name: "Id" }, { name: "Name" }],
  },
  query_wde_trend_count: { totalSize: 7, done: true, records: [] },
  tooling_wde_metadata: {
    totalSize: 1,
    records: [
      { QualifiedApiName: "WDE_Audience_Trend__c", Label: "WDE Audience Trend" },
    ],
  },
});

function parseArgs(argv) {
  const result = { mock: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--mock") result.mock = true;
    else if (argument === "--operation") result.operation = argv[++index];
    else if (argument === "--output") result.output = argv[++index];
    else throw new Error(`Argumen tidak didukung: ${argument}`);
  }
  if (!result.operation || !OPERATIONS[result.operation]) {
    throw new Error("Operasi tidak ada dalam allowlist RCA.");
  }
  if (!result.output) throw new Error("Parameter --output wajib diisi.");
  return result;
}

export function safeLoginUrl(value) {
  const parsed = new URL(value);

  if (
    parsed.origin !== EXPECTED_INSTANCE ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new Error(
      "SF_RCA_LOGIN_URL harus tepat pada Developer Org RCA yang diizinkan."
    );
  }

  return EXPECTED_INSTANCE;
}

export function validateOAuthToken(token) {
  if (!token.access_token || !token.instance_url || !token.id) {
    throw new Error("Respons OAuth tidak lengkap.");
  }

  const instance = safeLoginUrl(token.instance_url);
  const identity = new URL(token.id);

  const allowedHosts = new Set([
    "login.salesforce.com",
    "test.salesforce.com",
    new URL(EXPECTED_INSTANCE).hostname,
  ]);

  const parts = identity.pathname.split("/").filter(Boolean);

  if (
    instance !== EXPECTED_INSTANCE ||
    identity.protocol !== "https:" ||
    identity.port !== "" ||
    identity.username !== "" ||
    identity.password !== "" ||
    identity.search !== "" ||
    identity.hash !== "" ||
    !allowedHosts.has(identity.hostname) ||
    parts.length !== 3 ||
    parts[0] !== "id" ||
    parts[1].slice(0, 15) !== EXPECTED_ORG_ID.slice(0, 15) ||
    parts[2].slice(0, 15) !== "005fj00000SF7fRAAT".slice(0, 15)
  ) {
    throw new Error(
      "OAuth ditolak: token bukan milik Developer Org RCA atau integration user yang diizinkan."
    );
  }

  return { accessToken: token.access_token, instance };
}

async function readJsonResponse(response) {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_RESPONSE_BYTES) throw new Error("Respons Salesforce terlalu besar.");
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new Error("Respons Salesforce terlalu besar.");
  }
  if (!response.ok) throw new Error(`Salesforce API gagal dengan HTTP ${response.status}.`);
  return JSON.parse(text);
}

async function authenticate() {
  const clientId = process.env.SF_RCA_CLIENT_ID;
  const clientSecret = process.env.SF_RCA_CLIENT_SECRET;
  const loginUrl = safeLoginUrl(process.env.SF_RCA_LOGIN_URL ?? "");
  if (!clientId || !clientSecret) throw new Error("Credential OAuth belum tersedia.");

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });
  const response = await fetch(`${loginUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    redirect: "error",
  });
  const token = await readJsonResponse(response);
  return validateOAuthToken(token);
}

export function summarizeResponse(operation, body) {
  const definition = OPERATIONS[operation];
  if (!definition) throw new Error("Operasi tidak ada dalam allowlist RCA.");
  return definition.summarize(body);
}

export async function execute(operation, mock) {
  const definition = OPERATIONS[operation];
  if (mock) return summarizeResponse(operation, MOCKS[operation]);

  const auth = await authenticate();
  const response = await fetch(`${auth.instance}${definition.path}`, {
    method: "GET",
    headers: { authorization: `Bearer ${auth.accessToken}`, accept: "application/json" },
    redirect: "error",
  });
  return summarizeResponse(operation, await readJsonResponse(response));
}

export function markdown(operation, api, summary, mock) {
  const rows = Object.entries(summary)
    .map(([key, value]) => `| ${key} | ${String(value).replaceAll("|", "\\|")} |`)
    .join("\n");
  return [
    "## Hasil Salesforce RCA",
    "",
    `- Status: **PASS**`,
    `- Mode: **${mock ? "MOCK" : "LIVE"}**`,
    `- Operasi allowlist: \`${operation}\``,
    `- API: ${api}`,
    "",
    "| Pemeriksaan | Hasil tersanitasi |",
    "|---|---|",
    rows,
    "",
    ...(mock
      ? ["> Data ini adalah simulasi lokal; tidak berasal dari Salesforce API.", ""]
      : []),
    "> Output ini hanya berisi ringkasan diagnostik; token dan data record mentah tidak disertakan.",
    "",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const definition = OPERATIONS[args.operation];
  const summary = await execute(args.operation, args.mock);
  await writeFile(args.output, markdown(args.operation, definition.api, summary, args.mock), {
    encoding: "utf8",
    mode: 0o600,
  });
  process.stdout.write(`RCA selesai: ${args.operation} (${args.mock ? "MOCK" : "LIVE"})\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`RCA gagal: ${error.message}\n`);
    process.exitCode = 1;
  });
}
