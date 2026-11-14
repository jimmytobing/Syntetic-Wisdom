// Dedicated Issue #35 gateway. No arbitrary shell, URL, model, branch, or workflow dispatch.
const REPO = 'jimmytobing/Syntetic-Wisdom';
const ISSUE = 35;
const HEADING = '### WDE Gemini Request';
const ACK_FREE = 'FREE_TIER_CONFIRMED';
const ACK_RIGHTS = 'REVIEW_PERMITTED';

function assert(ok, message) { if (!ok) throw new Error(message); }

export function parseGeminiIssueRequest(body) {
  assert(typeof body === 'string' && body.length <= 120000, 'Invalid Issue body');
  const escaped = body.split(/\r?\n/);
  const matches = escaped.map((line, i) => line.trim() === HEADING ? i : -1).filter(i => i >= 0);
  assert(matches.length === 1, 'Exactly one WDE Gemini Request heading required');
  const at = matches[0];
  assert(escaped[at + 1]?.trim() === '```json', 'Expected JSON code fence after heading');
  assert(escaped[at + 3]?.trim() === '```', 'Expected one-line JSON and closing fence');
  let payload;
  try { payload = JSON.parse(escaped[at + 2]); } catch { throw new Error('Invalid JSON request'); }
  assert(payload && typeof payload === 'object' && !Array.isArray(payload), 'Invalid JSON object');
  const keys = Object.keys(payload).sort().join(',');
  const base = 'action,freeTierAck,requestId,rightsAck';
  const withId = 'action,freeTierAck,interactionId,requestId,rightsAck';
  assert(keys === base || keys === withId, 'Unexpected request fields');
  assert(['run', 'resume'].includes(payload.action), 'Invalid action');
  assert(typeof payload.requestId === 'string' &&
    /^wde35-[0-9]{8}-[0-9]{3,6}$/.test(payload.requestId), 'Invalid requestId');
  assert(payload.freeTierAck === ACK_FREE && payload.rightsAck === ACK_RIGHTS,
    'Explicit Free Tier and rights attestations are required');
  if (payload.action === 'run') {
    assert(keys === base, 'New run must not include an interaction ID');
  } else {
    assert(keys === withId && typeof payload.interactionId === 'string' &&
      /^[A-Za-z0-9][A-Za-z0-9_-]{4,127}$/.test(payload.interactionId), 'Invalid resume interaction ID');
  }
  return Object.freeze({
    requestId: payload.requestId,
    action: payload.action,
    resumeId: payload.action === 'resume' ? payload.interactionId : ''
  });
}

function verifyEvent(env) {
  assert(env.GITHUB_REPOSITORY === REPO, 'Wrong repository');
  assert(env.GITHUB_REF === 'refs/heads/main', 'Wrong ref');
  if (env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    assert(env.GITHUB_ACTOR === 'jimmytobing', 'Untrusted manual actor');
    assert(env.INPUT_FREE_TIER_ACK === ACK_FREE && env.INPUT_RIGHTS_ACK === ACK_RIGHTS,
      'Manual Free Tier/rights acknowledgement absent');
    const resume = env.INPUT_RESUME_ID || '';
    assert(!resume || /^[A-Za-z0-9][A-Za-z0-9_-]{4,127}$/.test(resume),
      'Invalid manual resume ID');
    return Object.freeze({requestId: '', action: resume ? 'resume' : 'run', resumeId: resume});
  }
  assert(env.GITHUB_EVENT_NAME === 'issues' && env.ISSUE_ACTION === 'edited',
    'Unsupported Issue event');
  assert(env.ISSUE_NUMBER === String(ISSUE) && env.ISSUE_AUTHOR === 'jimmytobing',
    'Only canonical Issue #35 allowed');
  assert(['jimmytobing', '098595'].includes(env.GITHUB_ACTOR), 'Untrusted Issue editor');
  return parseGeminiIssueRequest(env.ISSUE_BODY);
}

export async function claimRequest(request, {fetcher = fetch, token, repository = REPO}) {
  assert(repository === REPO && typeof token === 'string' && token.length > 10,
    'Invalid GitHub claim context');
  const marker = '<!-- WDE_GEMINI_REQUEST_ID:' + request.requestId + ' -->';
  const url = 'https://api.github.com/repos/' + repository + '/issues/' + ISSUE + '/comments';
  const headers = {Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'};
  for(let page = 1; page <= 30; page++) {
    const result = await fetcher(url + '?per_page=100&page=' + page, {method: 'GET',
      headers, redirect: 'error', signal: AbortSignal.timeout(15000)});
    assert(result.ok, 'Cannot inspect prior Issue claim markers');
    const comments = await result.json();
    assert(Array.isArray(comments), 'Invalid GitHub comments response');
    if (comments.some(x => typeof x?.body === 'string' && x.body.includes(marker))) {
      throw new Error('Duplicate Gemini Issue requestId; no inference submitted');
    }
    if (comments.length < 100) break;
    assert(page !== 30, 'Issue comment search cap reached; refuse unsafe replay');
  }
  const claim = await fetcher(url, {method:'POST', headers:{
    ...headers,'Content-Type':'application/json'},
    body:JSON.stringify({body:marker + '\nWDE Gemini Issue gateway claimed request ' +
      request.requestId + ' (action: ' + request.action + '). ' +
      'Claim is made before inference; no result or success is implied.'}),
    redirect:'error',signal:AbortSignal.timeout(15000)});
  assert(claim.ok, 'Failed to claim Gemini request before inference');
}

export async function issueGatewayMain(env=process.env, deps={}) {
  const request=verifyEvent(env);
  if (env.GITHUB_EVENT_NAME === 'issues') {
    await claimRequest(request,{fetcher:deps.fetcher || fetch,token:env.GH_TOKEN});
  }
  // Only the fixed output environment variables are written; Issue text never
  // reaches the inference script or shell for evaluation.
  const lines=[
    'WDE_FREE_TIER_ACK='+ACK_FREE,
    'WDE_RIGHTS_ACK='+ACK_RIGHTS,
    'WDE_RESUME_INTERACTION_ID='+request.resumeId
  ];
  const fs=await import('node:fs/promises');
  assert(typeof env.GITHUB_ENV === 'string' && env.GITHUB_ENV.length > 0,
    'Missing GitHub Actions env path');
  await fs.appendFile(env.GITHUB_ENV,lines.join('\n')+'\n',{encoding:'utf8'});
  console.log('Gemini gateway accepted: '+request.action+
    '; request ID claimed if Issue event; no raw request printed.');
}

if (process.argv[1] && import.meta.url === new URL('file://'+process.argv[1]).href) {
  issueGatewayMain().catch(e=>{
    console.error('GEMINI ISSUE GATE BLOCKED: '+String(e.message).replace(/AIza[0-9A-Za-z_-]+/g,'[HIDDEN]'));
    process.exitCode=1;
  });
}
