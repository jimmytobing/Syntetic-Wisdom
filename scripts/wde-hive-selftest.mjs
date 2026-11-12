import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Local source-level tests only. These do NOT verify Salesforce Flow execution.
// No network calls, no GitHub/Salesforce credentials and no npm dependencies.
const root = new URL('../force-app/main/default/', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const flowNames = ['WDE_Recalculate_HIVE', 'WDE_Propose_Content_Plan', 'WDE_Daily_HIVE_Planning'];
function balancedTags(xml) {
  const stack = [];
  for (const [token] of xml.matchAll(/<[^>]+>/g)) {
    if (token.startsWith('<?') || token.startsWith('<!') || token.endsWith('/>')) continue;
    const name = token.match(/^<\/?([\w:-]+)/)?.[1];
    if (!name) continue;
    if (token.startsWith('</')) assert.equal(stack.pop(), name, 'unbalanced XML tags');
    else stack.push(name);
  }
  assert.deepEqual(stack, []);
}
function referencesResolve(xml) {
  const elements = new Set(
    [...xml.matchAll(/<(?:actionCalls|assignments|decisions|recordLookups|recordCreates|recordUpdates|loops|subflows)>\s*<name>([^<]+)<\/name>/g)]
      .map(m => m[1])
  );
  for (const [, target] of xml.matchAll(/<targetReference>([^<]+)<\/targetReference>/g)) {
    assert.ok(elements.has(target), 'Unresolved Flow target: ' + target);
  }
}
function score({volume, intensity, growth, recency, quality, status}) {
  if (status !== 'Ready' || [volume,intensity,growth,recency,quality].some(n => n === null)) return null;
  return Math.round((volume*.30+intensity*.25+growth*.20+recency*.15+quality*.10)*100)/100;
}
function aggregate(signals, today='2026-11-12') {
  const reference=Date.parse(today+'T00:00:00Z'), dedup=new Map();
  for (const item of signals) {
    const age=(reference-Date.parse(item.date+'T00:00:00Z'))/86400000;
    if(item.key && Number.isInteger(age) && age>=0 && age<28 && !dedup.has(item.key)) dedup.set(item.key,{age,evidence:item.evidence||null});
  }
  const ages=[...dedup.values()].map(x=>x.age), volume=ages.length;
  const last7=ages.filter(age=>age<7).length;
  const prev7=ages.filter(age=>age>=7&&age<14).length;
  const growth=last7===0?0:prev7===0?100:Math.min(100,Math.max(0,50+50*(last7-prev7)/prev7));
  const recency=volume===0?0:Math.max(0,100-100*Math.min(...ages)/28);
  return {volume,last7,prev7,normalizedVolume:Math.min(100,volume*5),growth,recency,status:volume<3?'Insufficient Data':([...dedup.values()].every(x=>x.evidence && /^U[0-4]\|Q[1-3]\|V1$/.test(x.evidence))?'Ready':'Incomplete')};
}
for (const name of flowNames) {
  test(name + ' has the intended activation status, connected graph and no callouts', () => {
    const xml=read('flows/'+name+'.flow-meta.xml');
    balancedTags(xml); referencesResolve(xml);
    assert.match(xml, /<status>Active<\/status>/);
    assert.doesNotMatch(xml, /<actionType>externalService<\/actionType>/);
  });
}
test('HIVE formula weights match contract and only emit Ready scores', () => {
  const xml=read('objects/WDE_Audience_Need__c/fields/HIVE_Score__c.field-meta.xml');
  balancedTags(xml);
  for(const weight of ['0.30','0.25','0.20','0.15','0.10']) assert.ok(xml.includes(weight));
  assert.ok(xml.includes('Ready'));
  assert.equal(score({volume:35,intensity:null,growth:66.67,recency:100,quality:null,status:'Incomplete'}),null);
  assert.equal(score({volume:35,intensity:80,growth:66.67,recency:100,quality:90,status:'Ready'}),67.83);
});
test('28-day window handles duplicates and future-dated comments',()=>{
  const sample=[
    {key:'a',date:'2026-11-12'},{key:'b',date:'2026-11-11'},
    {key:'c',date:'2026-11-08'},{key:'d',date:'2026-11-05'},
    {key:'e',date:'2026-11-04'},{key:'f',date:'2026-11-02'},
    {key:'g',date:'2026-11-10'},{key:'a',date:'2026-11-12'},
    {key:'future',date:'2026-11-13'}
  ];
  assert.deepEqual([aggregate(sample).volume,aggregate(sample).last7,aggregate(sample).prev7],[7,4,3]);
  assert.equal(aggregate(sample.slice(0,2)).status,'Insufficient Data');
  assert.equal(aggregate([]).status,'Insufficient Data');
});
test('content plan has stable unique External ID and human review status',()=>{
  const key=read('objects/WDE_Content_Plan__c/fields/Plan_Key__c.field-meta.xml');
  const status=read('objects/WDE_Content_Plan__c/fields/Status__c.field-meta.xml');
  const flow=read('flows/WDE_Propose_Content_Plan.flow-meta.xml');
  balancedTags(key);balancedTags(status);
  assert.match(key, /<unique>true<\/unique>/);
  assert.match(key, /<externalId>true<\/externalId>/);
  assert.match(flow, /<name>Get_Existing_Plan<\/name>/);
  assert.match(flow, /\{!Get_Audience_Need\.Id\} &amp; &quot;\|YOUTUBE_SHORTS\|&quot;/);
  assert.doesNotMatch(flow, /\{!Get_Audience_Need\.Need_Key__c\} &amp; &quot;\|YOUTUBE_SHORTS\|&quot;/);
  assert.match(flow, /<stringValue>Proposed<\/stringValue>/);
  assert.doesNotMatch(flow,/Publish_YouTube|Upload_Video|externalService/);
});
test('HIVE DML is outside source record loop',()=>{
  const xml=read('flows/WDE_Recalculate_HIVE.flow-meta.xml');
  assert.match(xml, /<noMoreValuesConnector><targetReference>Evidence_Sufficient<\/targetReference><\/noMoreValuesConnector>/);
  assert.match(xml, /<name>Clear_Unverified_Rubric<\/name>/);
  assert.match(xml, /<name>Set_Evidence_Averages<\/name>/);
  assert.equal([...xml.matchAll(/<recordUpdates>/g)].length,1);
  assert.equal([...xml.matchAll(/<recordCreates>/g)].length,0);
});

test('HIVE rubric is strictly evidence-backed and does not create false Ready scores', () => {
  const ingest=read('flows/WDE_Fetch_YouTube_Comments.flow-meta.xml');
  const hive=read('flows/WDE_Recalculate_HIVE.flow-meta.xml');
  const evidenceField=read('objects/WDE_Audience_Signal__c/fields/HIVE_Evidence_Codes__c.field-meta.xml');
  balancedTags(ingest); referencesResolve(ingest); balancedTags(hive); balancedTags(evidenceField);
  assert.match(ingest, /ID\|CATEGORY\|CONTEXT\|U0\.\.U4\|Q1\.\.Q3\|END/);
  assert.match(ingest, /<name>f_HIVE_EvidenceCodes<\/name>/);
  assert.match(ingest, /varR_CurrentSignal\.HIVE_Evidence_Codes__c/);
  assert.match(hive, /<name>f_RubricIsValid<\/name>/);
  assert.match(hive, /<name>Evidence_Sufficient<\/name>/);
  assert.match(hive, /<name>Clear_Unverified_Rubric<\/name>/);
  assert.match(hive, /<name>varN_EvidencedCount<\/name>/);
  assert.match(hive, /<name>f_AverageIntensity<\/name>/);
  assert.match(hive, /<name>f_AverageQuality<\/name>/);
  const latest=[
    {key:'a',date:'2026-11-12',evidence:'U3|Q3|V1'},
    {key:'b',date:'2026-11-11',evidence:'U1|Q1|V1'},
    {key:'c',date:'2026-11-10',evidence:'U0|Q2|V1'}
  ];
  assert.equal(aggregate(latest).status,'Ready');
  assert.equal(aggregate(latest.map((v,i)=>i===1?{...v,evidence:null}:v)).status,'Incomplete');
  assert.equal(aggregate(latest.map((v,i)=>i===0?{...v,evidence:'U4|Q0|V1'}:v)).status,'Incomplete');
  assert.equal(aggregate(latest.slice(0,2)).status,'Insufficient Data');
  assert.match(ingest, /Never reproduce names, handles/);
});

test('scheduled orchestration recalculates each Need before considering idempotent proposal', () => {
  const xml=read('flows/WDE_Daily_HIVE_Planning.flow-meta.xml');
  balancedTags(xml);referencesResolve(xml);
  assert.match(xml, /<triggerType>Scheduled<\/triggerType>/);
  assert.match(xml, /<frequency>Daily<\/frequency>/);
  assert.match(xml, /<object>WDE_Audience_Need__c<\/object>/);
  assert.match(xml, /<flowName>WDE_Recalculate_HIVE<\/flowName>/);
  assert.match(xml, /<flowName>WDE_Propose_Content_Plan<\/flowName>/);
  assert.match(xml, /<name>Recalc_Was_Successful<\/name>/);
  assert.equal([...xml.matchAll(/<loops>/g)].length,0);
  assert.equal([...xml.matchAll(/<recordUpdates>/g)].length,0);
  assert.equal([...xml.matchAll(/<actionCalls>/g)].length,0);
});
