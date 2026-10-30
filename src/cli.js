// Command-line interface. `main()` returns an exit code instead of exiting,
// so tests can call it directly.

import { parseArgs } from 'node:util';
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { checkHtml } from './check.js';
import { toSarif } from './sarif.js';
import { VERSION } from './version.js';

const HELP = `langparts ${VERSION} (experimental)
Find text in another language that has no lang attribute (WCAG 2.x SC 3.1.2).

Usage: langparts [options] <file|dir|glob|url>...

Options:
  --lang <tag>          Page language to assume when <html> has no valid lang
  --min-words <n>       Words before a foreign-script passage fails (default 3)
  --min-chars <n>       Characters for Chinese, Japanese, Thai... (default 6)
  --ignore <list>       Comma-separated names or terms to ignore (repeatable)
  --no-review           Report only fails, not the needs-review tier
  --fail-on <level>     Exit with 1 on: fail (default), review, none
  --json                JSON output
  --sarif               SARIF 2.1.0 output, for GitHub code scanning
  --config <path>       Config file (default: ./langparts.config.json if present)
  --no-color            No colors (NO_COLOR is also respected)
  -h, --help            Show this help
  -v, --version         Show the version

URLs are fetched as static HTML: scripts are not run (no JavaScript rendering).
Directories are searched for .html, .htm and .xhtml files.

Exit codes: 0 nothing at the --fail-on level, 1 findings at that level,
2 bad arguments or an input that could not be read.`;

const CONFIG_KEYS = new Set(['lang', 'minWords', 'minChars', 'minReviewWords', 'ignore', 'review', 'failOn', 'franc']);
const HTML_EXT = /\.(?:html?|xhtml)$/i;
const SKIP_DIRS = new Set(['node_modules', '.git', '.hg', '.svn']);
const MAX_BYTES = 20 * 1024 * 1024;

/**
 * @param {string[]} argv arguments without "node" and the script path
 * @param {{stdout?: {write: Function, isTTY?: boolean}, stderr?: {write: Function}, cwd?: string, env?: object, fetch?: Function}} [io]
 * @returns {Promise<number>} exit code
 */
export async function main(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const cwd = io.cwd ?? process.cwd();
  const env = io.env ?? process.env;
  const doFetch = io.fetch ?? globalThis.fetch;

  let args;
  try {
    args = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        lang: { type: 'string' },
        'min-words': { type: 'string' },
        'min-chars': { type: 'string' },
        ignore: { type: 'string', multiple: true },
        'no-review': { type: 'boolean' },
        'fail-on': { type: 'string' },
        json: { type: 'boolean' },
        sarif: { type: 'boolean' },
        config: { type: 'string' },
        'no-color': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (e) {
    stderr.write(`langparts: ${e.message}\nRun "langparts --help" for usage.\n`);
    return 2;
  }
  const v = args.values;
  if (v.help) { stdout.write(`${HELP}\n`); return 0; }
  if (v.version) { stdout.write(`${VERSION}\n`); return 0; }
  if (args.positionals.length === 0) {
    stderr.write('langparts: no input. Pass files, directories, globs or URLs.\nRun "langparts --help" for usage.\n');
    return 2;
  }
  if (v.json && v.sarif) { stderr.write('langparts: use either --json or --sarif, not both.\n'); return 2; }

  // Config file, then command-line options on top.
  let config = {};
  const configPath = v.config ? resolve(cwd, v.config) : join(cwd, 'langparts.config.json');
  if (v.config || existsSync(configPath)) {
    try {
      config = JSON.parse(await readFile(configPath, 'utf8'));
      if (typeof config !== 'object' || config === null || Array.isArray(config)) throw new Error('expected a JSON object');
    } catch (e) {
      stderr.write(`langparts: cannot read config ${configPath}: ${e.message}\n`);
      return 2;
    }
    for (const k of Object.keys(config)) if (!CONFIG_KEYS.has(k)) stderr.write(`langparts: unknown config key "${k}" ignored\n`);
  }
  const opts = {
    lang: v.lang ?? config.lang,
    minWords: num(v['min-words'], 'min-words') ?? config.minWords,
    minChars: num(v['min-chars'], 'min-chars') ?? config.minChars,
    minReviewWords: config.minReviewWords,
    review: v['no-review'] ? false : config.review,
    franc: config.franc,
    ignore: [...(Array.isArray(config.ignore) ? config.ignore : []), ...(v.ignore ?? []).flatMap((s) => s.split(','))].map((s) => String(s).trim()).filter(Boolean),
  };
  for (const k of ['minWords', 'minChars', 'minReviewWords']) {
    if (opts[k] !== undefined && !(Number.isInteger(opts[k]) && opts[k] >= 1)) {
      stderr.write(`langparts: ${k} must be a whole number of at least 1\n`);
      return 2;
    }
  }
  const failOn = v['fail-on'] ?? config.failOn ?? 'fail';
  if (!['fail', 'review', 'none'].includes(failOn)) {
    stderr.write(`langparts: --fail-on must be fail, review or none (got "${failOn}")\n`);
    return 2;
  }

  // Inputs.
  const inputs = [];
  let inputErrors = 0;
  for (const arg of args.positionals) {
    if (/^https?:\/\//i.test(arg)) { inputs.push({ kind: 'url', name: arg }); continue; }
    const abs = resolve(cwd, arg);
    let st = null;
    try { st = await stat(abs); } catch { /* not a path: maybe a glob */ }
    if (st?.isDirectory()) {
      const files = await walk(abs);
      if (files.length === 0) { stderr.write(`langparts: no HTML files in ${arg}\n`); inputErrors++; }
      for (const f of files) inputs.push({ kind: 'file', path: f, name: rel(cwd, f) });
    } else if (st?.isFile()) {
      inputs.push({ kind: 'file', path: abs, name: rel(cwd, abs) });
    } else if (/[*?[{]/.test(arg)) {
      const files = await glob(arg, cwd);
      if (files.length === 0) { stderr.write(`langparts: no files match ${arg}\n`); inputErrors++; }
      for (const f of files) inputs.push({ kind: 'file', path: f, name: rel(cwd, f) });
    } else {
      stderr.write(`langparts: cannot find ${arg}\n`);
      inputErrors++;
    }
  }

  const results = [];
  const seen = new Set();
  for (const input of inputs) {
    const key = input.path ?? input.name;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const html = input.kind === 'url' ? await fetchHtml(input.name, doFetch) : decode(await readFile(input.path));
      const res = checkHtml(html, opts);
      results.push({ file: input.name, ...res });
    } catch (e) {
      inputErrors++;
      results.push({ file: input.name, error: e.message, findings: [] });
      stderr.write(`langparts: ${input.name}: ${e.message}\n`);
    }
  }

  const fails = results.reduce((n, r) => n + r.findings.filter((f) => f.severity === 'fail').length, 0);
  const reviews = results.reduce((n, r) => n + r.findings.filter((f) => f.severity === 'review').length, 0);

  if (v.sarif) {
    stdout.write(`${JSON.stringify(toSarif(results.filter((r) => !r.error), { version: VERSION }), null, 2)}\n`);
  } else if (v.json) {
    stdout.write(`${JSON.stringify({
      version: VERSION,
      results: results.map(({ file, documentLang, assumedLang, findings, stats, error }) => ({ file, documentLang, assumedLang, error, findings, stats })),
      summary: { files: results.length, fails, reviews, errors: inputErrors },
    }, null, 2)}\n`);
  } else {
    const color = !v['no-color'] && !('NO_COLOR' in env) && (env.FORCE_COLOR ? env.FORCE_COLOR !== '0' : Boolean(stdout.isTTY));
    stdout.write(formatHuman(results, { color, fails, reviews }));
  }

  if (inputErrors > 0) return 2;
  if (failOn === 'fail' && fails > 0) return 1;
  if (failOn === 'review' && fails + reviews > 0) return 1;
  return 0;
}

function num(s, name) {
  if (s === undefined) return undefined;
  if (!/^\d+$/.test(s)) return NaN;
  return Number(s);
}

const rel = (cwd, p) => {
  const r = relative(cwd, p);
  return (r && !r.startsWith('..') ? r : p).split(sep).join('/');
};

async function walk(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) out.push(...await walk(p)); }
    else if (e.isFile() && HTML_EXT.test(e.name)) out.push(p);
  }
  return out;
}

/** Minimal glob: *, **, ?, [abc] and {a,b}, relative to cwd (for shells that don't expand globs). */
export async function glob(pattern, cwd) {
  const norm = pattern.replace(/\\/g, '/');
  const segs = norm.split('/');
  const firstGlob = segs.findIndex((s) => /[*?[{]/.test(s));
  const baseRel = segs.slice(0, firstGlob).join('/');
  const base = resolve(cwd, baseRel || '.');
  const re = globToRegExp(segs.slice(firstGlob).join('/'));
  // "site/**" means the HTML files in site/; "**/*.php" means what it says.
  const onlyHtml = !segs[segs.length - 1].includes('.');
  let files;
  try { files = await walkAll(base); } catch { return []; }
  return files.filter((f) => re.test(relative(base, f).split(sep).join('/')) && (!onlyHtml || HTML_EXT.test(f)));
}

async function walkAll(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) out.push(...await walkAll(p)); }
    else if (e.isFile()) out.push(p);
  }
  return out;
}

export function globToRegExp(g) {
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') {
      if (g[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i++; }
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '[') {
      const end = g.indexOf(']', i + 1);
      if (end === -1) re += '\\[';
      else { re += `[${g.slice(i + 1, end).replace(/^!/, '^').replace(/\\/g, '\\\\')}]`; i = end; }
    } else if (c === '{') {
      const end = g.indexOf('}', i + 1);
      if (end === -1) re += '\\{';
      else { re += `(?:${g.slice(i + 1, end).split(',').map((s) => s.replace(/[.+^$()|\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')).join('|')})`; i = end; }
    } else re += c.replace(/[.+^$()|\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** Decode HTML bytes: BOM, then <meta charset> in the first 1024 bytes, then UTF-8. */
export function decode(buf, headerCharset) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let charset = null;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) charset = 'utf-8';
  else if (bytes[0] === 0xff && bytes[1] === 0xfe) charset = 'utf-16le';
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) charset = 'utf-16be';
  if (!charset && headerCharset) charset = headerCharset;
  if (!charset) {
    const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
    charset = head.match(/<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i)?.[1] ?? null;
    // WHATWG prescan: a UTF-16 label in a <meta> means UTF-8 (the bytes were
    // readable as ASCII), and x-user-defined means windows-1252.
    if (charset && /^utf-16/i.test(charset)) charset = 'utf-8';
    if (charset && /^x-user-defined$/i.test(charset)) charset = 'windows-1252';
  }
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

async function fetchHtml(url, doFetch) {
  if (typeof doFetch !== 'function') throw new Error('fetch is not available in this Node.js version');
  const res = await doFetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
    headers: { 'user-agent': `langparts/${VERSION} (+https://github.com/yahyakhalid/langparts)`, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText ?? ''}`.trim());
  const type = res.headers.get('content-type') ?? '';
  if (type && !/html|xml/i.test(type)) throw new Error(`not HTML (content-type: ${type})`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error(`page larger than ${MAX_BYTES / 1024 / 1024} MB`);
  return decode(buf, type.match(/charset=([\w-]+)/i)?.[1]);
}

// ------------------------------------------------------------------ output

/** Page text must not reach the terminal as control sequences. */
const safe = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/g, (ch) => `\\x${ch.charCodeAt(0).toString(16).padStart(2, '0')}`);

export function formatHuman(results, { color, fails, reviews }) {
  const c = (code) => (s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
  const red = c('31;1');
  const yellow = c('33;1');
  const dim = c('2');
  const bold = c('1');
  const cyan = c('36');
  const green = c('32;1');
  let out = '';
  let clean = 0;
  for (const r of results) {
    if (r.error) continue;
    if (r.findings.length === 0) { clean++; continue; }
    const lang = r.documentLang ? `lang="${safe(r.documentLang)}"` : 'no lang';
    out += `\n${bold(safe(r.file))} ${dim(`(${lang}${r.assumedLang ? `, checked as ${safe(r.assumedLang)}` : ''})`)}\n`;
    for (const f of r.findings) {
      const pos = `${f.line}:${f.column}`.padEnd(8);
      const sev = f.severity === 'fail' ? red('✖ fail  ') : yellow('⚠ review');
      out += `  ${dim(pos)}${sev}  ${safe(f.message)}\n`;
      const pad = ' '.repeat(20);
      const text = safe(f.text);
      if (text) out += `${pad}${bold(`"${text.length > 100 ? `${text.slice(0, 99)}…` : text}"`)}\n`;
      out += `${pad}${dim(`at ${safe(f.selector)}${f.attribute ? ` [${f.attribute}]` : ''}`)}\n`;
      // A long passage makes the suggested <span> unreadable; --json has it in full.
      const fix = safe(f.fix).replace(/^(<span lang="[^"]*">)(.{70,})(<\/span>)$/u, (_, a, t, b) => `${a}${t.slice(0, 60)}…${b}`);
      out += `${pad}${cyan(`fix: ${fix}`)}\n`;
    }
  }
  const files = results.length;
  const parts = [];
  if (fails) parts.push(red(`${fails} ${fails === 1 ? 'fail' : 'fails'}`));
  if (reviews) parts.push(yellow(`${reviews} to review`));
  const errors = results.filter((r) => r.error).length;
  if (errors) parts.push(red(`${errors} unreadable`));
  const summary = parts.length
    ? `${parts.join(', ')} in ${files} ${files === 1 ? 'file' : 'files'}${clean ? ` (${clean} clean)` : ''}`
    : green(`✔ no untagged language changes found in ${files} ${files === 1 ? 'file' : 'files'}`);
  return `${out}\n${summary}\n`;
}
