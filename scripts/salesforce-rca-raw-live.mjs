import { writeFile } from "node:fs/promises";
import { safeLoginUrl, validateOAuthToken } from "./salesforce-rca.mjs";

const BASE = "https://hdbsf-dev-ed.develop.my.salesforce.com";
const OUTPUT = process.env.RUNNER_TEMP + "/sf-raw-evidence.md";
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

  const soql = "SELECT COUNT() FROM WDE_Audience_Trend__c";
  const path = "/services/data/v68.0/query?q=" + encodeURIComponent(soql);

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
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Number.isInteger(parsed.totalSize) ||
    parsed.totalSize < 0 ||
    parsed.done !== true ||
    !Array.isArray(parsed.records)
  ) {
    throw new Error("Struktur respons COUNT tidak sesuai");
  }

  const comment = [
    "## Salesforce LIVE — RAW Evidence",
    "",
    "- Mode: **LIVE**",
    "- Operation: `query_wde_trend_count`",
    "- API: Salesforce REST v68.0",
    "- Method: GET (read-only)",
    "- Evidence: respons JSON asli Salesforce",
    "",
    "```json",
    raw,
    "```",
    "",
  ].join("\n");

  if (comment.length > MAX_COMMENT_CHARS) {
    throw new Error("RAW response terlalu besar untuk single-comment test");
  }

  await writeFile(OUTPUT, comment, { mode: 0o600 });
  console.log("PASS: RAW LIVE evidence siap diposting");
}

main().catch(error => {
  console.error("FAIL:", error.message);
  process.exitCode = 1;
});
