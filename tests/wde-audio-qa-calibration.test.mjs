import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateAudioQaCalibration} from '../scripts/wde-audio-qa-calibration.mjs';
const labels=['Teaching','Testimony','Prayer','Worship','Other'];
const make=(wrong=false)=>labels.flatMap((label,i)=>Array.from({length:6},(_,j)=>({
  id:'gold-'+i+'-'+j,sourceId:'source-'+(j%3),goldLabel:label,
  audioPrediction:wrong&&i===0&&j<2?'Prayer':label,
  goldEvidenceOrigin:'INDEPENDENT_AUDIO_BENCHMARK'
})));
test('accurate multi-source benchmark can pass metrics but not self-authorize release',()=>{
  const r=evaluateAudioQaCalibration({samples:make()});
  assert.equal(r.metricsPassed,true);
  assert.equal(r.distinctSources,3);
  assert.equal(r.releaseAuthorized,false);
  assert.equal(r.calibrationAuthorityVerified,false);
});
test('confusion, small samples and poor precision/recall block calibration metrics',()=>{
  const r=evaluateAudioQaCalibration({samples:make(true)});
  assert.equal(r.metricsPassed,false);
  assert.ok(r.findings.includes('Teaching_RECALL_TOO_LOW'));
  assert.ok(r.findings.includes('Prayer_PRECISION_TOO_LOW'));
  const small=evaluateAudioQaCalibration({samples:make().slice(0,6)});
  assert.equal(small.metricsPassed,false);
  assert.ok(small.findings.some(x=>x.endsWith('_GOLD_UNDERSAMPLED')));
});
test('source diversity cannot be inferred from many clips of a single video',()=>{
  const rows=make().map(x=>({...x,sourceId:'single-video'}));
  const r=evaluateAudioQaCalibration({samples:rows});
  assert.equal(r.metricsPassed,false);
  assert.ok(r.findings.includes('SOURCE_DIVERSITY_INSUFFICIENT'));
});
test('wrong or missing gold provenance and duplicated benchmark keys reject input',()=>{
  assert.throws(()=>evaluateAudioQaCalibration({samples:[
    {...make()[0],goldEvidenceOrigin:'GROQ_PRIMARY_OUTPUT'}]}),/INVALID_OR_DUPLICATE/);
  assert.throws(()=>evaluateAudioQaCalibration({samples:[make()[0],make()[0]]}),/INVALID_OR_DUPLICATE/);
});
test('policy cannot be weakened below recall or precision floors',()=>{
  assert.throws(()=>evaluateAudioQaCalibration({samples:make(),minPrecision:0.2}),/POLICY_INVALID/);
  assert.throws(()=>evaluateAudioQaCalibration({samples:make(),minimumPerClass:1}),/POLICY_INVALID/);
});
