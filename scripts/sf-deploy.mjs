import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// WDE GitHub Issue-driven metadata gateway. Never execute source-branch scripts.
const ORG_ID = '00Dfj00000eVCOVEA4';
const INSTANCE = 'https://hdbsf-dev-ed.develop.my.salesforce.com';
const HEADING = '### Sf Deploy';
const tmp = process.env.RUNNER_TEMP || '/tmp';
const evidence = path.join(tmp, 'sf-deploy-evidence.md');

function fail(message) { throw new Error(message); }
function parseRequest(body) {
  const lines = body.split(/\r?\n/);
  const headings = lines.map((line, i) => line.trim() === HEADING ? i : -1).filter(i => i >= 0);
  if (headings.length !== 1) fail('Wajib tepat satu heading ### Sf Deploy.');
  if (lines.some(l => /^### Sf (?:Request|Bash)\s*$/.test(l))) fail('Hanya satu gateway aktif dalam Issue.');
  const section = [];
  for (const line of lines.slice(headings[0] + 1)) {
    if (/^#{1,3}\s/.test(line)) break;
    section.push(line);
  }
  const matches = [...section.join('\n').matchAll(/(?:^|\n)```json[ \t]*\n([\s\S]*?)\n```[ \t]*(?=\n|$)/gi)];
  if (matches.length !== 1 || Buffer.byteLength(matches[0][1]) > 2000) fail('Sf Deploy wajib satu JSON fence maksimal 2000 byte.');
  let req;
  try { req = JSON.parse(matches[0][1]); } catch { fail('JSON Sf Deploy tidak valid.'); }
  if (!req || Array.isArray(req) || typeof req !== 'object') fail('Request harus berupa JSON object.');
  if (Object.keys(req).some(k => !['mode','commit','manifest'].includes(k))) fail('Parameter Sf Deploy tidak dikenal.');
  if (!['validate','deploy'].includes(req.mode)) fail('mode hanya validate atau deploy.');
  if (typeof req.commit !== 'string' || !/^[a-f0-9]{40}$/.test(req.commit)) fail('commit wajib full 40-char SHA lowercase.');
  if (typeof req.manifest !== 'string' || !/^manifest\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}\.xml$/.test(req.manifest)) fail('manifest harus file XML di folder manifest/.');
  return req;
}
function gate() {
  const allowedActors = new Set(['jimmytobing', '098595']);
  if (process.env.GITHUB_REPOSITORY !== 'jimmytobing/Syntetic-Wisdom' ||
      !allowedActors.has(process.env.GITHUB_ACTOR) ||
      !allowedActors.has(process.env.ISSUE_AUTHOR) ||
      !/^\d+$/.test(process.env.ISSUE_NUMBER || '')) fail('GitHub actor/repo/Issue tidak diizinkan.');
  if ((process.env.SF_INSTANCE_URL || '').replace(/\/$/, '') !== INSTANCE) fail('SF_INSTANCE_URL bukan WDE yang diizinkan.');
  // The explicit Issue request mode=deploy is sufficient. Keep actor/repo/org verification.
  return parseRequest(process.env.ISSUE_BODY || '');
}
function inspectManifest(req) {
  const candidate = path.resolve(process.env.CANDIDATE_DIR || 'candidate');
  const actual = path.resolve(candidate, req.manifest);
  if (!actual.startsWith(candidate + path.sep)) fail('Manifest di luar source.');
  const xml = fs.readFileSync(actual, 'utf8');
  if (xml.length > 30000 || !xml.includes('<Package xmlns="http://soap.sforce.com/2006/04/metadata">')) fail('Manifest tidak sesuai format metadata.');
  if (xml.includes('<destructiveChanges') || xml.includes('<members>*</members>')) fail('Destructive/wildcard manifest tidak diizinkan.');
  const blocks = [...xml.matchAll(/<types>([\s\S]*?)<\/types>/g)];
  if (blocks.length === 0) fail('Manifest types tidak valid.');
  let count = 0;
  for (const [, content] of blocks) {
    const types = [...content.matchAll(/<name>([^<]+)<\/name>/g)].map(m=>m[1]);
    if (types.length !== 1 || !/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(types[0])) fail('Metadata type tidak valid.');
    const members = [...content.matchAll(/<members>([^<]+)<\/members>/g)].map(m=>m[1]);
    if (members.length < 1 || members.length > 100) fail('Metadata member terlalu banyak.');
    for (const member of members) {
      if (!/^[a-zA-Z][a-zA-Z0-9_./:-]{0,254}$/.test(member) || member.includes('..') || member.includes('//')) fail('Metadata member name tidak valid.');
      if (types[0] === 'Flow') {
        const f = path.join(candidate, 'force-app/main/default/flows', member + '.flow-meta.xml');
        const content = fs.readFileSync(f, 'utf8');
        if (!/<status>Draft<\/status>/.test(content) || /<status>Active<\/status>/.test(content)) fail('Hanya Flow Draft yang diizinkan.');
      }
    }
    count += members.length;
  }
  if (count > 120) fail('Jumlah metadata melebihi batas.');
  return { count, types: blocks.length, candidate };
}
function callSf(args, cwd, timeout=30000) {
  const p = spawnSync('sf', args, { cwd, encoding:'utf8', timeout, maxBuffer:2_000_000,
    env: { ...process.env, SF_AUTOUPDATE_DISABLE:'true', SF_DISABLE_TELEMETRY:'true' } });
  if (p.error) fail('Salesforce CLI error: ' + (p.error.code || 'process error'));
  let response;
  try { response = JSON.parse(p.stdout); } catch { fail('Salesforce CLI output bukan JSON (exit ' + p.status + ').'); }
  return { response, exitCode:p.status };
}
function verifyOrg() {
  const {response,exitCode} = callSf(['data','query','--target-org','hdbsf','--query','SELECT Id, OrganizationType FROM Organization LIMIT 1','--json'], process.cwd(), 30000);
  const org = response.result?.records?.[0];
  if (exitCode !== 0 || response.status !== 0 || response.result?.records?.length !== 1 ||
      org.Id !== ORG_ID || org.OrganizationType !== 'Developer Edition') fail('Salesforce LIVE Org ID / edition verification failed.');
  return org.Id;
}
function summary(result, code, req, scope) {
  const r = result.result || {};
  const rawFailures = r.details?.componentFailures;
  const failures = (Array.isArray(rawFailures) ? rawFailures : rawFailures ? [rawFailures] : []).slice(0, 10)
    .map(x => ({ type:String(x.componentType||'').slice(0,60), name:String(x.fullName||'').slice(0,120),
      error:String(x.problemType||'').slice(0,80), message:String(x.problem||'').slice(0,280) }));
  const ok = code === 0 && result.status === 0 && r.done === true && r.success === true &&
    r.status === 'Succeeded' && r.checkOnly === (req.mode === 'validate') &&
    (r.numberComponentErrors || 0) === 0;
  return { success:ok, mode:req.mode, sha:req.commit, manifest:req.manifest, orgId:ORG_ID,
    deploymentId:r.id || null, status:r.status || 'Unknown', checkOnly:r.checkOnly === true,
    totalComponents:r.numberComponentsTotal ?? null, componentErrors:r.numberComponentErrors ?? null,
    testErrors:r.numberTestErrors ?? null, manifestMembers:scope.count, failures };
}
function publish(obj) {
  const safe = JSON.stringify(obj,null,2);
  fs.writeFileSync(evidence,'## Sf Deploy — WDE — Issue #' + process.env.ISSUE_NUMBER +
    '\n\n```json\n' + safe + '\n```\n',{mode:0o600});
  process.stdout.write('Sf Deploy result: '+safe+'\n');
}
try {
  const req=gate();
  const cmd=process.argv[2];
  if(cmd==='preflight') {
    const out=process.env.GITHUB_OUTPUT;
    if(!out) fail('GITHUB_OUTPUT tidak tersedia.');
    fs.appendFileSync(out,'sha='+req.commit+'\nmode='+req.mode+'\n');
    console.log('Sf Deploy preflight PASS for mode '+req.mode+' commit '+req.commit);
  } else if(cmd==='inspect') {
    const scope=inspectManifest(req);
    console.log('Sf Deploy manifest inspection PASS, members '+scope.count);
  } else if(cmd==='run') {
    const scope=inspectManifest(req);
    verifyOrg();
    const args=['project','deploy','start','--target-org','hdbsf','--manifest',req.manifest,
      '--test-level','NoTestRun','--wait','8','--json'];
    if(req.mode==='validate') args.splice(3,0,'--dry-run');
    const {response,exitCode}=callSf(args,scope.candidate,570000);
    const result=summary(response,exitCode,req,scope);
    publish(result);
    if(!result.success) process.exitCode=1;
  } else fail('Mode script hanya preflight, inspect, run.');
} catch(e) {
  const obj={success:false,stage:process.argv[2]||'unknown',error:String(e.message||e).slice(0,300)};
  publish(obj);
  process.exitCode=1;
}
