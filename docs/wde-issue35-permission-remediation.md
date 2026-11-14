# WDE #35 — Deployment Integration User Permission Remediation

Target only: `https://hdbsf-dev-ed.develop.my.salesforce.com` /
Org ID `00Dfj00000eVCOVEA4`.
Issue: https://github.com/jimmytobing/Syntetic-Wisdom/issues/35

## Verified blocker
The **same** OAuth client-credentials integration user used by `Sf Request`,
`Sf Bash` and `Sf Deploy` has eight assigned Profile/PermissionSet records.
Salesforce SOQL confirmed every one has:
`PermissionsCustomizeApplication=false`,
`PermissionsManageInteraction=false`,
`PermissionsManageProfilesPermissionsets=false`, and
`PermissionsAssignPermissionSets=false`.
A separate `Modify All Data=true` assignment does not confer those rights.
Check-only deployment `0Affj00000Yt3g4CAB` failed with picklist and Flow
permission errors. Therefore the connected user **cannot self-grant**
the required permission changes.

## Narrow bootstrap metadata (prepared, not deployed)
- `force-app/main/default/permissionsets/WDE_Metadata_Deployment_Access.permissionset-meta.xml`
- `force-app/main/default/permissionsets/WDE_HIVE_Source_Read.permissionset-meta.xml`
- `manifest/wde-permission-bootstrap-pr35.xml` (both Permission Sets)

This Permission Set contains only:
- `CustomizeApplication` — Customize Application
- `ManageInteraction` — Manage Flows

No `ManageProfilesPermissionsets`, `AssignPermissionSets`, or general
System Administrator role is granted to the integration user.

The separate `WDE_HIVE_Source_Read` Permission Set grants read-only object
access to Audience Need and Audience Signal plus minimal FLS read to
`Need_Key__c`, `Signal_Date__c`, `Signal_Key__c`, and the Audience Need lookup.
This set has no create/edit/delete or setup privileges.

## Admin-controlled application
A **separate Salesforce admin/deployment identity** with adequate setup
permissions must perform the bootstrap in the WDE org. The check-only
bootstrap attempt as the current integration user **FAILED**: Salesforce
job `0Affj00000YuBEvCAN` returned `checkOnly=true`, `status=Failed`,
`componentErrors=1`, and `insufficient access rights on cross-reference id`
for `WDE_Metadata_Deployment_Access`. This is not evidence the Permission Set
XML is invalid; it is evidence that this user cannot perform the bootstrap. Do not switch to BFI
orgs, share access tokens, or assume that adding XML assigns permissions.
In Salesforce Setup, create or deploy both dedicated WDE Permission Sets and
assign them to the **Run As** user of the existing GitHub Salesforce OAuth
client-credentials Connected App (verify the exact user record and license).
If metadata is not compatible with that user's license, use Setup UI to
inspect supported permission grants; never blindly elevate another user.

Before assignment, verify intended user, permission dependencies and
license compatibility. After assignment, re-query live
`PermissionSetAssignment` and system permissions to establish effective
`PermissionsCustomizeApplication=true` and
`PermissionsManageInteraction=true`.
The GitHub OAuth integration credentials should remain unchanged.

## Separate source-field FLS issue
The Salesforce Metadata API successfully retrieved
`WDE_Audience_Signal__c.Signal_Date__c`, but the integration user's SOQL
returned `INVALID_FIELD`. `FieldPermissions` currently shows a read/edit
grant on a *different profile-owned* PermissionSet. After admin bootstrap,
grant only **read** FLS on the actual HIVE input fields to the OAuth run-as
user (at minimum `Signal_Date__c`, `Signal_Key__c`,
`WDE_Audience_Need__c`; check object CRUD and other queried fields).
Do not assume FLS is fixed by granting Customize Application.

## Verification/release sequence
1. Read current OAuth run-as user + effective assigned PermissionSet system
   grants. Confirm WDE Org ID from Salesforce itself.
2. Check-only both bootstrap Permission Sets through
   `### Sf Deploy` `mode=validate`, manifest
   `manifest/wde-permission-bootstrap-pr35.xml`. A failed check-only by the
   unprivileged integration user does **not** imply the admin cannot deploy it.
3. With admin identity, deploy/create the bootstrap sets then assign both to
   the verified integration user. Confirm the actual Salesforce response.
   If either permission is unavailable under the integration-user license,
   stop and reconcile user license/permission-set license; do not change the
   connected app's Run As user or grant System Administrator speculatively.
4. Verify effective object-read + field-read grants from `WDE_HIVE_Source_Read`
   and rerun 28-day aggregate read-only SOQL as the OAuth user.
5. Run `### Sf Deploy` `mode=validate` for the **latest** PR #36 commit,
   manifest `manifest/wde-hive-pr35.xml`. Check deployment ID, result
   `Succeeded`, `checkOnly=true`, zero errors.
6. Only then perform independently approved metadata deploy and runtime Flow
   tests. This permission remediation alone does not constitute WDE product
   readiness or auto-activate its new Flows.

**Audit:** All changes and validation results stay in Issue #35; do not open a
second Issue for this permission blocker.
