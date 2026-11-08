'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {inspect,jsxLiteralFindings,readResource,backendErrorCodes,missingBackendErrorCodeKeys,uncodedFieldErrors,missingBackendRuleKeys}=require('./byte352-i18n-check.cjs');

test('every backend field rule code has an apiError.rule translation (Bite 34.1)',()=>{
 const result=inspect();
 assert.ok(result.backendRules>=50,`expected the backend rule codes to be scanned, got ${result.backendRules}`);
 assert.deepEqual(result.failures.filter(x=>x.startsWith('backend rule code')),[]);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ers341-rules-'));
 try {
  fs.writeFileSync(path.join(dir,'v.go'),'package v\nconst (\n\tRuleShiny = "shiny_new_rule"\n\tRuleOld = "required"\n)\n');
  const {missing}=missingBackendRuleKeys(readResource('en-US.ts'),dir);
  assert.deepEqual(missing,['shiny_new_rule (v.go:3)']);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('packages with rule codes cannot add an uncoded field error (Bite 34.1)',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ers341-fields-'));
 try {
  fs.mkdirSync(path.join(dir,'coded'));fs.mkdirSync(path.join(dir,'legacy'));
  fs.writeFileSync(path.join(dir,'coded','validation.go'),'package coded\nfunc (e ValidationError) ValidationFieldCodes() map[string]string { return e.Codes }\n');
  fs.writeFileSync(path.join(dir,'coded','service.go'),'package coded\nfunc a() error { return ValidationError{Fields: map[string]string{"x": "Bad"}} }\nfunc b(fields map[string]string) { fields["y"] = "Bad" }\nfunc c() error { return fieldError("z", "rule", "Bad") }\n');
  fs.writeFileSync(path.join(dir,'legacy','service.go'),'package legacy\nfunc a() error { return ValidationError{Fields: map[string]string{"x": "Bad"}} }\n');
  const findings=uncodedFieldErrors(dir);
  assert.equal(findings.length,2,findings.join('\n'));
  assert.ok(findings.every(x=>x.startsWith('coded'+path.sep+'service.go:')));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

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
