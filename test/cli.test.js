import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, globToRegExp, decode } from '../src/cli.js';

function sink() {
  const s = { text: '', isTTY: false, write(x) { s.text += x; return true; } };
  return s;
}
async function cli(args, opts = {}) {
  const stdout = sink();
  const stderr = sink();
  const code = await main(args, { stdout, stderr, env: {}, ...opts });
  return { code, out: stdout.text, err: stderr.text };
}

const AR_FAIL = '<!doctype html><html lang="ar"><body><p>قال: We will not accept any further delay in these talks.</p></body></html>';
const AR_REVIEW = '<!doctype html><html lang="ar"><body><button aria-label="close">✕</button></body></html>';
const AR_CLEAN = '<!doctype html><html lang="ar"><body><p>نستخدم GitHub كل يوم.</p></body></html>';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'langparts-'));
  writeFileSync(join(dir, 'fail.html'), AR_FAIL);
  writeFileSync(join(dir, 'review.html'), AR_REVIEW);
  mkdirSync(join(dir, 'sub'));
  writeFileSync(join(dir, 'sub', 'clean.htm'), AR_CLEAN);
  writeFileSync(join(dir, 'sub', 'notes.txt'), 'not html');
  return dir;
}

describe('cli', () => {
  test('--help and --version', async () => {
    assert.match((await cli(['--help'])).out, /Usage: langparts/);
    assert.match((await cli(['--version'])).out, /^\d+\.\d+\.\d+\n$/);
  });

  test('no input and bad options exit with 2', async () => {
    assert.equal((await cli([])).code, 2);
    assert.equal((await cli(['--nope', 'x.html'])).code, 2);
    assert.equal((await cli(['--fail-on', 'sometimes', 'x.html'])).code, 2);
    assert.equal((await cli(['--min-words', 'zero', 'x.html'])).code, 2);
    assert.equal((await cli(['--json', '--sarif', 'x.html'])).code, 2);
  });

  test('a missing file exits with 2', async () => {
    const r = await cli(['does-not-exist.html']);
    assert.equal(r.code, 2);
    assert.match(r.err, /cannot find/);
  });

  test('exit codes follow --fail-on', async () => {
    const dir = fixture();
    try {
      assert.equal((await cli(['fail.html'], { cwd: dir })).code, 1);
      assert.equal((await cli(['review.html'], { cwd: dir })).code, 0);
      assert.equal((await cli(['review.html', '--fail-on', 'review'], { cwd: dir })).code, 1);
      assert.equal((await cli(['fail.html', '--fail-on', 'none'], { cwd: dir })).code, 0);
      assert.equal((await cli(['review.html', '--no-review', '--fail-on', 'review'], { cwd: dir })).code, 0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('human output names the file, position, text and fix, without colors when not a TTY', async () => {
    const dir = fixture();
    try {
      const r = await cli(['fail.html'], { cwd: dir });
      assert.match(r.out, /fail\.html \(lang="ar"\)/);
      assert.match(r.out, /1:\d+\s+✖ fail/);
      assert.match(r.out, /"We will not accept any further delay in these talks"/);
      assert.match(r.out, /fix: <span lang="en">/);
      assert.match(r.out, /1 fail in 1 file/);
      assert.doesNotMatch(r.out, /\x1b\[/);
      const colored = await cli(['fail.html'], { cwd: dir, env: { FORCE_COLOR: '1' } });
      assert.match(colored.out, /\x1b\[/);
      const noColor = await cli(['fail.html'], { cwd: dir, env: { FORCE_COLOR: '1', NO_COLOR: '' } });
      assert.doesNotMatch(noColor.out, /\x1b\[/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('directories are searched for HTML files', async () => {
    const dir = fixture();
    try {
      const r = await cli(['.', '--json'], { cwd: dir });
      const j = JSON.parse(r.out);
      assert.deepEqual(j.results.map((x) => x.file), ['fail.html', 'review.html', 'sub/clean.htm']);
      assert.deepEqual(j.summary, { files: 3, fails: 1, reviews: 1, errors: 0 });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('globs are expanded when the shell does not', async () => {
    const dir = fixture();
    try {
      const j = JSON.parse((await cli(['**/*.htm', '--json'], { cwd: dir })).out);
      assert.deepEqual(j.results.map((x) => x.file), ['sub/clean.htm']);
      assert.equal((await cli(['*.xyz'], { cwd: dir })).code, 2);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('SARIF output', async () => {
    const dir = fixture();
    try {
      const s = JSON.parse((await cli(['.', '--sarif'], { cwd: dir })).out);
      assert.equal(s.version, '2.1.0');
      const run = s.runs[0];
      assert.equal(run.tool.driver.name, 'langparts');
      assert.deepEqual(run.results.map((r) => [r.ruleId, r.level]).sort(), [['foreign-script', 'error'], ['foreign-script', 'warning']]);
      const loc = run.results[0].locations[0].physicalLocation;
      assert.match(loc.artifactLocation.uri, /^(fail|review)\.html$/);
      assert.ok(loc.region.startLine >= 1 && loc.region.startColumn >= 1);
      assert.ok(run.results.every((r) => r.partialFingerprints.langpartsFinding.length === 8));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('config file, with command-line options on top', async () => {
    const dir = fixture();
    try {
      writeFileSync(join(dir, 'langparts.config.json'), JSON.stringify({ failOn: 'review', ignore: ['close'] }));
      assert.equal((await cli(['review.html'], { cwd: dir })).code, 0);
      writeFileSync(join(dir, 'langparts.config.json'), JSON.stringify({ failOn: 'review' }));
      assert.equal((await cli(['review.html'], { cwd: dir })).code, 1);
      assert.equal((await cli(['review.html', '--fail-on', 'fail'], { cwd: dir })).code, 0);
      writeFileSync(join(dir, 'langparts.config.json'), JSON.stringify({ minWords: 0 }));
      assert.equal((await cli(['review.html'], { cwd: dir })).code, 2);
      writeFileSync(join(dir, 'langparts.config.json'), '{ not json');
      assert.equal((await cli(['review.html'], { cwd: dir })).code, 2);
      writeFileSync(join(dir, 'other.json'), JSON.stringify({ unknownKey: 1 }));
      const r = await cli(['review.html', '--config', 'other.json'], { cwd: dir });
      assert.match(r.err, /unknown config key "unknownKey"/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('--lang and --ignore', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'langparts-'));
    try {
      writeFileSync(join(dir, 'p.html'), '<html><body><p>Note: مرحباً بكم في موقعنا الجديد هذا الأسبوع.</p></body></html>');
      const j = JSON.parse((await cli(['p.html', '--json', '--lang', 'en'], { cwd: dir })).out);
      assert.deepEqual(j.results[0].findings.map((f) => f.rule), ['missing-document-lang', 'foreign-script']);
      writeFileSync(join(dir, 'q.html'), '<html lang="ar"><body><p>نستخدم أداة the quick sync tool في العمل.</p></body></html>');
      assert.equal((await cli(['q.html'], { cwd: dir })).code, 1);
      assert.equal((await cli(['q.html', '--ignore', 'the quick sync tool,other'], { cwd: dir })).code, 0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test('URLs are fetched as static HTML, with the charset from the header', async () => {
    const bytes = Buffer.from(new TextEncoder().encode(AR_FAIL));
    const fakeFetch = async (url, init) => {
      assert.equal(url, 'https://example.org/page');
      assert.match(init.headers['user-agent'], /^langparts\//);
      return new Response(bytes, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    };
    const r = await cli(['https://example.org/page', '--json'], { fetch: fakeFetch });
    const j = JSON.parse(r.out);
    assert.equal(r.code, 1);
    assert.equal(j.results[0].file, 'https://example.org/page');
    assert.equal(j.summary.fails, 1);
  });

  test('HTTP errors and non-HTML responses exit with 2', async () => {
    const notFound = async () => new Response('nope', { status: 404, statusText: 'Not Found' });
    assert.equal((await cli(['https://example.org/x'], { fetch: notFound })).code, 2);
    const image = async () => new Response('x', { status: 200, headers: { 'content-type': 'image/png' } });
    const r = await cli(['https://example.org/x.png'], { fetch: image });
    assert.equal(r.code, 2);
    assert.match(r.err, /not HTML/);
  });
});

describe('helpers', () => {
  test('globToRegExp', () => {
    assert.ok(globToRegExp('**/*.html').test('a/b/c.html'));
    assert.ok(globToRegExp('**/*.html').test('c.html'));
    assert.ok(!globToRegExp('*.html').test('a/c.html'));
    assert.ok(globToRegExp('*.{html,htm}').test('x.htm'));
    assert.ok(globToRegExp('page?.html').test('page1.html'));
    assert.ok(globToRegExp('[ab].html').test('a.html'));
  });

  test('decode honours BOM, meta charset and header charset', () => {
    // "مرحبا" in windows-1256
    const cp1256 = Uint8Array.from([0xe3, 0xd1, 0xcd, 0xc8, 0xc7]);
    const meta = new TextEncoder().encode('<meta charset="windows-1256"><p>');
    const html = new Uint8Array([...meta, ...cp1256]);
    assert.match(decode(html), /مرحبا/);
    assert.match(decode(cp1256, 'windows-1256'), /^مرحبا$/);
    assert.equal(decode(Uint8Array.from([0xef, 0xbb, 0xbf, 0x61])), 'a');
  });
});
