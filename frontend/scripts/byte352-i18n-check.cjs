#!/usr/bin/env node
// Byte 35.2: deliberately separate resource integrity and UI coverage.
// Do not equate parity with a completed Portuguese-language application.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const uiLiterals = require('./i18n-ui-literals.cjs');
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
// Bite 34.1 (#1056): every error code the backend can return must have an
// `apiError.code.<code>` catalog key, so new codes cannot reach users untranslated.
const backendRoot = path.resolve(__dirname, '..', '..', 'backend', 'internal');
function goSourceFiles(dir, result = []) {
  for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) goSourceFiles(full, result);
    else if (entry.name.endsWith('.go') && !entry.name.endsWith('_test.go')) result.push(full);
  }
  return result;
}
function backendErrorCodes(root = backendRoot) {
  if (!fs.existsSync(root)) return null;
  const codes = new Map();
  for (const file of goSourceFiles(root)) {
    const content = fs.readFileSync(file, 'utf8');
    for (const match of content.matchAll(/\bCode:\s*"([a-z][a-z0-9_]*)"/g)) {
      if (!codes.has(match[1])) {
        const line = content.slice(0, match.index).split('\n').length;
        codes.set(match[1], `${path.relative(root, file)}:${line}`);
      }
    }
  }
  return codes;
}
// Packages that expose ValidationFieldCodes() have adopted rule codes; inside
// them, a field error built without a code would reach users untranslated.
const UNCODED_FIELD_ERROR = [
  /ValidationError\{\s*Fields:\s*map\[string\]string\{/,
  /\bfields\[[^\]]+\]\s*=\s*"/,
  /\bNewValidationError\(map\[string\]string\{/,
];
function uncodedFieldErrors(root = backendRoot) {
  if (!fs.existsSync(root)) return [];
  const byDir = new Map();
  for (const file of goSourceFiles(root)) {
    const dir = path.dirname(file);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(file);
  }
  const findings = [];
  for (const [, files] of byDir) {
    const contents = files.map((file) => [file, fs.readFileSync(file, 'utf8')]);
    if (!contents.some(([, text]) => text.includes('ValidationFieldCodes()'))) continue;
    for (const [file, text] of contents) {
      text.split('\n').forEach((line, index) => {
        if (UNCODED_FIELD_ERROR.some((pattern) => pattern.test(line))) {
          findings.push(`${path.relative(root, file)}:${index + 1}: ${line.trim().slice(0, 100)}`);
        }
      });
    }
  }
  return findings;
}
// Every declared field rule code (`RuleX = "..."` constants, plus the shared
// constants in shared/fielderrors) must have an `apiError.rule.<code>` key.
function backendRuleCodes(root = backendRoot) {
  if (!fs.existsSync(root)) return null;
  const codes = new Map();
  for (const file of goSourceFiles(root)) {
    const content = fs.readFileSync(file, 'utf8');
    const shared = file.split(path.sep).join('/').endsWith('shared/fielderrors/fielderrors.go');
    const pattern = shared ? /^\s*[A-Z][A-Za-z0-9]*\s*=\s*"([a-z][a-z0-9_]*)"/gm : /\bRule[A-Za-z0-9]+\s*=\s*"([a-z][a-z0-9_]*)"/g;
    for (const match of content.matchAll(pattern)) {
      if (!codes.has(match[1])) {
        const line = content.slice(0, match.index).split('\n').length;
        codes.set(match[1], `${path.relative(root, file)}:${line}`);
      }
    }
  }
  return codes;
}
function missingBackendRuleKeys(en, root = backendRoot) {
  const codes = backendRuleCodes(root);
  if (codes === null) return {checked: 0, missing: []};
  const missing = [];
  for (const [code, where] of codes) if (!en.has(`apiError.rule.${code}`)) missing.push(`${code} (${where})`);
  return {checked: codes.size, missing};
}
function missingBackendErrorCodeKeys(en, root = backendRoot) {
  const codes = backendErrorCodes(root);
  if (codes === null) return {checked: 0, missing: []};
  const missing = [];
  for (const [code, where] of codes) if (!en.has(`apiError.code.${code}`)) missing.push(`${code} (${where})`);
  return {checked: codes.size, missing};
}
function inspect() {
  const en=readResource('en-US.ts');const pt=readResource('pt-BR.ts');
  const failures=[];
  const backend = missingBackendErrorCodeKeys(en);
  for (const item of backend.missing) failures.push('backend error code without apiError.code translation: '+item);
  for (const item of uncodedFieldErrors()) failures.push('backend field error without a rule code: '+item);
  const rules = missingBackendRuleKeys(en);
  for (const item of rules.missing) failures.push('backend rule code without apiError.rule translation: '+item);
  // Bite 34.1: broader scan of every frontend source file (see i18n-ui-literals.cjs).
  const uiFindings = uiLiterals.scanSource(sourceRoot);
  const ui = uiLiterals.applyExceptions(uiFindings, uiLiterals.readExceptions());
  for (const item of ui.untranslated) failures.push(`untranslated UI text: ${item.file}:${item.line} ${item.category} "${item.text}"`);
  for (const problem of ui.problems) failures.push('i18n-exceptions.json: '+problem);
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
  return {failures, entries:en.size, guarded:covered.length, pending, backendCodes:backend.checked, backendRules:rules.checked,
    uiFindings:uiFindings.length, uiUntranslated:ui.untranslated.length};
}
if (require.main === module) {
  try {
    const result=inspect();
    console.log(`Translation keys: ${result.entries}; guarded files: ${result.guarded}; backend error codes checked: ${result.backendCodes}; field rule codes checked: ${result.backendRules}`);
    console.log(`Remaining untranslated JSX/attribute literals elsewhere: ${result.pending.length}`);
    console.log(`UI text scan: ${result.uiFindings} candidate literals, ${result.uiUntranslated} not translated and not excepted`);
    if(process.argv.includes('--report')) for(const item of result.pending) console.log('PENDING: '+item);
    if(process.argv.includes('--require-complete') && result.pending.length) result.failures.push(`${result.pending.length} unconverted JSX/attribute literals remain`);
    for(const issue of result.failures) console.error('FAIL: '+issue);
    if(result.failures.length) process.exitCode=1;
    else console.log('PASS: catalog parity, backend codes and UI text scan (runtime/manual acceptance remains separate)');
  }catch(err){console.error('FAIL:',err.message);process.exitCode=1;}
}
module.exports={readResource,jsxLiteralFindings,inspect,backendErrorCodes,missingBackendErrorCodeKeys,uncodedFieldErrors,backendRuleCodes,missingBackendRuleKeys};
