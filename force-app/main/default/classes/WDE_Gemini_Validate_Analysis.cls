/**
 * Strict structural gate for Gemini-generated short-video JSON.
 * Read-only and bulk-safe: no DML, callouts, or sensitive payload logging.
 * Semantic verification of audio remains a separate editorial task.
 */
public with sharing class WDE_Gemini_Validate_Analysis {
    public class Request {
        @InvocableVariable(required=true)
        public String analysisJson;
        @InvocableVariable
        public Integer clipSeconds;
    }

    public class Result {
        @InvocableVariable public Boolean valid;
        @InvocableVariable public String errorMessage;
        @InvocableVariable public String normalizedJson;
        @InvocableVariable public Integer segmentCount;
    }

    @InvocableMethod(label='Validate Gemini Video JSON' description='Validate schema, video accessibility and clip timestamps before Flow persistence.')
    public static List<Result> validate(List<Request> requests) {
        List<Result> output = new List<Result>();
        for (Request input : requests) {
            Result result = new Result();
            result.valid = false;
            result.segmentCount = 0;
            try {
                if (input == null || String.isBlank(input.analysisJson) || input.analysisJson.length() > 32000) {
                    throw new ValidationError('JSON missing or larger than 32000 characters');
                }
                Integer clip = input.clipSeconds == null ? 20 : input.clipSeconds;
                if (clip < 1 || clip > 120) throw new ValidationError('Unsupported clip duration');
                Map<String, Object> root = (Map<String, Object>) JSON.deserializeUntyped(input.analysisJson);
                if (root == null || root.size() != 3 ||
                    !root.containsKey('summary') || !root.containsKey('segments') ||
                    !root.containsKey('video_accessible')) {
                    throw new ValidationError('Invalid top-level JSON schema');
                }
                if (!(root.get('video_accessible') instanceof Boolean) ||
                    root.get('video_accessible') != true) {
                    throw new ValidationError('Video was not confirmed accessible by the model');
                }
                if (!(root.get('summary') instanceof String) ||
                    String.isBlank((String) root.get('summary')) ||
                    ((String) root.get('summary')).length() > 1000) {
                    throw new ValidationError('Invalid summary');
                }
                List<Object> items = (List<Object>) root.get('segments');
                if (items == null || items.isEmpty() || items.size() > 3) {
                    throw new ValidationError('Expected 1 to 3 segments');
                }
                Integer lastEnd = -1;
                for (Object item : items) {
                    Map<String, Object> segment = (Map<String, Object>) item;
                    if (segment == null || segment.size() != 3 ||
                        !segment.containsKey('timestamp') ||
                        !segment.containsKey('topic') ||
                        !segment.containsKey('evidence')) {
                        throw new ValidationError('Invalid segment schema');
                    }
                    if (!(segment.get('timestamp') instanceof String) ||
                        !(segment.get('topic') instanceof String) ||
                        !(segment.get('evidence') instanceof String)) {
                        throw new ValidationError('Invalid segment field type');
                    }
                    String timestamp = (String) segment.get('timestamp');
                    String topic = (String) segment.get('topic');
                    String evidence = (String) segment.get('evidence');
                    if (String.isBlank(topic) || topic.length() > 255 ||
                        String.isBlank(evidence) || evidence.length() > 2000) {
                        throw new ValidationError('Empty or oversized segment content');
                    }
                    if (!Pattern.compile('^[0-9]{2}:[0-9]{2} - [0-9]{2}:[0-9]{2}$')
                        .matcher(timestamp).matches()) {
                        throw new ValidationError('Timestamp format must be mm:ss - mm:ss');
                    }
                    Integer startSec = parseSecond(timestamp.substring(0, 5));
                    Integer endSec = parseSecond(timestamp.substring(8, 13));
                    if (startSec < 0 || endSec <= startSec || endSec > clip ||
                        (lastEnd >= 0 && startSec < lastEnd)) {
                        throw new ValidationError('Invalid, overlapping or out-of-clip timestamps');
                    }
                    lastEnd = endSec;
                }
                result.normalizedJson = JSON.serialize(root);
                if (result.normalizedJson.length() > 32768) {
                    throw new ValidationError('Normalized JSON exceeds field length');
                }
                result.segmentCount = items.size();
                result.valid = true;
            } catch (Exception ex) {
                result.errorMessage = ex instanceof ValidationError
                    ? ex.getMessage() : 'Malformed JSON or invalid field types';
            }
            output.add(result);
        }
        return output;
    }

    private static Integer parseSecond(String timecode) {
        Integer minutes = Integer.valueOf(timecode.substring(0, 2));
        Integer seconds = Integer.valueOf(timecode.substring(3, 5));
        if (seconds >= 60) throw new ValidationError('Invalid timestamp seconds');
        return minutes * 60 + seconds;
    }

    private class ValidationError extends Exception {}
}
