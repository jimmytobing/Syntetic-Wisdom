// Offline calibration metrics for an independent *audio* classifier.
// A metric is NOT an authenticated gold-label source or Salesforce release authorization.
// All samples must be sourced independently from production model predictions.
const TYPES=['Teaching','Testimony','Prayer','Worship','Other'];
const err=(x)=>{throw Error(x)};
export function evaluateAudioQaCalibration({samples,minimumPerClass=5,minPrecision=0.95,minRecall=0.90}={}){
  if(!Array.isArray(samples)||!Number.isSafeInteger(minimumPerClass)||minimumPerClass<5||
    !Number.isFinite(minPrecision)||minPrecision<0.95||minPrecision>1||
    !Number.isFinite(minRecall)||minRecall<0.9||minRecall>1)
    err('CALIBRATION_POLICY_INVALID');
  const seen=new Set();
  const confusion=Object.fromEntries(TYPES.map(x=>[x,{tp:0,fp:0,fn:0,goldCount:0}]));
  const findings=[];
  for(const item of samples){
    if(typeof item?.id!=='string'||!item.id||seen.has(item.id)||
      typeof item?.sourceId!=='string'||!item.sourceId||
      !TYPES.includes(item.goldLabel)||!TYPES.includes(item.audioPrediction)||
      item.goldEvidenceOrigin!=='INDEPENDENT_AUDIO_BENCHMARK')
      err('CALIBRATION_SAMPLE_INVALID_OR_DUPLICATE');
    seen.add(item.id);
    confusion[item.goldLabel].goldCount++;
    if(item.goldLabel===item.audioPrediction)confusion[item.goldLabel].tp++;
    else {confusion[item.goldLabel].fn++;confusion[item.audioPrediction].fp++;}
  }
  const perClass=TYPES.map(type=>{
    const m=confusion[type];
    const precision=m.tp+m.fp===0?0:m.tp/(m.tp+m.fp);
    const recall=m.goldCount===0?0:m.tp/m.goldCount;
    if(m.goldCount<minimumPerClass)findings.push(type+'_GOLD_UNDERSAMPLED');
    if(precision<minPrecision)findings.push(type+'_PRECISION_TOO_LOW');
    if(recall<minRecall)findings.push(type+'_RECALL_TOO_LOW');
    return {type,goldCount:m.goldCount,tp:m.tp,fp:m.fp,fn:m.fn,precision,recall};
  });
  const distinctSources=new Set(samples.map(x=>x.sourceId)).size;
  if(distinctSources<3)findings.push('SOURCE_DIVERSITY_INSUFFICIENT');
  return {
    metricsPassed:findings.length===0,perClass,distinctSources,findings,
    // Input assertions cannot authenticate origin or enforce an unforgeable model lineage.
    // Production release must separately verify protected gold provenance and model identity.
    calibrationAuthorityVerified:false,releaseAuthorized:false
  };
}
