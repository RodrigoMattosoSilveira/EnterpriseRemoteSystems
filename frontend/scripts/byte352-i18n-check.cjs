#!/usr/bin/env node
// Byte 35.2: deliberately separate resource integrity and UI coverage.
// Do not equate parity with a completed Portuguese-language application.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const sourceRoot = path.resolve(__dirname, '..', 'src');
const intentionalIdentifiers = new Set([
  'CPF', 'CPF:', 'RG:', 'ID', 'BRL', 'g', '×', 'Pará',
  'HH:MM', 'bootstrap-admin', 'global-support-operator',
]);
const guarded = [
  'features/gold-prices/GoldPriceForm.tsx',
  'features/gold-prices/GoldPricesPage.tsx',
  'features/price-list/PriceListPage.tsx',
  'features/price-list/PriceListItemForm.tsx',
  'features/current-accounts/SecondPersonApprovalSettingsPage.tsx',
];
function readResource(relative) {
  const file = path.join(sourceRoot, 'i18n/resources', relative);
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const values = new Map();
  function visit(node) {
    if (ts.isVariableDeclaration(node) && (node.name.text === 'enUSMessages' || node.name.text === 'ptBRMessages') && node.initializer) {
      let object = node.initializer;
      if (ts.isAsExpression(object) || ts.isSatisfiesExpression(object)) object = object.expression;
      if (!ts.isObjectLiteralExpression(object)) throw new Error(`${relative}: messages must be an object literal`);
      for (const prop of object.properties) {
        if (!ts.isPropertyAssignment(prop) || !ts.isStringLiteral(prop.initializer)) throw new Error(`${relative}: messages must be static strings`);
        const key = prop.name.text;
        if (values.has(key)) throw new Error(`${relative}: duplicate key ${key}`);
        values.set(key, prop.initializer.text);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!values.size) throw new Error(`${relative}: empty translation catalog`);
  return values;
}
function walk(dir, result = []) {
  for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
    if (entry.isDirectory()) walk(path.join(dir,entry.name),result);
    else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) result.push(path.join(dir,entry.name));
  }
  return result;
}
function jsxLiteralFindings(file) {
  const src = ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const findings=[];
  function visit(node) {
    if (ts.isJsxText(node)) {
      const value=node.text.replace(/\s+/g,' ').trim();
      if (!intentionalIdentifiers.has(value) && /[A-Za-zÀ-ÿ]/.test(value) && value !== 'Enterprise Remote Systems' && !/^BRL\s*÷/.test(value) && !/^=\s*grams$/.test(value)) {
        const line=src.getLineAndCharacterOfPosition(node.getStart(src)).line+1;
        findings.push(`${path.relative(sourceRoot,file)}:${line}: ${value.slice(0,100)}`);
      }
    }
    if (ts.isJsxAttribute(node) && ['placeholder','aria-label','alt','title'].includes(node.name.text) && node.initializer && ts.isStringLiteral(node.initializer)) {
      const value=node.initializer.text;
      if (!intentionalIdentifiers.has(value) && /[A-Za-z]/.test(value) && !/^[A-Z][A-Z_0-9]+$/.test(value)) {
        const line=src.getLineAndCharacterOfPosition(node.getStart(src)).line+1;
        findings.push(`${path.relative(sourceRoot,file)}:${line}: ${node.name.text}=${value.slice(0,100)}`);
      }
    }
    ts.forEachChild(node,visit);
  }
  visit(src);
  return findings;
}
function inspect() {
  const en=readResource('en-US.ts');const pt=readResource('pt-BR.ts');
  const failures=[];
  for(const key of en.keys()) if(!pt.has(key)) failures.push('pt-BR missing '+key);
  for(const key of pt.keys()) if(!en.has(key)) failures.push('en-US missing '+key);
  const params = s => [...new Set([...s.matchAll(/\{([a-zA-Z_][a-zA-Z_0-9]*)\}/g)].map(x=>x[1]))].sort().join(',');
  for(const [key,enValue] of en) {
    const ptValue=pt.get(key);
    if (ptValue === undefined) continue;
    if (!enValue.trim() || !ptValue.trim()) failures.push('empty translation: '+key);
    if (params(enValue)!==params(ptValue)) failures.push('placeholder mismatch: '+key);
  }
  const covered=[];
  for(const rel of guarded) {
    const file=path.join(sourceRoot,rel);
    const findings=jsxLiteralFindings(file);
    failures.push(...findings.map(x=>'guarded UI literal: '+x));
    covered.push(rel);
    const content=fs.readFileSync(file,'utf8');
    for(const match of content.matchAll(/\bt\(\s*["']([^"']+)["']/g)) if (!en.has(match[1])) failures.push(rel+': unknown key '+match[1]);
  }
  const pending=[];
  const coveredSet=new Set(covered);
  for(const file of walk(sourceRoot)) if(!coveredSet.has(path.relative(sourceRoot,file))) pending.push(...jsxLiteralFindings(file));
  return {failures, entries:en.size, guarded:covered.length, pending};
}
if (require.main === module) {
  try {
    const result=inspect();
    console.log(`Translation keys: ${result.entries}; guarded files: ${result.guarded}`);
    console.log(`Remaining untranslated JSX/attribute literals elsewhere: ${result.pending.length}`);
    if(process.argv.includes('--report')) for(const item of result.pending) console.log('PENDING: '+item);
    if(process.argv.includes('--require-complete') && result.pending.length) result.failures.push(`${result.pending.length} unconverted JSX/attribute literals remain`);
    for(const issue of result.failures) console.error('FAIL: '+issue);
    if(result.failures.length) process.exitCode=1;
    else console.log('PASS: catalog parity and static JSX text gate (runtime/manual acceptance remains separate)');
  }catch(err){console.error('FAIL:',err.message);process.exitCode=1;}
}
module.exports={readResource,jsxLiteralFindings,inspect};
