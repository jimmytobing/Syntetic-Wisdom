# F.4 Metadata API — Single RCA Integration User

## Confirmed decision

Use only the existing Salesforce integration user `sfai.rca.hdbsf@hdbsf.dev` (ID `005fj00000SF7fRAAT`) in Developer Org `00Dfj00000eVCOVEA4`. Metadata API uses the same OAuth client credentials already stored as GitHub Actions Secrets:
- `SF_RCA_CLIENT_ID`
- `SF_RCA_CLIENT_SECRET`
- `SF_RCA_LOGIN_URL`

**Do not create `SF_META_*` credentials or a second Salesforce user.**

The gateway validates the exact expected OAuth Org, instance URL and integration user identity before making Metadata SOAP calls, and exposes only `retrieve` and `checkRetrieveStatus` (SOAP POST operations that retrieve, not deploy).

## Salesforce Permission Set (already assigned by administrator)

Permission Set `Salesforce_AI_RCA_Metadata_Access` assigned to `sfai.rca.hdbsf@hdbsf.dev`, with:
- API Enabled
- View Setup and Configuration
- Modify Metadata Through Metadata API Functions

Check these permissions really take effect before diagnosing authorization failures. **Do not grant Modify All Data unless separately justified.**

**Security notice:** Even with a read-only gateway, Salesforce's `Modify Metadata Through Metadata API Functions` permission can enable write operations if the OAuth credentials are used outside the gateway. GitHub code controls are not a Salesforce-enforced read-only permission boundary. Rotate/separate credentials if this risk becomes unacceptable.

## Live request

Use an Issue created by the allowed GitHub actor, with label `salesforce-rca-approved` and this body:

    ### Operasi RCA
    universal_read

    ### Mode RCA
    LIVE

    ### RCA Request JSON
    ```json
    {"action":"metadata_retrieve","types":[{"name":"Flow","members":["Tgr_WDE_Auto_Finalize_Summary"]}]}
    ```

Metadata types and names are dynamic; supported names depend on Salesforce API and effective permissions. Keep requests targeted. The gateway rejects deployment and metadata mutations. Metadata ZIP size must be <=5 MB, with a 1-day GitHub Actions artifact and SHA-256. Only XML files fitting the bounded Issue comment are included inline; do not confuse partial inline content with the full ZIP.

## Metadata retrieve failure analysis

Inspect `Salesforce RCA Read-Only` GitHub Actions job logs. Verify OAuth token identity, user permissions and SOAP fault. Permission Set assignment does not guarantee every metadata family is accessible. Do not publish Salesforce client secrets, access tokens or personal/private records in GitHub comments.

GitHub OAuth access is shared across REST and Metadata paths; no CLI or manual toggling of `RCA_MODE` is required for owner-approved LIVE Issues.
