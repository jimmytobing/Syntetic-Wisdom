# WDE — `### Sf Deploy` gateway

GitHub Workflow: `.github/workflows/sf.yaml`; Script: `scripts/sf-deploy.mjs`.

**Target tetap:** `hdbsf` / Salesforce Developer Edition /
Org ID `00Dfj00000eVCOVEA4` /
`https://hdbsf-dev-ed.develop.my.salesforce.com`.
Jangan gunakan org BFI atau alias lainnya.

## Validate a feature-branch commit (recommended first)

Edit **existing development Issue** (for WDE HIVE use Issue #35). Keep
exactly one active gateway heading; remove `### Sf Bash` or `### Sf Request`
from the Issue body before using Sf Deploy.

```markdown
### Sf Deploy
```

Immediately below that heading place exactly one **JSON fenced code block**:

```json
{
  "mode": "validate",
  "commit": "d3a5be5a5f01c777a235067d42cff77a86eba68a",
  "manifest": "manifest/wde-hive-pr35.xml"
}
```

The commit SHA must be the exact 40-character lowercase SHA that includes the
desired manifest and all metadata, not a branch name, PR number or mutable tag.
The example above pins the #35 candidate at the time of writing; verify the
latest desired candidate before using it.

`validate` runs `sf project deploy start --dry-run` with
`--test-level NoTestRun`. A successful workflow run does not guarantee
the Salesforce validation succeeded: confirm the Issue evidence shows
`status=Succeeded`, `success=true`, and `checkOnly=true`.

## Deploy (enabled by default)

When an authorized GitHub actor explicitly selects `"mode": "deploy"` in the
existing Issue, the gateway performs a Salesforce metadata deployment to the
verified WDE org. There is **no separate approval string or repository-variable
feature flag**.

```json
{
  "mode": "deploy",
  "commit": "<full verified 40-char SHA>",
  "manifest": "manifest/wde-hive-pr35.xml"
}
```

**Important:** `deploy` is a mutating operation. Do not select this mode for
investigation or unreviewed changes. Validate the same commit first when
practical. Repeated Issue edits while `mode=deploy` is active can start
another deployment: inspect the previous run and its Salesforce deployment ID
before editing the Issue again. A comment alone does not trigger the workflow.
`"mode": "validate"` remains the safe check-only option.

**Flow safeguard:** The gateway continues to permit deployment of Flow
metadata only with `<status>Draft</status>`. Flow activation is a separate
operation.

## Security and audit

- GitHub workflow actor and Issue creator must each be in the allowed set
  `jimmytobing` or `098595`; repository must be `jimmytobing/Syntetic-Wisdom`.
- Candidate is checked out by immutable full SHA with no persisted Git
  credentials; its scripts are **never executed** in the credentialed job.
- The authentication script is loaded from trusted `main`, not feature code.
- Salesforce instance is checked against the exact WDE URL; **Org ID and
  edition are queried from Salesforce** immediately before metadata operation.
- The manifest path remains limited to `manifest/*.xml` without wildcard or
  destructiveChanges. **All Salesforce Metadata API types** are accepted by
  the gateway (no `ALLOWED_TYPES` list); support for each individual type is
  determined by the actual Salesforce Metadata API. Flow remains Draft-only.
- No GitHub token is passed to the Salesforce execution job; evidence is
  published from a **separate job** with `issues: write` and no Salesforce
  credentials.
- Results are appended as comments to **the same Issue**. Never create a new
  Issue per query, validation or deployment attempt.
- Do not claim success from workflow status alone; inspect the Salesforce
  deployment ID, status, checkOnly and component/test errors.
- This gateway runs metadata validation or deployment only. It does not perform
  record DML, video generation, Flow activation, or end-to-end business verification.
  Deploying metadata can itself change permissions, automation, and org behavior.

For rejected requests, inspect the failure evidence and correct the Issue body;
do not blindly repeat a deployment request without checking its prior effects.
