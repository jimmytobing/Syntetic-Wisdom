@IsTest
private class WDEAudioQaBatchTest {
    private static Sermon_Segment__c sample() {
        Sermon_Segment__c s = new Sermon_Segment__c(
            Id='a0Efj00000EcTfFEAV',
            Audio_QA_Required__c=true,
            Audio_QA_Status__c='SYSTEM_ERROR',
            Audio_QA_Attempts__c=3,
            WDE_Stitch_Open__c=false,
            Start_Ms__c=2288076,
            End_Ms__c=2666000,
            Transcript_Text__c='Ini adalah contoh isi transkrip untuk pengujian kontrak saja.'
        );
        s.Sermon_Source__r = new Sermon_Source__c(
            External_Video_Id__c='KeA9Xr9KzUI',
            Rights_Status__c='PermissionGranted');
        s.Audio_QA_Batch_Fingerprint__c = WDEAudioQaBatch.fingerprint(s);
        return s;
    }
    @IsTest static void requestOnlyOneScopedJob() {
        Sermon_Segment__c s = sample();
        String body = WDEAudioQaBatch.submissionBody(s);
        Map<String,Object> root = (Map<String,Object>) JSON.deserializeUntyped(body);
        Map<String,Object> batch = (Map<String,Object>) root.get('batch');
        Map<String,Object> input = (Map<String,Object>) batch.get('input_config');
        Map<String,Object> inline = (Map<String,Object>) input.get('requests');
        List<Object> requests = (List<Object>) inline.get('requests');
        System.assertEquals(1, requests.size());
        Map<String,Object> item = (Map<String,Object>) requests[0];
        Map<String,Object> generate = (Map<String,Object>) item.get('request');
        System.assertEquals('models/gemini-3.8-flash', generate.get('model'));
        List<Object> contents = (List<Object>) generate.get('contents');
        Map<String,Object> content = (Map<String,Object>) contents[0];
        List<Object> parts = (List<Object>) content.get('parts');
        Map<String,Object> video = (Map<String,Object>) parts[0];
        Map<String,Object> file = (Map<String,Object>) video.get('file_data');
        System.assertEquals('https://www.youtube.com/watch?v=KeA9Xr9KzUI',file.get('file_uri'));
        Map<String,Object> metadata = (Map<String,Object>) video.get('video_metadata');
        System.assertEquals('2288s',metadata.get('start_offset'));
        System.assertEquals('2666s',metadata.get('end_offset'));
        System.assert(!body.contains('Authorization'));
        System.assert(!body.contains('api_key'));
    }
    @IsTest static void fingerprintRejectsMaterialChanges() {
        Sermon_Segment__c s = sample();
        String initial = WDEAudioQaBatch.fingerprint(s);
        System.assertEquals(64, initial.length());
        s.Transcript_Text__c += ' Perubahan substantif.';
        System.assertNotEquals(initial, WDEAudioQaBatch.fingerprint(s));
        System.assert(WDEAudioQaBatch.validJobName('batches/b-123_ABC.xyz'));
        System.assert(!WDEAudioQaBatch.validJobName('https://other.example/batches/id'));
        System.assert(!WDEAudioQaBatch.validJobName('batches/../../secret'));
    }
    @IsTest static void onlyIndependentCompleteContentVerdictsAreEligible() {
        String detail = 'PASS|AUDIO: Pembicara pada rentang ini terdengar jelas menyebut beberapa kalimat dan musik latar yang sesuai. ' +
            'Observasi kedua adalah perubahan intonasi setelah jeda yang relevan. |TIMESTAMPS: 38:08-44:26';
        System.assert(WDEAudioQaBatch.validVerdict(detail));
        System.assert(!WDEAudioQaBatch.validVerdict('PASS'));
        System.assert(!WDEAudioQaBatch.validVerdict(detail.replace('TIMESTAMPS:', 'TIME:')));
        System.assert(!WDEAudioQaBatch.validVerdict(detail.replace('38:08-44:26','tidak diketahui')));
        System.assert(!WDEAudioQaBatch.validVerdict('SYSTEM_ERROR|AUDIO: provider 503|TIMESTAMPS: 38:08-44:26'));
    }
    @IsTest static void outputParserFailsClosed() {
        Map<String,Object> result = new Map<String,Object>{
            'output'=>new Map<String,Object>{
                'inlinedResponses'=>new Map<String,Object>{
                    'inlinedResponses'=>new List<Object>{
                        new Map<String,Object>{
                            'response'=>new Map<String,Object>{
                                'candidates'=>new List<Object>{
                                    new Map<String,Object>{
                                        'finishReason'=>'STOP',
                                        'content'=>new Map<String,Object>{
                                            'parts'=>new List<Object>{
                                                new Map<String,Object>{'text'=>'FAIL|AUDIO: mismatch konkret|TIMESTAMPS: 39:00-39:30'}
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        };
        System.assertEquals('FAIL|AUDIO: mismatch konkret|TIMESTAMPS: 39:00-39:30',
            WDEAudioQaBatch.extractVerdict(result));
        Map<String,Object> output = (Map<String,Object>) result.get('output');
        Map<String,Object> inline = (Map<String,Object>) output.get('inlinedResponses');
        List<Object> items = (List<Object>) inline.get('inlinedResponses');
        Map<String,Object> item = (Map<String,Object>) items[0];
        item.remove('response');
        item.put('error',new Map<String,Object>{'code'=>503});
        System.assertEquals(null,WDEAudioQaBatch.extractVerdict(result));
    }
}
