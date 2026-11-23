@IsTest
private class WDEAudioQaForegroundClaimTest {
    private class CallCountMock implements HttpCalloutMock {
        public HTTPResponse respond(HTTPRequest req) {
            System.assert(false, 'No network callout is permitted without a valid fenced claim');
            return new HttpResponse();
        }
    }

    @IsTest static void responseShapeFailClosed() {
        System.assertEquals('HTTP_NOT_200', WDEAudioQaForegroundClaim.evaluateHttp(503, '{}'));
        System.assertEquals('EMPTY_OR_OVERSIZED_RESPONSE', WDEAudioQaForegroundClaim.evaluateHttp(200,''));
        System.assertEquals('MALFORMED_PROVIDER_JSON', WDEAudioQaForegroundClaim.evaluateHttp(200,'{'));
        System.assertEquals('MISSING_CANDIDATE', WDEAudioQaForegroundClaim.evaluateHttp(200,'{}'));
        System.assertEquals('NON_STOP_FINISH', WDEAudioQaForegroundClaim.evaluateHttp(200,
            '{"candidates":[{"finishReason":"MAX_TOKENS","content":{"parts":[{"text":"PASS"}]}}]}'));
        System.assertEquals('MISSING_OR_OVERSIZED_TEXT', WDEAudioQaForegroundClaim.evaluateHttp(200,
            '{"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":""}]}}]}'));
        System.assertEquals('MEDIA_UNAVAILABLE', WDEAudioQaForegroundClaim.evaluateHttp(200,
            '{"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":"MEDIA_UNAVAILABLE"}]}}]}'));
        System.assertEquals('RECEIVED', WDEAudioQaForegroundClaim.evaluateHttp(200,
            '{"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":"Audio evidence at 00:01"}]}}]}'));
        // "RECEIVED" means transport evidence, never an automatic PASS verdict.
    }

    @IsTest static void uniqueClaimPreventsRepeatedPost() {
        String key=WDEAudioQaForegroundClaim.sha('same-segment');
        WDE_Audio_QA_Claim__c first=new WDE_Audio_QA_Claim__c(
            Claim_Key__c=key, Fingerprint__c=key, State__c='RESERVED', Fence__c='one',
            Start_Ms__c=1000, End_Ms__c=2000
        );
        insert first;
        Database.SaveResult duplicated=Database.insert(new WDE_Audio_QA_Claim__c(
            Claim_Key__c=key, Fingerprint__c=key, State__c='RESERVED', Fence__c='two'
        ),false);
        System.assertEquals(false,duplicated.isSuccess(),'Database must enforce unique claim, not Flow reads');
        System.assertEquals(StatusCode.DUPLICATE_VALUE, duplicated.getErrors()[0].getStatusCode());
        System.assertEquals(1,[SELECT COUNT() FROM WDE_Audio_QA_Claim__c WHERE Claim_Key__c=:key]);
    }

    @IsTest static void reservedClaimNeverCallsProviderWithoutFenceTransition() {
        String key=WDEAudioQaForegroundClaim.sha('reserved-no-replay');
        WDE_Audio_QA_Claim__c c=new WDE_Audio_QA_Claim__c(
            Claim_Key__c=key, Fingerprint__c=key, State__c='RESERVED', Fence__c='real',
            Start_Ms__c=1000, End_Ms__c=2000
        );
        insert c;
        Test.setMock(HttpCalloutMock.class,new CallCountMock());
        Test.startTest();
        System.enqueueJob(new WDEAudioQaForegroundClaim.CalloutJob(c.Id,'wrong'));
        Test.stopTest();
        WDE_Audio_QA_Claim__c after=[SELECT State__c FROM WDE_Audio_QA_Claim__c WHERE Id=:c.Id];
        System.assertEquals('RESERVED',after.State__c,'Wrong fence cannot make a callout');
    }

    @IsTest static void invalidInputReturnsNoSubmission() {
        WDEAudioQaForegroundClaim.StartInput req=new WDEAudioQaForegroundClaim.StartInput();
        req.segmentId=null;
        req.startMs=1000;
        req.endMs=2000;
        // No source exists; must not enqueue or mutate Salesforce.
        Test.startTest();
        List<WDEAudioQaForegroundClaim.StartResult> result=
            WDEAudioQaForegroundClaim.prepare(new List<WDEAudioQaForegroundClaim.StartInput>{req});
        Test.stopTest();
        System.assertEquals('REJECTED',result[0].status);
        System.assertEquals('INELIGIBLE_SOURCE_OR_CLIP',result[0].code);
        System.assertEquals(0,[SELECT COUNT() FROM WDE_Audio_QA_Claim__c]);
    }
}
