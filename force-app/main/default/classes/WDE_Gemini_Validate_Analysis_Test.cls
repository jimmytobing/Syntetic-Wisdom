@IsTest
private class WDE_Gemini_Validate_Analysis_Test {
    private static WDE_Gemini_Validate_Analysis.Result check(String payload, Integer seconds) {
        WDE_Gemini_Validate_Analysis.Request request = new WDE_Gemini_Validate_Analysis.Request();
        request.analysisJson = payload;
        request.clipSeconds = seconds;
        return WDE_Gemini_Validate_Analysis.validate(new List<WDE_Gemini_Validate_Analysis.Request>{request})[0];
    }
    private static final String GOOD =
        '{"summary":"Sapaan dan ajakan berteduh.", "video_accessible":true, "segments":[' +
        '{"timestamp":"00:00 - 00:08","topic":"Sapaan","evidence":"Shalom keluarga saat teduh bersama."},' +
        '{"timestamp":"00:08 - 00:20","topic":"Berteduh","evidence":"Badai topan."}]}';
    @IsTest static void acceptsRealisticStructuredResult() {
        Test.startTest();
        WDE_Gemini_Validate_Analysis.Result r = check(GOOD, 20);
        Test.stopTest();
        System.assertEquals(true, r.valid);
        System.assertEquals(2, r.segmentCount);
        System.assertNotEquals(null, r.normalizedJson);
        System.assertEquals(null, r.errorMessage);
        System.assertEquals(true, JSON.deserializeUntyped(r.normalizedJson) != null);
    }
    @IsTest static void rejectsTruncatedAndInaccessibleVideo() {
        System.assertEquals(false, check('{"summary":"unfinished"',20).valid);
        System.assertEquals(false, check(GOOD.replace('"video_accessible":true','"video_accessible":false'),20).valid);
        System.assertEquals(false, check(GOOD.replace('"video_accessible":true','"video_accessible":"true"'),20).valid);
    }
    @IsTest static void rejectsInvalidTimestampsAndSchema() {
        System.assertEquals(false, check(GOOD.replace('00:08 - 00:20','00:06 - 00:20'),20).valid);
        System.assertEquals(false, check(GOOD.replace('00:08 - 00:20','00:08 - 00:21'),20).valid);
        System.assertEquals(false, check(GOOD.replace('00:08 - 00:20','00:08 - 00:70'),90).valid);
        System.assertEquals(false, check(GOOD.replace('"topic":"Sapaan"', '"topic":null'),20).valid);
        System.assertEquals(false, check(GOOD.replace('"summary":"Sapaan dan ajakan berteduh."','"summary":""'),20).valid);
    }
    @IsTest static void handlesBulkInputWithoutDml() {
        List<WDE_Gemini_Validate_Analysis.Request> batch = new List<WDE_Gemini_Validate_Analysis.Request>();
        for (Integer i=0; i<150; i++) {
            WDE_Gemini_Validate_Analysis.Request req = new WDE_Gemini_Validate_Analysis.Request();
            req.analysisJson = i % 2 == 0 ? GOOD : '{}';
            req.clipSeconds = 20;
            batch.add(req);
        }
        Test.startTest();
        List<WDE_Gemini_Validate_Analysis.Result> res = WDE_Gemini_Validate_Analysis.validate(batch);
        Test.stopTest();
        System.assertEquals(150, res.size());
        for (Integer i=0; i<150; i++) System.assertEquals(i % 2 == 0, res[i].valid);
    }
}