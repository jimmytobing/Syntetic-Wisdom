import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateKnowledgeUnits} from './wde-knowledge-qa.mjs';

const script='Ada kebutuhan nyata yang perlu dipahami dalam kehidupan sehari-hari. Kita dapat mengenali tekanan yang muncul dan merespons dengan langkah yang jujur dan terukur. Pesan ini bukan jaminan bahwa semua kesulitan akan hilang dengan cepat. Fokus kita adalah melihat persoalan dengan tepat, menyebutkan hal yang bisa diperbaiki, lalu melakukan satu tindakan kecil yang sesuai keadaan. Ketika muncul ketidakpastian, periksa fakta yang tersedia, jangan membuat asumsi tentang orang lain, dan mintalah bantuan yang relevan. Langkah kecil tidak selalu langsung mengubah hasil, tetapi membantu kita bertindak secara bertanggung jawab dan konsisten dalam menghadapi persoalan sehari-hari.';
const base=()=>({captions:[{index:0,text:'Ayo lihat persoalan nyata.'},{index:1,text:'Periksa sumber dan bertindak bijak.'}],
segments:[{start_index:0,end_index:1,topic:'Bertindak bijak',summary:'Pembicara mengajak memeriksa sumber.'}],
units:[{id:'u1',source_start_index:0,source_end_index:1,claim:'Periksa sumber',audience_need:'Keputusan yang bertanggung jawab',application:'Periksa informasi',original_script_45s:script,
evidence:[{index:1,quote:'Periksa sumber'}],human_review:'approved',reviewer:'Editor QA',review_notes:'Manual example only; audio and context still require checking.'}]});
test('valid structure with explicit review is eligible, never auto-published',()=>{
  const a=evaluateKnowledgeUnits(base());assert.equal(a.structural_issues.length,0);assert.equal(a.unit_reports[0].status,'STRUCTURALLY_VALID_PENDING_INDEPENDENT_REVIEW');
  assert.notEqual(a.status,'PUBLISHED');
});
test('rejects missing citation match',()=>{const a=base();a.units[0].evidence[0].quote='janji pasti sembuh';assert.equal(evaluateKnowledgeUnits(a).unit_reports[0].status,'NEEDS_REVIEW');});
test('blocks gap and overlap',()=>{const a=base();a.segments=[{start_index:0,end_index:0,topic:'A',summary:'A'},{start_index:0,end_index:1,topic:'B',summary:'B'}];assert.ok(evaluateKnowledgeUnits(a).structural_issues.some(i=>i.code==='SEGMENT_GAP_OR_OVERLAP'));});
test('never passes unreviewed model generated content',()=>{const a=base();a.units[0].human_review='pending';assert.equal(evaluateKnowledgeUnits(a).status,'BLOCKED');});
test('rejects invented evidence outside source index',()=>{const a=base();a.units[0].evidence=[{index:2,quote:'Periksa sumber'}];assert.ok(evaluateKnowledgeUnits(a).unit_reports[0].issues.some(i=>i.code==='EVIDENCE_NOT_GROUNDED'));});
test('rejects non-video-sized narratives',()=>{const a=base();a.units[0].original_script_45s='satu kalimat';assert.ok(evaluateKnowledgeUnits(a).unit_reports[0].issues.some(i=>i.code==='SCRIPT_LENGTH_REVIEW'));});

test('rejects knowledge unit that spans two baseline segments',()=>{
 const a=base();a.segments=[{start_index:0,end_index:0,topic:'Topic A',summary:'Summary A'},{start_index:1,end_index:1,topic:'Topic B',summary:'Summary B'}];
 assert.ok(evaluateKnowledgeUnits(a).unit_reports[0].issues.some(x=>x.code==='UNIT_CROSSES_SEGMENTS'));
});
test('malformed evidence item is rejected rather than throwing',()=>{
 const a=base();a.units[0].evidence=[null];
 assert.ok(evaluateKnowledgeUnits(a).unit_reports[0].issues.some(x=>x.code==='EVIDENCE_INVALID'));
});
test('null candidate is rejected rather than throwing',()=>{
 const a=base();a.units=[null];
 assert.equal(evaluateKnowledgeUnits(a).unit_reports[0].status,'NEEDS_REVIEW');
});
test('claimed manual review never produces publish approval',()=>{
 const a=base();const result=evaluateKnowledgeUnits(a);
 assert.equal(result.status,'STRUCTURALLY_VALID_PENDING_INDEPENDENT_REVIEW');
});

test('flags a likely mid-sentence cross-segment boundary for review',()=>{
 const a=base();
 a.captions=[{index:0,text:'Mungkin keadaan sudah hancur ini'},{index:1,text:'itu, tapi bukan aku.'}];
 a.segments=[{start_index:0,end_index:0,topic:'Sikap hati',summary:'Sumber bicara tentang keadaan'},{start_index:1,end_index:1,topic:'Sikap hati lanjutan',summary:'Pembicara melanjutkan gagasan'}];
 a.units[0].source_start_index=1;
 assert.ok(evaluateKnowledgeUnits(a).boundary_warnings.some(x=>x.code==='POSSIBLE_MID_SENTENCE_SPLIT'));
});
test('does not turn a boundary warning into an invented source correction',()=>{
 const a=base();
 a.captions=[{index:0,text:'Akan ada kelanjutan'},{index:1,text:'di bagian berikutnya.'}];
 a.segments=[{start_index:0,end_index:0,topic:'Awal',summary:'Kelanjutan'},{start_index:1,end_index:1,topic:'Lanjutan',summary:'Berikutnya'}];
 assert.equal(evaluateKnowledgeUnits(a).segments,undefined);
});
