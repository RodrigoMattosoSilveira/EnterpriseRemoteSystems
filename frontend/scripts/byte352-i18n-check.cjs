#!/usr/bin/env node
// Byte 35.2: catalog parity plus full-tree static presentation checks.
// This cannot prove runtime localization of API, database or server-supplied strings.
// Intentional stable identifiers are excluded only at display boundaries.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const sourceRoot = path.resolve(__dirname, '..', 'src');
const intentionalIdentifiers = new Set([
  'CPF', 'CPF:', 'RG:', 'ID', 'BRL', 'g', '×', 'Pará',
  'HH:MM', 'bootstrap-admin', 'global-support-operator',
]);
// All application TSX screens/components are guarded; no hard-coded five-file list.
const uiTextAttributes = new Set([
  'placeholder', 'aria-label', 'alt', 'title',
  'label', 'cardName', 'helperText', 'emptyMessage', 'message', 'tooltip',
]);
const literalUiPhrase = value => /\b[A-Za-zÀ-ÿ]{3,}\s+[A-Za-zÀ-ÿ]{2,}\b/.test(value)
  && !/^[A-Z][A-Z0-9_]+(?:\s+[A-Z][A-Z0-9_]+)*$/.test(value);

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
    else if (/\.tsx?$/.test(entry.name) && !/\.(?:test|spec)\.tsx?$/.test(entry.name)
      && !entry.name.endsWith('.d.ts')) result.push(path.join(dir,entry.name));
  }
  return result;
}
function dynamicJsxText(node) {
  // Inspect strings in rendered JSX expressions, including conditionals/template
  // literals. Do not inspect event handlers, className, keys, routes or API calls.
  const issues = [];
  function visit(expr) {
    // Nested JSX is checked separately; never interpret its className, route,
    // data-testid or React props as visible string expressions.
    if (ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr)
      || ts.isJsxFragment(expr) || ts.isJsxOpeningElement(expr)) return;
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
      if (literalUiPhrase(expr.text)) issues.push(expr.text);
    } else if (ts.isTemplateExpression(expr)) {
      const displayText = [expr.head.text, ...expr.templateSpans.map(span => span.literal.text)].join(' ');
      if (literalUiPhrase(displayText)) issues.push(displayText);
      for (const span of expr.templateSpans) visit(span.expression);
      return;
    }
    ts.forEachChild(expr, visit);
  }
  if (node.expression) visit(node.expression);
  return issues;
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
    if (ts.isJsxAttribute(node) && uiTextAttributes.has(node.name.text)
      && node.initializer && ts.isStringLiteral(node.initializer)) {
      const value=node.initializer.text;
      if (!intentionalIdentifiers.has(value) && /[A-Za-z]/.test(value)
        && !/^[A-Z][A-Z_0-9]+$/.test(value)) {
        const line=src.getLineAndCharacterOfPosition(node.getStart(src)).line+1;
        findings.push(`${path.relative(sourceRoot,file)}:${line}: ${node.name.text}=${value.slice(0,100)}`);
      }
    }
    if (ts.isJsxExpression(node) && (ts.isJsxElement(node.parent)
      || ts.isJsxFragment(node.parent))) {
      for (const value of dynamicJsxText(node)) {
        const line=src.getLineAndCharacterOfPosition(node.getStart(src)).line+1;
        findings.push(`${path.relative(sourceRoot,file)}:${line}: JSX expression=${value.slice(0,100)}`);
      }
    }
    ts.forEachChild(node,visit);
  }
  visit(src);
  return findings;
}
// Advisory inventory of ambiguous source strings: not every literal is UI.
// Preserve domain/API identifiers and authorization decision strings. Review
// the human-visible boundary before converting or exempting these candidates.
function sourceStringReviewCandidates(file) {
  const src = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest, true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const findings = [];
  function report(node, category, value) {
    if (!literalUiPhrase(value)) return;
    const line = src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1;
    findings.push(`${path.relative(sourceRoot,file)}:${line}: ${category}=${value.slice(0,100)}`);
  }
  function visit(node) {
    if (ts.isNewExpression(node) && node.expression.getText(src) === 'Error'
      && node.arguments?.length && ts.isStringLiteral(node.arguments[0])) {
      report(node, 'Error', node.arguments[0].text);
    }
    if (ts.isPropertyAssignment(node)
      && ['label','title','description','reason','message','helperText','errorMessage']
        .includes(node.name.getText(src))) {
      const value = node.initializer;
      if (ts.isStringLiteral(value)) report(node, node.name.getText(src), value.text);
      else if (ts.isTemplateExpression(value)) {
        report(node, node.name.getText(src),
          [value.head.text, ...value.templateSpans.map(span => span.literal.text)].join(' '));
      }
    }
    ts.forEachChild(node, visit);
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
  const guardedFiles = walk(sourceRoot).filter(file => file.endsWith('.tsx'));
  for (const file of guardedFiles) failures.push(...jsxLiteralFindings(file).map(x => 'untranslated UI: '+x));
  // Validate literal translation keys across all application source (including .ts).
  for (const file of walk(sourceRoot)) {
    if (file.includes(`${path.sep}i18n${path.sep}resources${path.sep}`)) continue;
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\bt\(\s*["']([^"']+)["']/g)) {
      if (!en.has(match[1])) failures.push(`${path.relative(sourceRoot,file)}: unknown key ${match[1]}`);
    }
  }
  const review = walk(sourceRoot)
    .filter(file => !file.includes(`${path.sep}i18n${path.sep}resources${path.sep}`))
    .flatMap(sourceStringReviewCandidates);
  return {failures, entries:en.size, guarded:guardedFiles.length, review};
}
if (require.main === module) {
  try {
    const result=inspect();
    console.log(`Translation keys per locale: ${result.entries}; guarded TSX files: ${result.guarded}`);
    console.log(`Static JSX/text-expression/attribute findings: ${result.failures.filter(x => x.startsWith('untranslated UI:')).length}`);
    console.log(`Source-string review candidates (non-gating): ${result.review.length}`);
    if (process.argv.includes('--report')) for (const item of result.review) console.log('REVIEW: ' + item);
    for(const issue of result.failures) console.error('FAIL: '+issue);
    if(result.failures.length) process.exitCode=1;
    else console.log('PASS: catalog parity and full-tree static TSX UI text gate (runtime/manual acceptance remains separate)');
  }catch(err){console.error('FAIL:',err.message);process.exitCode=1;}
}
module.exports={readResource,jsxLiteralFindings,sourceStringReviewCandidates,inspect};
