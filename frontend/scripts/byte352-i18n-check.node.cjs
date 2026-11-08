'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {inspect,jsxLiteralFindings,readResource,backendErrorCodes,missingBackendErrorCodeKeys}=require('./byte352-i18n-check.cjs');

test('every backend error code has an apiError.code translation (Bite 34.1)',()=>{
 const result=inspect();
 assert.ok(result.backendCodes>=40,`expected the backend error codes to be scanned, got ${result.backendCodes}`);
 assert.deepEqual(result.failures.filter(x=>x.startsWith('backend error code')),[]);
});
test('detects a new backend error code without a translation and ignores test files',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ers341-codes-'));
 try {
  fs.mkdirSync(path.join(dir,'widgets'));
  fs.writeFileSync(path.join(dir,'widgets','handler.go'),'package widgets\nvar e = APIError{Code: "widget_conflict", Message: "Widget conflict"}\nvar f = APIError{Code: "forbidden", Message: "No"}\n');
  fs.writeFileSync(path.join(dir,'widgets','handler_test.go'),'package widgets\nvar g = APIError{Code: "test_only_code"}\n');
  const codes=backendErrorCodes(dir);
  assert.deepEqual([...codes.keys()].sort(),['forbidden','widget_conflict']);
  const {missing}=missingBackendErrorCodeKeys(readResource('en-US.ts'),dir);
  assert.equal(missing.length,1);assert.ok(missing[0].startsWith('widget_conflict (widgets/handler.go:2)'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

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
