import { writeFile } from "node:fs/promises";
import { safeLoginUrl, validateOAuthToken } from "./salesforce-rca.mjs";

const BASE = "https://hdbsf-dev-ed.develop.my.salesforce.com";
const OUTPUT = process.env.RUNNER_TEMP + "/sf-raw-evidence.md";
const OPERATION = process.env.OPERATION;
const MAX_COMMENT_CHARS = 50000;

async function main() {
  if (!process.env.RUNNER_TEMP) throw new Error("RUNNER_TEMP tidak tersedia");

  const login = safeLoginUrl(process.env.SF_RCA_LOGIN_URL ?? "");
  if (login !== BASE) throw new Error("Org tidak diizinkan");

  const tokenResponse = await fetch(`${login}/services/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.SF_RCA_CLIENT_ID ?? "",
      client_secret: process.env.SF_RCA_CLIENT_SECRET ?? "",
    }),
    redirect: "error",
  });

  if (!tokenResponse.ok) throw new Error("OAuth gagal");
  const auth = validateOAuthToken(await tokenResponse.json());

  const operations = {
    query_wde_trend_count: "/services/data/v68.0/query?q=" + encodeURIComponent("SELECT COUNT() FROM WDE_Audience_Trend__c"),
    schema_wde_trend: "/services/data/v68.0/sobjects/WDE_Audience_Trend__c/describe",
  };
  if (!Object.hasOwn(operations, OPERATION)) throw new Error("Operasi RAW tidak diizinkan");
  const path = operations[OPERATION];

  const response = await fetch(auth.instance + path, {
    method: "GET",
    headers: {
      authorization: `Bearer ${auth.accessToken}`,
      accept: "application/json",
    },
    redirect: "error",
  });

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`Salesforce query HTTP ${response.status}`);
  }

  const parsed = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Respons Salesforce JSON bukan object");
  }
  if (OPERATION === "query_wde_trend_count" && (
    !Number.isInteger(parsed.totalSize) || parsed.totalSize < 0 ||
    parsed.done !== true || !Array.isArray(parsed.records)
  )) throw new Error("Struktur respons COUNT tidak sesuai");
  if (OPERATION === "schema_wde_trend" && (
    parsed.name !== "WDE_Audience_Trend__c" || !Array.isArray(parsed.fields)
  )) throw new Error("Struktur respons Describe tidak sesuai");

  const comment = [
    "## Salesforce LIVE — RAW Evidence",
    "",
    "- Mode: **LIVE**",
    `- Operation: \`${OPERATION}\``,
    "- API: Salesforce REST v68.0",
    "- Method: GET (read-only)",
    "- Evidence: respons JSON asli Salesforce",
    "",
    "```json",
    raw,
    "```",
    "",
  ].join("\n");

  if (Buffer.byteLength(comment, "utf8") > MAX_COMMENT_CHARS) {
    throw new Error("RAW response terlalu besar untuk single-comment test");
  }

  await writeFile(OUTPUT, comment, { mode: 0o600 });
  console.log("PASS: RAW LIVE evidence siap diposting");
}

main().catch(error => {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
});
