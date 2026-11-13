import { spawnSync } from 'node:child_process';

const rawUrl = (process.env.SF_INSTANCE_URL || '').trim();
const clientId = process.env.SF_CLIENT_ID;
const clientSecret = process.env.SF_CLIENT_SECRET;
if (!clientId || !clientSecret) throw new Error('WDE Salesforce OAuth secrets belum lengkap.');
let instanceUrl;
try {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.my.salesforce.com') ||
      url.hostname === 'ptbfifinance.my.salesforce.com' ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('invalid');
  }
  instanceUrl = url.origin;
} catch {
  throw new Error('SF_INSTANCE_URL harus My Domain WDE HTTPS tanpa path/query, bukan BFI_PROD.');
}
const auth = await fetch(instanceUrl + '/services/oauth2/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
  redirect: 'error',
  signal: AbortSignal.timeout(30000),
});
if (!auth.ok) throw new Error('Salesforce WDE OAuth gagal: HTTP ' + auth.status);
const result = await auth.json();
if (typeof result.access_token !== 'string' || !result.access_token) {
  throw new Error('Salesforce OAuth tidak mengembalikan access token.');
}
const token = result.access_token;
if (process.env.GITHUB_ACTIONS === 'true') process.stdout.write('::add-mask::' + token + '\n');
const login = spawnSync('sf', ['org', 'login', 'access-token', '--instance-url', instanceUrl,
  '--alias', 'hdbsf', '--no-prompt'], {
  env: { ...process.env, SF_ACCESS_TOKEN: token },
  encoding: 'utf8', timeout: 30000,
});
if (login.error || login.status !== 0) {
  throw new Error('Salesforce CLI login gagal (exit ' + (login.status ?? 'unknown') +
    '). Token tidak ditampilkan; periksa permission OAuth dan versi CLI.');
}
console.log('Salesforce CLI authenticated to WDE as alias hdbsf.');
