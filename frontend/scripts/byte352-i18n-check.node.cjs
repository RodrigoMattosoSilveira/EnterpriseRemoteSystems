'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {inspect,jsxLiteralFindings,sourceStringReviewCandidates,readResource}=require('./byte352-i18n-check.cjs');

test('English and Brazilian Portuguese catalogs have parity and interpolations',()=>{
 const result=inspect();assert.deepEqual(result.failures,[]);assert.ok(result.entries>1600);
});
test('all non-test TSX screens and shared UI components are guarded',()=>{
 const result=inspect();assert.ok(result.guarded>=100);assert.deepEqual(result.failures,[]);
});
test('detects new untranslated JSX text and attributes',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ers352-i18n-'));
 const file=path.join(dir,'fixture.tsx');
 try {
  fs.writeFileSync(file,'export function Demo(){return <div><h1>Untranslated header</h1><input placeholder="Untranslated search" /></div>;}');
  const findings=jsxLiteralFindings(file);
  assert.equal(findings.length,2);assert.ok(findings.some(x=>x.includes('Untranslated header')));
  assert.ok(findings.some(x=>x.includes('Untranslated search')));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('detects rendered conditional copy and shared component label props',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ers352-i18n-'));
 const file=path.join(dir,'fixture.tsx');
 try {
  fs.writeFileSync(file, `export function Demo({pending}){return <>
    <span>{pending ? "Loading audit events..." : "Two events shown"}</span>
    <Notice cardName="Create actor" /><Text label="Untranslated UI label" />
  </>;}`);
  const findings=jsxLiteralFindings(file);
  assert.equal(findings.length,4);
  assert.ok(findings.some(x=>x.includes('Loading audit events...')));
  assert.ok(findings.some(x=>x.includes('Two events shown')));
  assert.ok(findings.some(x=>x.includes('cardName=Create actor')));
  assert.ok(findings.some(x=>x.includes('label=Untranslated UI label')));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('intentional technical identifiers and branding are not mistaken for UI copy',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ers352-i18n-'));
 const file=path.join(dir,'fixture.tsx');
 try {
  fs.writeFileSync(file, 'export function Demo(){return <div><span>Enterprise Remote Systems</span><Text label="CPF" title="HH:MM" /></div>;}');
  assert.deepEqual(jsxLiteralFindings(file),[]);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('new display strings have both locales and identical placeholders',()=>{
 const en=readResource('en-US.ts'),pt=readResource('pt-BR.ts');
 for(const key of [
  'byte352.audit.oneEventShown','byte352.audit.eventsShown','byte352.roles.selectionUnavailable',
  'byte352.planning.selectCollaborator','byte352.planning.unselectCollaborator',
  'byte352.planning.candidateShort','byte352.planning.replacementShort',
  'byte352.auth.sessionUnavailable',
 ]){
  assert.ok(en.has(key),key);assert.ok(pt.has(key),key);
  if(key!=='byte352.planning.candidateShort') assert.notEqual(en.get(key),pt.get(key),key);
 }
 assert.equal(pt.get('byte352.audit.oneEventShown').replace('{count}','1'),'1 evento exibido');
 assert.equal(pt.get('byte352.planning.selectCollaborator').replace('{collaborator}','Joana'),'Selecionar Joana');
});
test('TS source review inventory identifies non-JSX messages without treating data as failures',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ers352-i18n-'));
 const file=path.join(dir,'fixture.ts');
 try {
  fs.writeFileSync(file, `export function demo(){throw new Error("Unable to verify session");}
   const label = {label:"Person Statuses",code:"PERSON_STATUSES"};`);
  const findings=sourceStringReviewCandidates(file);
  assert.equal(findings.length,2);
  assert.ok(findings.some(x=>x.includes('Unable to verify session')));
  assert.ok(findings.some(x=>x.includes('Person Statuses')));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('localized dynamic messages have exact parameter names',()=>{
 const en=readResource('en-US.ts'),pt=readResource('pt-BR.ts');
 for(const k of ['byte352.gold.replaced','byte352.gold.recorded','byte352.price.created','byte352.price.itemsCount']) {
  assert.ok(en.get(k)?.includes('{'));assert.ok(pt.get(k)?.includes('{'));
 }
});
