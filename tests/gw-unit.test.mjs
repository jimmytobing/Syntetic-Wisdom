import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const mjs = (name) => join(root, '.github', 'mjs', name);
const org = '00Dfj00000eVCOVEA4';
function execute(name, args = [], env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'wde-gw-unit-'));
  const result = spawnSync(process.execPath, [mjs(name), ...args], {
    cwd: root, encoding: 'utf8', timeout: 10000,
    env: { ...process.env, RUNNER_TEMP: dir, GITHUB_OUTPUT: join(dir, 'output.txt'),
      GITHUB_REPOSITORY: 'jimmytobing/Syntetic-Wisdom',
      GITHUB_ACTOR: 'jimmytobing', ISSUE_AUTHOR: 'jimmytobing',
      ISSUE_NUMBER: '40', SF_INSTANCE_URL: 'https://hdbsf-dev-ed.develop.my.salesforce.com',
      ...env }
  });
  return { ...result, dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
test('required gateway files exist', () => {
  for (const file of ['sf-request.mjs','sf-bash-auth.mjs','sf-bash.mjs','jim-request.mjs','jim-bash.mjs']) {
    assert.ok(readFileSync(mjs(file), 'utf8').length > 0, file);
  }
});
for (const [file, heading, prefix] of [
  ['sf-bash.mjs', 'Sf Bash', 'sf'], ['jim-bash.mjs', 'Jim Bash', 'jim']]) {
  test(heading + ' produces sanitized terminal evidence without Salesforce', () => {
    const run = execute(file, [], { BASH_HEADING: heading,
      ISSUE_BODY: '### ' + heading + '\n\n```bash\nprintf SAFE_GATEWAY_TEST\n```\n' });
    try {
      assert.equal(run.status, 0, run.stderr);
      const evidence = readFileSync(join(run.dir, prefix + '-bash-evidence.md'), 'utf8');
      assert.match(evidence, new RegExp('## ' + heading + ' — WDE — Issue #40'));
      assert.match(evidence, /SAFE_GATEWAY_TEST/);
      assert.match(evidence, /Terminal Output/);
    } finally { run.cleanup(); }
  });
  test(heading + ' rejects duplicate headings without running shell', () => {
    const run = execute(file, [], { BASH_HEADING: heading,
      ISSUE_BODY: '### ' + heading + '\n\n```bash\necho NO\n```\n### ' + heading + '\n' });
    try {
      assert.notEqual(run.status, 0);
      assert.doesNotMatch(readFileSync(join(run.dir, prefix + '-bash-evidence.md'), 'utf8'), /Status: \*\*SUCCESS\*\*/);
    } finally { run.cleanup(); }
  });
}
test('Sf Deploy rejects unauthorized actor without CLI call', () => {
  const run = execute('sf-bash.mjs', ['preflight'], { GITHUB_ACTOR: 'untrusted',
    ISSUE_BODY: '### Sf Deploy\n\n```json\n{}\n```\n' });
  try {
    assert.notEqual(run.status, 0);
    const body = readFileSync(join(run.dir, 'sf-deploy-evidence.md'), 'utf8');
    assert.match(body, /Sf Deploy — WDE — Issue #40/);
    assert.match(body, /tidak diizinkan/);
  } finally { run.cleanup(); }
});
test('Sf Deploy preflight and manifest inspection (no CLI/no network)', () => {
  const sha = 'a'.repeat(40);
  const request = { mode: 'validate', commit: sha, manifest: 'manifest/gateway-smoke.xml' };
  const body = '### Sf Deploy\n\n```json\n' + JSON.stringify(request) + '\n```\n';
  const run = execute('sf-bash.mjs', ['preflight'], { ISSUE_BODY: body });
  try {
    assert.equal(run.status, 0, run.stderr);
    assert.match(readFileSync(join(run.dir, 'output.txt'), 'utf8'), /mode=validate/);
    const candidate = join(run.dir, 'candidate');
    mkdirSync(join(candidate, 'manifest'), { recursive: true });
    writeFileSync(join(candidate, 'manifest', 'gateway-smoke.xml'),
      '<?xml version="1.0"?><Package xmlns="http://soap.sforce.com/2006/04/metadata">' +
      '<types><members>WDE_Enrich_Approved_Boundaries</members><name>Flow</name></types>' +
      '<version>68.0</version></Package>');
    const inspect = spawnSync(process.execPath, [mjs('sf-bash.mjs'), 'inspect'], {
      cwd: root, encoding: 'utf8', timeout: 10000,
      env: { ...process.env, RUNNER_TEMP: run.dir, CANDIDATE_DIR: candidate,
        GITHUB_REPOSITORY: 'jimmytobing/Syntetic-Wisdom', GITHUB_ACTOR: 'jimmytobing',
        ISSUE_AUTHOR: 'jimmytobing', ISSUE_NUMBER: '40',
        SF_INSTANCE_URL: 'https://hdbsf-dev-ed.develop.my.salesforce.com', ISSUE_BODY: body }
    });
    assert.equal(inspect.status, 0, inspect.stderr);
    assert.match(inspect.stdout, /manifest inspection PASS, members 1/);
  } finally { run.cleanup(); }
});
test('Sf Request rejects invalid request before network', () => {
  const run = execute('sf-request.mjs', [], { ISSUE_BODY: '### Sf Request\n\n```json\n{bad json}\n```\n',
    SF_CLIENT_ID: '', SF_CLIENT_SECRET: '' });
  try {
    assert.notEqual(run.status, 0);
    assert.match(readFileSync(join(run.dir, 'sf-evidence.md'), 'utf8'), /Sf Request — WDE — Issue #40/);
  } finally { run.cleanup(); }
});
test('Jim Request rejects invalid request before external POST', () => {
  const run = execute('jim-request.mjs', [], {
    ISSUE_BODY: '### Jim Request\n\n```json\n{"content":[] }\n```\n', SF_BFI_PROD_APIKEY: '' });
  try {
    assert.notEqual(run.status, 0);
    assert.match(readFileSync(join(run.dir, 'jim-evidence.md'), 'utf8'), /FAILED/);
  } finally { run.cleanup(); }
});
test('expected org remains hard-gated in deploy gateway', () => {
  assert.match(readFileSync(mjs('sf-bash.mjs'), 'utf8'), new RegExp(org));
});
