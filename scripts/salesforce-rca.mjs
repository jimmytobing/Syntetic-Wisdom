#!/usr/bin/env node

import { writeFile } from "node:fs/promises";

const API_VERSION = "v68.0";
const MAX_RESPONSE_BYTES = 1_000_000;
const EXPECTED_ORG_ID = "00Dfj00000eVCOVEA4";
const EXPECTED_INSTANCE = "https://hdbsf-dev-ed.develop.my.salesforce.com";

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
      "SELECT COUNT() FROM WDE_Audience_Trend__c LIMIT 200"
    )}`,
    summarize: (body) => ({
      object: "WDE_Audience_Trend__c",
      recordCount: Number(body.records?.[0]?.expr0 ?? 0),
      limitApplied: 200,
    }),
  },
  tooling_wde_metadata: {
    api: "Tooling",
    path: `/services/data/${API_VERSION}/tooling/query?q=${encodeURIComponent(
      "SELECT QualifiedApiName, Label FROM EntityDefinition WHERE QualifiedApiName = 'WDE_Audience_Trend__c' LIMIT 1"
    )}`,
    summarize: (body) => ({
      found: body.totalSize === 1,
      object: body.records?.[0]?.QualifiedApiName ?? "tidak ditemukan",
      label: body.records?.[0]?.Label ?? "tidak ditemukan",
      limitApplied: 1,
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
  query_wde_trend_count: { records: [{ expr0: 7 }] },
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

function safeLoginUrl(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") throw new Error("SF_RCA_LOGIN_URL wajib HTTPS.");
  const allowed = ["login.salesforce.com", "test.salesforce.com"];
  const isSalesforceDomain = parsed.hostname.endsWith(".my.salesforce.com");
  if (!allowed.includes(parsed.hostname) && !isSalesforceDomain) {
    throw new Error("SF_RCA_LOGIN_URL bukan domain Salesforce yang diizinkan.");
  }
  return parsed.origin;
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
  if (!token.access_token || !token.instance_url || !token.id) {
    throw new Error("Respons OAuth tidak lengkap.");
  }
  const instance = safeLoginUrl(token.instance_url);
  const identity = new URL(token.id);
  const identityParts = identity.pathname.split("/").filter(Boolean);
  const identityOrgId = identityParts.at(-2);
  if (identityOrgId !== EXPECTED_ORG_ID || instance !== EXPECTED_INSTANCE) {
    throw new Error("OAuth ditolak: token bukan milik Developer Org RCA yang diizinkan.");
  }
  return { accessToken: token.access_token, instance };
}

async function execute(operation, mock) {
  const definition = OPERATIONS[operation];
  if (mock) return definition.summarize(MOCKS[operation]);

  const auth = await authenticate();
  const response = await fetch(`${auth.instance}${definition.path}`, {
    method: "GET",
    headers: { authorization: `Bearer ${auth.accessToken}`, accept: "application/json" },
    redirect: "error",
  });
  return definition.summarize(await readJsonResponse(response));
}

function markdown(operation, api, summary, mock) {
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

main().catch((error) => {
  process.stderr.write(`RCA gagal: ${error.message}\n`);
  process.exitCode = 1;
});
