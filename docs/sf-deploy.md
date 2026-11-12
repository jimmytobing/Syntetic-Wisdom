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

## Deploy (disabled by default)

Only after a successful check-only run on the **same SHA**, explicit
release authorization, and reviewing dependency/impact:

```json
{
  "mode": "deploy",
  "commit": "<full verified 40-char SHA>",
  "manifest": "manifest/wde-hive-pr35.xml",
  "approval": "DEPLOY WDE 00Dfj00000eVCOVEA4"
}
```

Deployment additionally requires the protected **GitHub repository variable**
`WDE_DEPLOY_ENABLED=true`. Without it, the script refuses deployment.
An Issue comment without changing its active body does not trigger deployment.
Do not enable the variable routinely. Review and disable it after approved
release. Every deployment request is a Salesforce mutation and must be explicitly
authorized in its Issue.

**This gateway never activates a Flow**: manifests containing Flow metadata
must reference source with `<status>Draft</status>`. Flow activation requires
a separate explicitly authorized release process.

## Security and audit

- Authenticated actor and Issue creator must both be `jimmytobing`; repository
  must be `jimmytobing/Syntetic-Wisdom`.
- Candidate is checked out by immutable full SHA with no persisted Git
  credentials; its scripts are **never executed** in the credentialed job.
- The authentication script is loaded from trusted `main`, not feature code.
- Salesforce instance is checked against the exact WDE URL; **Org ID and
  edition are queried from Salesforce** immediately before metadata operation.
- The manifest path is limited to `manifest/*.xml`; no wildcard or
  destructiveChanges. Supported metadata types: `CustomObject`,
  `CustomField`, `ValidationRule`, and `Flow` (Draft only).
- No GitHub token is passed to the Salesforce execution job; evidence is
  published from a **separate job** with `issues: write` and no Salesforce
  credentials.
- Results are appended as comments to **the same Issue**. Never create a new
  Issue per query, validation or deployment attempt.
- Do not claim success from workflow status alone; inspect the Salesforce
  deployment ID, status, checkOnly and component/test errors.
- This flow does not perform data DML, test invocations, video generation,
  Flow activation, or end-to-end business verification.

For rejected requests, inspect the failure evidence and correct the Issue body;
do not blindly repeat a deployment request without checking its prior effects.
