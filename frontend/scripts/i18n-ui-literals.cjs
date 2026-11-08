'use strict';
// Bite 34.1 (#1056): find user-visible text in frontend source that does not
// come from the i18n catalog. See docs/bite-35/byte-352-i18n-guard-spec.md.
//
// A finding is a human-readable string literal or template in a position that
// reaches the screen. Anything passed to a function call (t(...), formatters,
// API helpers, ...) is ignored, so translated text never matches.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const sourceRoot = path.resolve(__dirname, '..', 'src');

const SKIPPED_DIRS = new Set(['test', 'dev', 'generated', 'resources']);
const TEXT_ATTRIBUTES = new Set([
  'label', 'placeholder', 'title', 'alt', 'aria-label', 'aria-description',
  'helperText', 'cardName', 'submitLabel', 'pendingLabel', 'continueLabel', 'emptyMessage',
]);
const DISPLAY_PROPERTIES = new Set([
  'label', 'title', 'message', 'description', 'placeholder', 'helperText', 'heading', 'emptyMessage',
]);
const MESSAGE_SETTER = /^set[A-Za-z0-9]*(Message|Error|Notice|Feedback)$/;
const UI_ERROR_DIRS = ['app/', 'api/'];

function walk(dir, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) walk(path.join(dir, entry.name), result);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      result.push(path.join(dir, entry.name));
    }
  }
  return result;
}

function normalize(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/** Human-readable text, as opposed to codes, identifiers, paths or symbols. */
function looksHuman(raw) {
  const text = normalize(raw);
  if (!/[A-Za-zÀ-ÿ]{2,}/.test(text)) return false;
  if (/^(https?:)?\/\//.test(text) || /^\//.test(text)) return false; // URL or route
  if (/^[a-z]{2}(-[A-Z]{2})?$/.test(text)) return false; // locale tag
  if (/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/.test(text)) return false; // CODE
  if (/^[A-Za-z0-9]+([._:/-][A-Za-z0-9]+)+$/.test(text) && !/\s/.test(text)) return false; // identifier.path
  if (/^X-[A-Za-z-]+$/.test(text)) return false; // HTTP header
  if (/^[a-z][a-zA-Z0-9]*$/.test(text)) return false; // camelCase identifier
  return /[A-Za-zÀ-ÿ]{2,}\s+[A-Za-zÀ-ÿ]/.test(text) || /^[A-ZÀ-Ý][a-zà-ÿ]/.test(text) || /[.…?!]$/.test(text);
}

function templateText(node) {
  return node.head.text + node.templateSpans.map((span) => '{}' + span.literal.text).join('');
}

function literalText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return templateText(node);
  return null;
}

/** String literals/templates an expression can evaluate to, without entering calls or functions. */
function displayedLiterals(expression) {
  const found = [];
  const visit = (node) => {
    if (!node) return;
    const text = literalText(node);
    if (text !== null) {
      found.push({ node, text });
      return;
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node) || ts.isFunctionLike(node)) return;
    // Object/array literals are data; their display properties are checked as OBJECT_PROPERTY.
    if (ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node)) return;
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) return; // visited separately
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
          op === ts.SyntaxKind.EqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsToken) return;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) return visit(node.right);
    }
    if (ts.isConditionalExpression(node)) {
      visit(node.whenTrue);
      visit(node.whenFalse);
      return;
    }
    if (ts.isElementAccessExpression(node) || ts.isPropertyAccessExpression(node)) return;
    ts.forEachChild(node, visit);
  };
  visit(expression);
  return found;
}

function componentName(node) {
  for (let current = node; current; current = current.parent) {
    if ((ts.isFunctionDeclaration(current) || ts.isVariableDeclaration(current)) && current.name && ts.isIdentifier(current.name)) {
      return current.name.text;
    }
  }
  return '';
}

function isComponentLike(fn) {
  const name = componentName(fn);
  return /^[A-Z]/.test(name);
}

/** Returns findings: { file, line, category, text }. */
function uiLiteralFindings(file, root = sourceRoot) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const relative = path.relative(root, file).split(path.sep).join('/');
  const findings = [];
  const seen = new Set();
  const add = (node, category, rawText) => {
    if (seen.has(node.pos)) return;
    if (!looksHuman(rawText)) return;
    seen.add(node.pos);
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    findings.push({ file: relative, line, category, text: normalize(rawText).slice(0, 160) });
  };

  const visit = (node) => {
    if (ts.isJsxText(node)) {
      add(node, 'JSX_TEXT', node.text);
    } else if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(source);
      if (TEXT_ATTRIBUTES.has(name) && node.initializer) {
        if (ts.isStringLiteral(node.initializer)) add(node.initializer, 'JSX_ATTRIBUTE', node.initializer.text);
        else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
          for (const item of displayedLiterals(node.initializer.expression)) add(item.node, 'JSX_ATTRIBUTE', item.text);
        }
      }
      if (name === 'className' || name === 'style' || name.startsWith('data-') || name === 'key') return;
    } else if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent)) {
      for (const item of displayedLiterals(node.expression)) add(item.node, 'JSX_EXPRESSION', item.text);
    } else if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))) {
      if (DISPLAY_PROPERTIES.has(node.name.text)) {
        for (const item of displayedLiterals(node.initializer)) add(item.node, 'OBJECT_PROPERTY', item.text);
      }
    } else if (ts.isBindingElement(node) && node.initializer && ts.isIdentifier(node.name)) {
      if (DISPLAY_PROPERTIES.has(node.name.text) || TEXT_ATTRIBUTES.has(node.name.text)) {
        const text = literalText(node.initializer);
        if (text !== null) add(node.initializer, 'COMPONENT_DEFAULT', text);
      }
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && MESSAGE_SETTER.test(node.expression.text) && node.arguments[0]) {
      for (const item of displayedLiterals(node.arguments[0])) add(item.node, 'MESSAGE_SETTER', item.text);
    } else if (ts.isNewExpression(node) && node.expression.getText(source) === 'Error' && node.arguments?.[0]) {
      const uiFile = relative.endsWith('.tsx') || UI_ERROR_DIRS.some((dir) => relative.startsWith(dir));
      const text = literalText(node.arguments[0]);
      if (uiFile && text !== null) add(node.arguments[0], 'UI_ERROR', text);
    } else if (ts.isReturnStatement(node) && node.expression) {
      let fn = node.parent;
      while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
      if (fn && !isComponentLike(fn)) {
        for (const item of displayedLiterals(node.expression)) add(item.node, 'FUNCTION_RETURN', item.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

function scanSource(root = sourceRoot) {
  return walk(root).flatMap((file) => uiLiteralFindings(file, root));
}

const exceptionsPath = path.resolve(__dirname, '..', 'i18n-exceptions.json');

/**
 * Splits findings into untranslated ones and excepted ones, and validates the
 * exceptions file: every entry needs a reason and must still match something.
 */
function applyExceptions(findings, exceptions) {
  const problems = [];
  const entries = [
    ...(exceptions.global ?? []).map((entry) => ({ ...entry, scope: 'global' })),
    ...(exceptions.files ?? []).map((entry) => ({ ...entry, scope: 'file' })),
  ];
  const used = new Set();
  for (const entry of entries) {
    if (!entry.text || !String(entry.reason ?? '').trim()) {
      problems.push(`exception without text or reason: ${JSON.stringify(entry)}`);
    }
    if (entry.scope === 'file' && !entry.file) problems.push(`file exception without file: ${JSON.stringify(entry)}`);
  }
  const untranslated = [];
  for (const finding of findings) {
    const index = entries.findIndex((entry) =>
      normalize(entry.text ?? '') === finding.text &&
      (entry.scope === 'global' || entry.file === finding.file) &&
      (!entry.category || entry.category === finding.category));
    if (index === -1) untranslated.push(finding);
    else used.add(index);
  }
  entries.forEach((entry, index) => {
    if (!used.has(index)) problems.push(`stale exception (matches nothing): ${entry.file ? entry.file + ' ' : ''}"${entry.text}"`);
  });
  return { untranslated, problems };
}

function readExceptions(file = exceptionsPath) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { global: [], files: [] };
}

module.exports = { sourceRoot, looksHuman, uiLiteralFindings, scanSource, applyExceptions, readExceptions };
