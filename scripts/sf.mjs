import fs from 'node:fs/promises';

// GitHub Issue-driven Salesforce WDE API gateway.
// Validasi host/endpoint wajib sebelum memakai token. Jangan log credential.
var instanceUrl = (process.env.SF_INSTANCE_URL || '').trim().replace(/\/$/, '');
var clientId = process.env.SF_CLIENT_ID;
var clientSecret = process.env.SF_CLIENT_SECRET;
var issueBody = process.env.ISSUE_BODY || '';

function parseIssueRequest(text) {
  var lines = text.split(/\r?\n/);
  var headings = [];
  for (var i = 0; i < lines.length; i++) {
    if (/^### Sf Request\s*$/.test(lines[i])) headings.push(i);
  }
  if (headings.length !== 1) {
    throw new Error('Body Issue harus memiliki tepat satu heading ### Sf Request.');
  }
  var section = [];
  for (var line of lines.slice(headings[0] + 1)) {
    if (/^#{1,3}\s+/.test(line)) break;
    section.push(line);
  }
  var blocks = [];
  var sectionText = section.join('\n');
  var expression = /(?:^|\n)```json[ \t]*\n([\s\S]*?)\n```[ \t]*(?=\n|$)/gi;
  var match = expression.exec(sectionText);
  while (match) {
    blocks.push(match[1]);
    match = expression.exec(sectionText);
  }
  if (blocks.length !== 1 || Buffer.byteLength(blocks[0], 'utf8') > 12000) {
    throw new Error('Section Sf Request wajib berisi satu code fence json maksimal 12 KB.');
  }
  var data;
  try { data = JSON.parse(blocks[0]); }
  catch { throw new Error('JSON pada section Sf Request tidak valid.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Sf Request harus berupa JSON object.');
  }
  if (!data.options || typeof data.options !== 'object' || Array.isArray(data.options)) {
    throw new Error('options harus berupa JSON object.');
  }
  return data;
}

function validateInstanceUrl() {
  if (!instanceUrl) throw new Error('GitHub Variable SF_INSTANCE_URL belum disetel.');
  var base;
  try { base = new URL(instanceUrl); }
  catch { throw new Error('SF_INSTANCE_URL bukan URL valid.'); }
  if (base.protocol !== 'https:' || !base.hostname.endsWith('.my.salesforce.com') ||
      base.username || base.password || base.pathname !== '/' || base.search || base.hash ||
      base.origin !== instanceUrl) {
    throw new Error('SF_INSTANCE_URL harus HTTPS My Domain Salesforce tanpa path/query.');
  }
  if (base.origin !== 'https://hdbsf-dev-ed.develop.my.salesforce.com') {
    throw new Error('SF_INSTANCE_URL wajib menunjuk ke domain WDE hdbsf (bukan org lain).');
  }
}

function validateRequest(input) {
  if (typeof input.url !== 'string') throw new Error('url wajib berupa URL HTTPS atau path API relatif.');
  var url;
  try {
    // Relative paths are resolved only against the configured, validated WDE domain.
    url = input.url.startsWith('/services/')
      ? new URL(input.url, instanceUrl)
      : new URL(input.url);
  }
  catch { throw new Error('URL request tidak valid.'); }
  if (
    url.protocol !== 'https:' ||
    url.origin !== instanceUrl ||
    url.username || url.password || url.hash ||
    input.url.length > 2048
  ) {
    throw new Error('URL harus HTTPS Salesforce WDE dengan host yang disetujui.');
  }
  // No per-endpoint allowlist. Keep requests on the verified WDE Salesforce REST namespace.
  if (!/^\/services\/(?:data\/v[0-9]+\.[0-9]+\/|apexrest\/)/.test(url.pathname)) {
    throw new Error('Hanya Salesforce REST data/apexrest namespace yang diizinkan.');
  }
  var method = (input.options.method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
    throw new Error('Method tidak didukung.');
  }
  if (input.targetOrgId !== '00Dfj00000eVCOVEA4') {
    throw new Error('targetOrgId wajib cocok dengan immutable WDE Org ID.');
  }
  var rawHeaders = input.options.headers || {};
  if (!rawHeaders || typeof rawHeaders !== 'object' || Array.isArray(rawHeaders)) {
    throw new Error('options.headers harus berupa object.');
  }
  var headers = new Headers();
  for (var [key, value] of Object.entries(rawHeaders)) {
    if (!['accept', 'content-type'].includes(key.toLowerCase()) || typeof value !== 'string') {
      throw new Error('Hanya header Accept dan Content-Type yang boleh ditentukan Issue.');
    }
    if (value.length > 150) throw new Error('Header terlalu panjang.');
    headers.set(key, value);
  }
  if (['GET', 'DELETE'].includes(method) && input.options.body !== undefined) {
    throw new Error('GET dan DELETE tidak menerima body.');
  }
  if (['POST', 'PATCH', 'PUT'].includes(method) && input.options.body !== undefined &&
      (typeof input.options.body !== 'object' || input.options.body === null)) {
    throw new Error('POST body harus berupa JSON object.');
  }
  if (['POST', 'PATCH', 'PUT'].includes(method) && !headers.has('content-type')) {
    headers.set('Content-Type', 'application/json');
  }
  var body = ['POST', 'PATCH', 'PUT'].includes(method) ? JSON.stringify(input.options.body === undefined ? {} : input.options.body) : undefined;
  if (body && body.length > 10000) throw new Error('Request body terlalu besar.');
  return { url, method, headers, body };
}

var MAX_RESPONSE_BYTES = 50000;
var EVIDENCE_FILE = (process.env.RUNNER_TEMP || '/tmp') + '/sf-evidence.md';
var maskKey = /(?:token|secret|password|authorization|credential|api[_-]?key)/i;

function sanitize(value, secrets = [], depth = 0) {
  if (depth > 15) return '[DEPTH_LIMIT]';
  if (typeof value === 'string') {
    var result = value;
    for (var i = 0; i < secrets.length; i++) {
      if (secrets[i]) result = result.split(secrets[i]).join('[HIDDEN]');
    }
    return result;
  }
  if (Array.isArray(value)) {
    var list = [];
    for (var i = 0; i < value.length; i++) list.push(sanitize(value[i], secrets, depth + 1));
    return list;
  }
  if (value && typeof value === 'object') {
    var result = {};
    var keys = Object.keys(value);
    for (var j = 0; j < keys.length; j++) {
      var key = keys[j];
      result[key] = maskKey.test(key) ? '[HIDDEN]' : sanitize(value[key], secrets, depth + 1);
    }
    return result;
  }
  return value;
}

function quoteShell(value) {
  return "'" + String(value).split("'").join("'\\''") + "'";
}

async function readResponse(response) {
  var length = Number(response.headers.get('content-length') || '0');
  if (length > MAX_RESPONSE_BYTES) return { notice: 'Response body melebihi batas 50 KB dan tidak ditampilkan.' };
  var content = await response.text();
  if (Buffer.byteLength(content) > MAX_RESPONSE_BYTES) {
    return { notice: 'Response body melebihi batas 50 KB dan tidak ditampilkan.' };
  }
  try { return JSON.parse(content); } catch { return { text: content }; }
}

async function writeEvidence(evidence) {
  var parsed = evidence.parsed;
  var response = evidence.response;
  var data = evidence.data;
  var error = evidence.error;
  var secrets = evidence.secrets || [];
  var issue = process.env.ISSUE_NUMBER || '?';
  var status = response ? response.status : 'N/A';
  var method = parsed ? parsed.method : 'N/A';
  var url = parsed ? parsed.url.toString() : '(request belum valid)';
  var lines = ['## Sf Request — WDE — Issue #' + issue, '',
    'Status: **' + (error ? 'FAILED' : response && response.ok ? 'SUCCESS' : 'FAILED') + '** · HTTP ' + status + ' · Method ' + method, ''];
  if (parsed) {
    var soql = parsed.url.searchParams.get('q');
    if (soql && /^\/services\/data\/v[0-9]+\.[0-9]+\/(?:query|tooling\/query)/.test(parsed.url.pathname)) {
      lines.push('SOQL:', '```sql', soql, '```', '');
    }
    lines.push('<details>', '<summary>cURL (credential masked)</summary>', '', '```bash',
      'curl --request ' + parsed.method + ' ' + quoteShell(url) + ' \\',
      "  --header 'Authorization: Bearer [HIDDEN]'" + (parsed.body !== undefined ? ' \\' : ''));
    if (parsed.body !== undefined) lines.push("  --header 'Content-Type: application/json' \\", '  --data ' + quoteShell(JSON.stringify(sanitize(JSON.parse(parsed.body), secrets))));
    lines.push('```', '', '</details>', '');
  }
  lines.push('### Response', '', '<details>', '<summary>Response JSON — HTTP ' + status + '</summary>', '');
  if (error) {
    lines.push('Error: `' + String(error.message || error).split('`').join("'") + '`', '');
  }
  lines.push('```json',
    JSON.stringify(sanitize(data === undefined || data === null ? { notice: 'Tidak tersedia.' } : data, secrets), null, 2),
    '```', '', '</details>', '');
  var markdown = lines.join('\n');
  markdown = sanitize(markdown, secrets);
  if (Buffer.byteLength(markdown) > 55000) {
    markdown = '## Sf Request — WDE — Issue #' + issue + '\n\nHTTP ' + status + '\n\nResponse terlalu besar untuk satu komentar; batasi query atau payload.';
  }
  await fs.writeFile(EVIDENCE_FILE, markdown, { mode: 0o600 });
}

async function main() {
  var parsed;
  var response;
  var data;
  var accessToken;
  try {
    validateInstanceUrl();
    parsed = validateRequest(parseIssueRequest(issueBody));
    if (!clientId || !clientSecret) {
      throw new Error('GitHub Secrets SF_CLIENT_ID / SF_CLIENT_SECRET belum lengkap.');
    }
    var auth = await fetch(instanceUrl + '/services/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret,
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    if (!auth.ok) throw new Error('OAuth Salesforce gagal: HTTP ' + auth.status);
    var tokenPayload = await auth.json();
    accessToken = tokenPayload ? tokenPayload.access_token : null;
    if (typeof accessToken !== 'string' || !accessToken) throw new Error('OAuth tidak memberikan access_token.');
    if (process.env.GITHUB_ACTIONS === 'true') process.stdout.write('::add-mask::' + accessToken + '\n');

    // Verify authenticated org, not merely CLI alias / My Domain string.
    var verificationQuery = new URL(instanceUrl + '/services/data/v68.0/query');
    verificationQuery.searchParams.set('q', 'SELECT Id, OrganizationType FROM Organization LIMIT 1');
    var verifyResponse = await fetch(verificationQuery, {
      headers: { Authorization: 'Bearer ' + accessToken },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!verifyResponse.ok) throw new Error('Org verification failed: HTTP ' + verifyResponse.status);
    var verifiedOrg = (await verifyResponse.json()).records?.[0];
    if (verifiedOrg?.Id !== '00Dfj00000eVCOVEA4' || verifiedOrg?.OrganizationType !== 'Developer Edition') {
      throw new Error('Authenticated Salesforce org does not match WDE Developer Edition Org ID.');
    }
    console.log('VERIFIED_ORG_ID', verifiedOrg.Id);

    parsed.headers.set('Authorization', 'Bearer ' + accessToken);
    response = await fetch(parsed.url, {
      method: parsed.method,
      headers: parsed.headers,
      body: parsed.body,
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    data = await readResponse(response);
    await writeEvidence({ parsed, response, data, secrets: [clientId, clientSecret, accessToken] });
    console.log('Issue #' + (process.env.ISSUE_NUMBER || '?') + ': ' + parsed.method + ' Salesforce WDE HTTP ' + response.status);
    if (!response.ok) process.exitCode = 1;
  } catch (error) {
    console.error('SF API FAILED:', error.message);
    await writeEvidence({ parsed, response, data, error, secrets: [clientId, clientSecret, accessToken] });
    process.exitCode = 1;
  }
}

await main();
