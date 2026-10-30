// Regression tests for defects found in the self-review of 0.1.0 before release.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkHtml, toSarif } from '../src/index.js';
import { main, decode, globToRegExp } from '../src/cli.js';

function sink() {
  const s = { text: '', isTTY: false, write(x) { s.text += x; return true; } };
  return s;
}
async function cli(args, cwd) {
  const stdout = sink();
  const stderr = sink();
  const code = await main(args, { stdout, stderr, env: {}, cwd });
  return { code, out: stdout.text, err: stderr.text };
}

test('long runs of letters do not make the e-mail pattern quadratic', () => {
  const t0 = performance.now();
  checkHtml(`<html lang="en"><body><p>${'a'.repeat(200000)}</p><p>${'ab.'.repeat(60000)}</p></body></html>`);
  assert.ok(performance.now() - t0 < 3000, 'took too long');
  assert.deepEqual(checkHtml('<html lang="ar"><body><p>راسلنا a.b@c.com اليوم</p></body></html>').findings, []);
});

test('line and column are right after character references', () => {
  const html = '<html lang="ar"><body><p>مرحبا&nbsp;بكم &amp; &#x41;\nسطر\nthis is a full English sentence.</p></body></html>';
  const f = checkHtml(html).findings[0];
  assert.equal(f.line, 3);
  assert.equal(f.column, 1);
});

test('very deep nesting does not overflow the stack', () => {
  const html = `<html lang="ar"><body>${'<div>'.repeat(5000)}this is a full English sentence for you${'</div>'.repeat(5000)}</body></html>`;
  const f = checkHtml(html).findings;
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'fail');
});

test('many inline lang elements in one block stay linear', () => {
  const html = `<html lang="ar"><body><p>${'كلمة <span lang="en">word</span> '.repeat(4000)}</p></body></html>`;
  const t0 = performance.now();
  assert.deepEqual(checkHtml(html).findings, []);
  assert.ok(performance.now() - t0 < 3000, 'took too long');
});

test('page text cannot inject terminal escape sequences', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'langparts-'));
  try {
    writeFileSync(join(dir, 'esc.html'), '<html lang="&#x1b;]0;pwned&#x07;&#x1b;[2J"><body><p>this is &#x1b;[31m a full English sentence.</p></body></html>');
    const r = await cli(['--lang', 'ar', 'esc.html'], dir);
    assert.doesNotMatch(r.out, /[\x00-\x08\x0b-\x1f\x7f-\x9f]/);
    assert.match(r.out, /\\x1b/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('extension subtags are not script subtags', () => {
  const f = checkHtml('<html lang="ar-u-nu-latn"><body><p>مرحبا بكم في موقعنا الجديد. Please read this English sentence now.</p></body></html>').findings;
  assert.equal(f.length, 1);
  assert.equal(f[0].detectedScript, 'Latin');
  const g = checkHtml('<html lang="en-x-arab"><body><p>This page is in English only.</p></body></html>').findings;
  assert.deepEqual(g, []);
});

test('HTML inside <foreignObject> is checked; SVG <text> stays skipped', () => {
  const f = checkHtml('<html lang="ar"><body><svg><text>Chart label in English words here</text><foreignObject><div>This is a full English sentence for you.</div></foreignObject></svg></body></html>').findings;
  assert.equal(f.length, 1);
  assert.equal(f[0].selector, 'body > svg > foreignObject > div');
});

test('a UTF-16 label in <meta> is read as UTF-8', () => {
  const html = decode(Buffer.from('<meta charset="utf-16"><html lang="ar"><p>مرحبا</p>', 'utf8'));
  assert.match(html, /مرحبا/);
});

test('xml:lang alone on <html> is reported, with a hint', () => {
  const f = checkHtml('<html xml:lang="en"><body><p>Hello</p></body></html>').findings;
  assert.equal(f[0].rule, 'missing-document-lang');
  assert.match(f[0].message, /xml:lang alone has no effect/);
});

test('invalid numeric options throw instead of crashing later', () => {
  assert.throws(() => checkHtml('<html lang="fr"><p>Bonjour.</p></html>', { minReviewWords: 0 }), RangeError);
  assert.throws(() => checkHtml('<html lang="fr"><p>Bonjour.</p></html>', { minWords: 1.5 }), RangeError);
  assert.throws(() => checkHtml('<html lang="fr"><p>Bonjour.</p></html>', { ignore: 'x' }), TypeError);
});

test('SARIF URIs are valid for absolute and unusual paths', () => {
  const finding = { rule: 'foreign-script', severity: 'fail', message: 'm', fix: 'f', line: 1, column: 1, selector: 'p', text: 't' };
  const abs = process.platform === 'win32' ? 'C:\\sp ace\\a#1.html' : '/sp ace/a#1.html';
  const s = toSarif([{ file: abs, findings: [finding] }, { file: 'dir/sp ace#1.html', findings: [finding] }]);
  const uris = s.runs[0].results.map((r) => r.locations[0].physicalLocation.artifactLocation.uri);
  assert.match(uris[0], /^file:\/\/\/.*sp%20ace\/a%231\.html$/);
  assert.equal(uris[1], 'dir/sp%20ace%231.html');
});

test('globs without an extension only pick HTML files; empty directories are an error', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'langparts-'));
  try {
    mkdirSync(join(dir, 'site'));
    mkdirSync(join(dir, 'empty'));
    writeFileSync(join(dir, 'site', 'a.html'), '<html lang="ar"><body><p>مرحبا</p></body></html>');
    writeFileSync(join(dir, 'site', 'style.css'), 'body { color: red }');
    writeFileSync(join(dir, 'site', 'logo.png'), 'not really a png');
    const j = JSON.parse((await cli(['site/**', '--json'], dir)).out);
    assert.deepEqual(j.results.map((r) => r.file), ['site/a.html']);
    assert.equal((await cli(['empty'], dir)).code, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('selectors keep the case of SVG element names', () => {
  const f = checkHtml('<html lang="ar"><body><svg><foreignObject><p>This is a full English sentence for you.</p></foreignObject></svg></body></html>').findings;
  assert.equal(f[0].selector, 'body > svg > foreignObject > p');
});

test('? inside braces in a glob matches one character', () => {
  assert.ok(globToRegExp('{a?,b}.html').test('ax.html'));
  assert.ok(!globToRegExp('{a?,b}.html').test('.html'));
});
