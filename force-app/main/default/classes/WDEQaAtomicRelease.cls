/** Dedicated OAuth QA release gate. Runs as the authenticated QA user, never as Groq. */
@RestResource(urlMapping='/wde/qa-release/v1/*')
global with sharing class WDEQaAtomicRelease {
    global class Request {
        public Id batchId;
        public Id sourceId;
        public String expectedModifiedAt;
        public String enrichmentDigest;
        public String evidenceDigest;
        public String qaVersion;
        public String releaseKey;
        public String verdict;
    }
    global class Response {
        public Boolean committed = false;
        public String code;
        public Id journalId;
        public String status;
    }
    private static final String ORG_ID = '00Dfj00000eVCOVEA4';
    private static final String HELD = 'NeedsCommitReview';
    private static final String APPROVED = 'CommitApproved';
    private static Boolean validDigest(String value) {
        return value != null && Pattern.matches('sha256:[0-9a-f]{64}', value);
    }
    private static String hexDigest(String value) {
        return EncodingUtil.convertToHex(
            Crypto.generateDigest('SHA-256', Blob.valueOf(value))
        ).toLowerCase();
    }
    private static void require(Boolean condition, String code) {
        if (!condition) throw new ReleaseException(code);
    }
    private class ReleaseException extends Exception {}
    @HttpPost
    global static Response commit() {
        Response result = new Response();
        // The custom permission must be assigned ONLY to the dedicated OAuth QA principal.
        if (String.valueOf(UserInfo.getOrganizationId()) != ORG_ID ||
            !FeatureManagement.checkPermission('WDE_QA_Commit_Release')) {
            RestContext.response.statusCode = 403;
            result.code = 'QA_PRINCIPAL_NOT_AUTHORIZED';
            return result;
        }
        Request req;
        try {
            req = (Request) JSON.deserializeStrict(
                RestContext.request.requestBody.toString(), Request.class
            );
            require(req != null && req.batchId != null && req.sourceId != null,
                'REQUEST_INVALID');
            require(req.verdict == 'PASS', 'QA_NOT_PASS');
            require(validDigest(req.enrichmentDigest) && validDigest(req.evidenceDigest),
                'DIGEST_INVALID');
            require(req.qaVersion != null &&
                Pattern.matches('[A-Za-z0-9][A-Za-z0-9._-]{1,79}', req.qaVersion),
                'QA_VERSION_INVALID');
            require(req.expectedModifiedAt != null &&
                Pattern.matches('[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z', req.expectedModifiedAt),
                'SNAPSHOT_TIMESTAMP_INVALID');
            require(req.releaseKey != null &&
                Pattern.matches('[0-9a-f]{64}', req.releaseKey), 'RELEASE_KEY_INVALID');
        } catch (Exception ex) {
            RestContext.response.statusCode = 400;
            result.code = 'REQUEST_INVALID';
            return result;
        }

        Savepoint sp = Database.setSavepoint();
        try {
            // FOR UPDATE serializes concurrent attempts; latest values are checked under the lock.
            WDE_Batch_Run__c batch = [
                SELECT Id, Sermon_Source__c, Status__c, LastModifiedDate,
                    Approved_Enrichment__c, QA_Enrichment_SHA256__c
                FROM WDE_Batch_Run__c WHERE Id = :req.batchId LIMIT 1 FOR UPDATE
            ];
            require(batch.Status__c == HELD, 'BATCH_NOT_HELD');
            require(batch.Sermon_Source__c == req.sourceId, 'SOURCE_MISMATCH');
            String actualTimestamp = batch.LastModifiedDate.formatGmt('yyyy-MM-dd\'T\'HH:mm:ss.SSS\'Z\'');
            require(actualTimestamp == req.expectedModifiedAt, 'STALE_SNAPSHOT');
            require(String.isNotBlank(batch.Approved_Enrichment__c), 'ENRICHMENT_EMPTY');
            String currentDigest = 'sha256:' + hexDigest(batch.Approved_Enrichment__c);
            require(currentDigest == req.enrichmentDigest &&
                batch.QA_Enrichment_SHA256__c == currentDigest, 'ENRICHMENT_MISMATCH');
            String canonical = String.join(new List<String>{
                'WDE-QA-RELEASE-V1', ORG_ID, String.valueOf(req.batchId),
                String.valueOf(req.sourceId), req.enrichmentDigest, req.qaVersion
            }, '|');
            require(hexDigest(canonical) == req.releaseKey, 'RELEASE_KEY_MISMATCH');

            // CREATE, never UPSERT: unique Release_Key__c rejects replay atomically.
            WDE_QA_Release__c journal = new WDE_QA_Release__c(
                Release_Key__c = req.releaseKey,
                Batch_Run__c = req.batchId,
                Evidence_Digest__c = req.evidenceDigest,
                QA_Version__c = req.qaVersion,
                Authority_Reference__c = String.valueOf(UserInfo.getUserId()),
                Release_Status__c = 'Reserved'
            );
            insert journal;
            batch.Status__c = APPROVED;
            update batch;
            journal.Release_Status__c = 'Committed';
            journal.Consumed_At__c = System.now();
            update journal;
            result.committed = true;
            result.code = 'COMMITTED';
            result.journalId = journal.Id;
            result.status = APPROVED;
            RestContext.response.statusCode = 200;
        } catch (Exception ex) {
            Database.rollback(sp);
            // Do not disclose record data or internal exception details.
            result.code = ex instanceof ReleaseException ? ex.getMessage() : 'RELEASE_TRANSACTION_FAILED';
            RestContext.response.statusCode = 409;
        }
        return result;
    }
}
