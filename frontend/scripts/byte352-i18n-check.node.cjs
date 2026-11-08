'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {inspect,jsxLiteralFindings,readResource,backendErrorCodes,missingBackendErrorCodeKeys,uncodedFieldErrors,missingBackendRuleKeys}=require('./byte352-i18n-check.cjs');
const {uiLiteralFindings,applyExceptions}=require('./i18n-ui-literals.cjs');

function scanFixture(name,source){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ers341-ui-'));
 try {
  const file=path.join(dir,name);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,source);
  return uiLiteralFindings(file,dir).map(x=>`${x.category}:${x.text}`);
 } finally { fs.rmSync(dir,{recursive:true,force:true}); }
}

test('UI scan finds untranslated text in every UI position (Bite 34.1)',()=>{
 const found=scanFixture('Page.tsx',`
  const options = [{ value: "a", label: "Partial payout" }];
  function helper(code: string) { return code === "X" ? "Code is required." : ""; }
  export function Page({ busy, title = "Action completed" }: { busy: boolean; title?: string }) {
   const [, setSuccessMessage] = useState("");
   setSuccessMessage(\`Gold price for \${date} recorded.\`);
   if (!busy) throw new Error("Unable to sign in");
   return <div>
    <h1>Untranslated header</h1>
    <button>{busy ? "Creating..." : "Create Actor"}</button>
    <input placeholder="Search by name" aria-label={busy ? "Busy now" : t("ok")} />
    <Card cardName="Create actor" />
   </div>;
  }`);
 for (const expected of [
  'OBJECT_PROPERTY:Partial payout','FUNCTION_RETURN:Code is required.','COMPONENT_DEFAULT:Action completed',
  'MESSAGE_SETTER:Gold price for {} recorded.','UI_ERROR:Unable to sign in','JSX_TEXT:Untranslated header',
  'JSX_EXPRESSION:Creating...','JSX_EXPRESSION:Create Actor','JSX_ATTRIBUTE:Search by name',
  'JSX_ATTRIBUTE:Busy now','JSX_ATTRIBUTE:Create actor',
 ]) assert.ok(found.includes(expected),`missing ${expected}; found: ${found.join(' | ')}`);
});

test('UI scan ignores translated text, codes and technical strings',()=>{
 const found=scanFixture('Page.tsx',`
  const config = { label: t("price.page.code"), code: "CANTEEN", path: "/api/v1/price-list-items" };
  function unit(code: string) { if (code === "Gold Gram") return "GOLD_GRAM"; return "authz.read"; }
  export function Page({ busy }: { busy: boolean }) {
   return <div className="flex gap-2 text-sm" data-testid="price-list">
    <h1>{t("price.page.title")}</h1>
    <button>{busy ? t("common.saving") : t("common.save")}</button>
    <input placeholder={t("price.search")} type="search" />
    <span>{formatCurrency(amount, "BRL")} · {item.code}</span>
    <code>X-Tenant-ID</code>
   </div>;
  }`);
 assert.deepEqual(found,[]);
});

test('UI scan only treats Error text as UI in UI files',()=>{
 assert.deepEqual(scanFixture('utils/format.ts','export function f(v: string){ throw new Error("Invalid date value"); }'),[]);
 assert.deepEqual(scanFixture('app/store.ts','export function f(){ throw new Error("Unable to load session"); }'),['UI_ERROR:Unable to load session']);
});

test('exceptions need a reason and must still match a finding',()=>{
 const findings=[{file:'a.tsx',line:1,category:'JSX_TEXT',text:'Enterprise Remote Systems'},{file:'b.tsx',line:2,category:'JSX_TEXT',text:'Untranslated'}];
 const result=applyExceptions(findings,{
  global:[{text:'Enterprise Remote Systems',reason:'Product name'}],
  files:[{file:'c.tsx',text:'Gone text',reason:'Removed long ago'},{file:'b.tsx',text:'Untranslated',reason:''}],
 });
 assert.deepEqual(result.untranslated.map(x=>x.text),[]);
 assert.ok(result.problems.some(x=>x.includes('stale exception') && x.includes('Gone text')));
 assert.ok(result.problems.some(x=>x.includes('without text or reason')));
 const strict=applyExceptions(findings,{global:[{text:'Enterprise Remote Systems',reason:'Product name'}],files:[]});
 assert.deepEqual(strict.untranslated.map(x=>x.text),['Untranslated']);
});

test('the real frontend has no untranslated UI text outside the exceptions file',()=>{
 const result=inspect();
 assert.deepEqual(result.failures.filter(x=>x.startsWith('untranslated UI text')||x.startsWith('i18n-exceptions.json')),[]);
 assert.ok(result.uiFindings>0);
});

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
