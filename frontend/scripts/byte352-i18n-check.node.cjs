'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {inspect,jsxLiteralFindings,readResource}=require('./byte352-i18n-check.cjs');

test('English and Brazilian Portuguese catalogs have parity and interpolations',()=>{
 const result=inspect();assert.deepEqual(result.failures,[]);assert.ok(result.entries>1600);
});
test('all five selected customer screens contain no literal JSX copy',()=>{
 const result=inspect();assert.equal(result.guarded,5);assert.deepEqual(result.failures,[]);
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
test('localized dynamic messages have exact parameter names',()=>{
 const en=readResource('en-US.ts'),pt=readResource('pt-BR.ts');
 for(const k of ['byte352.gold.replaced','byte352.gold.recorded','byte352.price.created','byte352.price.itemsCount']) {
  assert.ok(en.get(k)?.includes('{'));assert.ok(pt.get(k)?.includes('{'));
 }
});
