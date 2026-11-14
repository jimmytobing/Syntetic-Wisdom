import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectOpeningHandoffs } from './wde-opener-handoff-qa.mjs';
const captions=[87,88,89,90,91,92];
test('fails baseline before fix when host is merged into testimony',()=>{
 const s=[{start_index:87,end_index:91,segment_type:'Testimony'},{start_index:92,end_index:127,segment_type:'Testimony'}];
 const r=inspectOpeningHandoffs(s,captions);
 assert.equal(r.pass,false);
 assert.ok(r.findings.some(x=>x.index===87&&x.code==='SPEAKER_HANDOFF_MISMATCH'));
});
test('fails current post-deploy boundary at 87–90',()=>{
 const s=[{start_index:56,end_index:90,segment_type:'Testimony'},{start_index:91,end_index:115,segment_type:'Testimony'}];
 const r=inspectOpeningHandoffs(s,captions);
 assert.equal(r.pass,false);
 assert.ok(r.findings.some(x=>x.index===91&&x.code==='SPEAKER_HANDOFF_MISMATCH'));
});
test('passes source-grounded host handoff, regardless other segment grouping',()=>{
 const s=[{start_index:56,end_index:86,segment_type:'Testimony'},{start_index:87,end_index:91,segment_type:'Other'},{start_index:92,end_index:127,segment_type:'Testimony'}];
 assert.equal(inspectOpeningHandoffs(s,captions).pass,true);
});
test('fails gap and duplicated coverage rather than approving missing evidence',()=>{
 const s=[{start_index:87,end_index:91,segment_type:'Other'},{start_index:91,end_index:127,segment_type:'Testimony'}];
 const r=inspectOpeningHandoffs(s,captions);
 assert.ok(r.findings.some(x=>x.index===91&&x.code==='COVERAGE_INVALID'));
});
test('fails if source caption input is incomplete',()=>{
 const s=[{start_index:87,end_index:91,segment_type:'Other'},{start_index:92,end_index:127,segment_type:'Testimony'}];
 assert.equal(inspectOpeningHandoffs(s,[87,88]).pass,false);
});
