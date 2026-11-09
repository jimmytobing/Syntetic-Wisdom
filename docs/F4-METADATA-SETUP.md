# F.4 Metadata API — Dedicated Identity Setup (Developer Org Only)

Target Salesforce org: `00Dfj00000eVCOVEA4` / `hdbsf-dev-ed.develop.my.salesforce.com`. This workflow **does not** configure an identity or grant privileges automatically.

## Important permission boundary

Salesforce Metadata API `retrieve()` requires `API Enabled` plus **Modify Metadata Through Metadata API Functions** or **Modify All Data**. The former still grants metadata *write* capability at the Salesforce authorization layer; this is NOT a truly Salesforce-enforced read-only user. Do not grant `Modify All Data` for this use case. Our GitHub gateway enforces the narrower behavior through code: it calls only `retrieve` and `checkRetrieveStatus`. A stolen OAuth token could bypass that application-level limitation. Use a distinct identity and rotate credentials on suspicion of compromise.

Salesforce documentation:
- https://developer.salesforce.com/docs/platform/api-metadata/guide/meta-quickstart-prereqs.html
- https://developer.salesforce.com/docs/platform/api-metadata/references/file-based-calls/meta-retrieve.html

## Salesforce admin setup (UI)

1. In Developer Org Setup → Users, provision a **distinct dedicated user** for metadata diagnostics. Confirm a compatible Salesforce license and available license seat. Do not reuse `sfai.rca.hdbsf@hdbsf.dev` or the admin daily user. The Salesforce Integration license might not support the required metadata permission; check the effective license before continuing.
2. Create/assign a dedicated permission set with `API Enabled`, `View Setup and Configuration`, and `Modify Metadata Through Metadata API Functions` where the license permits. Add only extra feature permissions needed for particular metadata types. Do not grant `Modify All Data`.
3. Create a separate Salesforce External Client App / Connected App with OAuth **client credentials**, with the dedicated metadata user as its run-as user. Configure restrictive connected-app policy and allow only its intended integration identity.
4. Verify the user's Salesforce ID and the app's client ID/secret. Never put any client secret or OAuth bearer token into a GitHub Issue, source code, or logs.

## GitHub configuration (Settings → Secrets and variables → Actions)

Repository Secrets:
- `SF_META_CLIENT_ID`: metadata app OAuth client ID
- `SF_META_CLIENT_SECRET`: metadata app OAuth client secret
- `SF_META_LOGIN_URL`: `https://hdbsf-dev-ed.develop.my.salesforce.com`

Repository Variable:
- `SF_META_USER_ID`: the dedicated metadata run-as user's 15- or 18-character Salesforce ID

The implementation verifies the exact Developer Org ID/domain and intended user ID and rejects reuse of the original RCA integration user.

## Issue request format

Create an Issue owned by `jimmytobing`, then apply `salesforce-rca-approved` through GitHub Connector:

    ### Operasi RCA
    universal_read

    ### Mode RCA
    LIVE

    ### RCA Request JSON
    ```json
    {"action":"metadata_retrieve","types":[{"name":"Flow","members":["Tgr_WDE_Auto_Finalize_Summary"]}]}
    ```

Possible metadata type/member combinations are dynamic, subject to Salesforce Metadata API support and effective permissions.

## Evidence handling

- Only Metadata SOAP `retrieve` and `checkRetrieveStatus` are invoked (SOAP POST for read operation).
- No `deploy`, `createMetadata`, `updateMetadata`, or `deleteMetadata` endpoint is exposed.
- At most five types / forty members per request. Wildcard `*` is accepted, but responses above 5 MB compressed fail explicitly.
- Up to 48 KB of XML is included in a **single Issue comment**; the complete ZIP archive is stored in a private GitHub Actions artifact for **one day** with SHA-256 in the comment. Never claim the Issue comment is the full raw evidence when the ZIP contains more files.
- Do not use this path to retrieve credentials, secrets, or unnecessary personal data. Restrict GitHub repository and artifact access.

## Rollout

Before the credentials exist, only request validation and existing REST read-only gateway can be tested. Run the first metadata LIVE issue only after provisioning the new user/app/secrets; inspect the workflow's actual SOAP response and compare with admin metadata. Do not claim LIVE Metadata API is successful before that evidence exists.
