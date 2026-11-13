import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWdeRawTranscript} from './wde-raw-caption-parser.mjs';
import {evaluateKnowledgeUnits} from './wde-knowledge-qa.mjs';

test('reads Salesforce raw caption contract, including semicolon in text',()=>{
 const c=parseWdeRawTranscript('0;100;200;Periksa sumber; bukan rumor|1;300;200;Bertindak bijak|');
 assert.equal(c.length,2);
 assert.equal(c[0].text,'Periksa sumber; bukan rumor');
 assert.equal(c[1].index,1);
});
test('rejects missing trailing delimiter',()=>assert.throws(()=>parseWdeRawTranscript('0;0;100;teks'),/UNTERMINATED/));
test('rejects duplicate or gap in caption indices',()=>assert.throws(()=>parseWdeRawTranscript('0;0;100;awal|2;100;100;akhir|'),/NONCONTIGUOUS/));
test('rejects empty caption text',()=>assert.throws(()=>parseWdeRawTranscript('0;0;100; |'),/EMPTY_CAPTION/));
test('rejects malformed numeric timestamp',()=>assert.throws(()=>parseWdeRawTranscript('0;invalid;100;awal|'),/NUMERIC/));
test('knowledge QA accepts raw transcript without reconstructing source indices',()=>{
 const r=evaluateKnowledgeUnits({
 raw_transcript:'0;0;100;Ajaran pertama|1;100;100;Ajaran berikutnya|',
 segments:[{start_index:0,end_index:1,topic:'Pengajaran',summary:'Penjelasan sumber'}],
 units:[]
 });
 assert.ok(r.structural_issues.some(i=>i.code==='UNITS_MISSING'));
 assert.ok(!r.structural_issues.some(i=>i.code==='CAPTIONS_MISSING'));
});
test('ambiguous parallel caption sources fail closed',()=>{
 const r=evaluateKnowledgeUnits({raw_transcript:'0;0;100;Ajaran|',captions:[{index:0,text:'berbeda'}],segments:[{start_index:0,end_index:0,topic:'Pengajaran',summary:'Ajaran'}],units:[]});
 assert.ok(r.structural_issues.some(i=>i.code==='CAPTION_SOURCE_AMBIGUOUS'));
});
