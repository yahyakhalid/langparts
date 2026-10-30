#!/usr/bin/env node
// Runs the experiment described in docs/experiment.md.
//
//   node scripts/experiment.mjs                 corpus A (test/corpus, labelled)
//   node scripts/experiment.mjs --real          corpus B (real pages, cached in .cache/real)
//   node scripts/experiment.mjs --real --todo   also write the fails that still need a label
//
// Writes docs/experiment/results-corpus.json or results-real.json.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parse } from 'parse5';
import { checkHtml } from '../src/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function lineStarts(s) {
  const a = [0];
  for (let i = 0; i < s.length; i++) if (s[i] === '\n') a.push(i + 1);
  return a;
}
const offsetOf = (starts, line, col) => (starts[line - 1] ?? 0) + col - 1;

function expectations(html) {
  const doc = parse(html, { sourceCodeLocationInfo: true });
  const out = [];
  const walk = (n) => {
    for (const c of n.childNodes ?? []) {
      if (c.attrs) {
        const get = (k) => c.attrs.find((a) => a.name === k)?.value;
        const e = get('data-expect');
        if (e) {
          const loc = c.sourceCodeLocation;
          out.push({ expect: e, id: get('data-case'), cls: get('data-class'), start: loc.startOffset, end: loc.endOffset ?? loc.startTag.endOffset });
        }
      }
      walk(c);
      if (c.content) walk(c.content);
    }
  };
  walk(doc);
  return out;
}

function innermost(exps, offset) {
  let best = null;
  for (const e of exps) if (e.start <= offset && offset < e.end && (!best || e.end - e.start < best.end - best.start)) best = e;
  return best;
}

function pct(a, b) { return b === 0 ? 'n/a' : `${((100 * a) / b).toFixed(1)}%`; }

// ---------------------------------------------------------------- corpus A
function runCorpus() {
  const dir = join(root, 'test', 'corpus');
  const files = readdirSync(dir).filter((f) => f.endsWith('.html')).sort();
  const t = { fails: 0, failTP: 0, failFP: 0, failAny: 0, failCases: 0, failCasesFound: 0, failCasesReviewOnly: 0,
    reviews: 0, reviewTP: 0, reviewFP: 0, reviewAny: 0, reviewCases: 0, reviewCasesFound: 0, sameScriptFails: 0,
    nameFails: 0, nameCases: 0, docLangOK: true };
  const details = [];
  for (const f of files) {
    const html = readFileSync(join(dir, f), 'utf8');
    const starts = lineStarts(html);
    const exps = expectations(html);
    const res = checkHtml(html);
    const hitFail = new Set();
    const hitReview = new Set();
    for (const fd of res.findings) {
      if (fd.rule === 'missing-document-lang') continue;
      const off = offsetOf(starts, fd.line, fd.column);
      const e = innermost(exps, off);
      const expect = e?.expect ?? 'unmarked';
      const row = { file: f, line: fd.line, severity: fd.severity, rule: fd.rule, text: fd.text, case: e?.id ?? null, expect };
      if (fd.severity === 'fail') {
        t.fails++;
        if (expect === 'any') { t.failAny++; row.verdict = 'excluded'; }
        else if (expect === 'fail') { t.failTP++; hitFail.add(e.id); row.verdict = 'TP'; }
        else { t.failFP++; row.verdict = 'FP'; }
        if (fd.rule === 'language-mismatch') t.sameScriptFails++;
        if (e && (e.cls === 'brand' || e.cls === 'name') && /^(ar|fr)/.test(f)) t.nameFails++;
      } else {
        t.reviews++;
        if (expect === 'any') { t.reviewAny++; row.verdict = 'excluded'; }
        else if (expect === 'review' || expect === 'fail') { t.reviewTP++; hitReview.add(e.id); row.verdict = 'TP'; }
        else { t.reviewFP++; row.verdict = 'FP'; }
      }
      details.push(row);
    }
    for (const e of exps) {
      if (e.expect === 'fail') {
        t.failCases++;
        if (hitFail.has(e.id)) t.failCasesFound++;
        else {
          if (hitReview.has(e.id)) t.failCasesReviewOnly++;
          details.push({ file: f, case: e.id, expect: 'fail', verdict: hitReview.has(e.id) ? 'MISSED (review only)' : 'MISSED' });
        }
      }
      if (e.expect === 'review') {
        t.reviewCases++;
        if (hitReview.has(e.id)) t.reviewCasesFound++;
        else details.push({ file: f, case: e.id, expect: 'review', verdict: 'MISSED' });
      }
      if ((e.cls === 'brand' || e.cls === 'name') && /^(ar|fr)/.test(f)) t.nameCases++;
    }
    const hasDocLang = res.findings.some((x) => x.rule === 'missing-document-lang');
    if (hasDocLang !== (f === 'no-lang.html')) t.docLangOK = false;
  }
  const summary = {
    C1_precision: pct(t.failTP, t.failTP + t.failFP),
    C2_recall: pct(t.failCasesFound, t.failCases),
    C3_nameFails: `${t.nameFails} fails on ${t.nameCases} brand/name cases in Arabic and French pages`,
    C6_reviewPrecision: pct(t.reviewTP, t.reviewTP + t.reviewFP),
    reviewRecall: pct(t.reviewCasesFound, t.reviewCases),
    C7_sameScriptFails: t.sameScriptFails,
    missingDocumentLangCorrect: t.docLangOK,
  };
  const out = { corpus: 'A (test/corpus)', files: files.length, totals: t, summary, details };
  writeFileSync(join(root, 'docs', 'experiment', 'results-corpus.json'), `${JSON.stringify(out, null, 2)}\n`);
  console.log(JSON.stringify({ totals: t, summary }, null, 2));
  for (const d of details) if (d.verdict !== 'TP') console.log(`  ${d.verdict.padEnd(22)} ${d.file} ${d.case ?? ''} ${d.severity ?? ''} ${d.text ?? ''}`);
}

// ---------------------------------------------------------------- corpus B
const SENTENCES = {
  latinPage: [
    'مرحباً بكم في موقعنا، نتمنى لكم زيارة ممتعة ومفيدة.',
    'يمكنكم التواصل معنا عبر البريد الإلكتروني في أي وقت.',
    'Добро пожаловать на наш сайт, мы рады вас видеть.',
    'ברוכים הבאים לאתר שלנו, נשמח לעזור בכל שאלה.',
    '欢迎访问我们的网站，祝您浏览愉快。',
  ],
  otherPage: [
    'Please read the instructions carefully before you submit the form.',
    'This page is no longer updated and will be removed next month.',
    'Thank you for visiting our website, we hope you found what you need.',
    'Click here to download the full report in a printable format.',
    'All fields marked with an asterisk are required to complete your application.',
  ],
  englishInFrench: [
    'Please read the instructions carefully before you submit the form.',
    'This page is no longer updated and will be removed next month.',
    'Thank you for visiting our website, we hope you found what you need.',
    'Click here to download the full report in a printable format.',
    'All fields marked with an asterisk are required to complete your application.',
  ],
  frenchInEnglish: [
    'Veuillez lire attentivement les instructions avant de soumettre le formulaire.',
    "Cette page n'est plus mise à jour et sera retirée le mois prochain.",
    'Merci de votre visite, nous espérons que vous avez trouvé ce que vous cherchiez.',
    'Cliquez ici pour télécharger le rapport complet dans un format imprimable.',
    'Tous les champs marqués d’un astérisque sont obligatoires pour compléter votre demande.',
  ],
};

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}

async function runReal() {
  const list = JSON.parse(readFileSync(join(root, 'docs', 'experiment', 'real-pages.json'), 'utf8'));
  const cache = join(root, '.cache', 'real');
  mkdirSync(cache, { recursive: true });
  const labelsPath = join(root, 'docs', 'experiment', 'real-labels.json');
  const labels = existsSync(labelsPath) ? JSON.parse(readFileSync(labelsPath, 'utf8')) : {};
  const todo = [];
  const pages = [];
  const allReviews = [];
  const tot = { fails: 0, labelled: 0, tp: 0, fp: 0, reviews: 0, injected: 0, injectedFound: 0, sameInjected: 0, sameInjectedFound: 0 };
  for (const p of list.pages) {
    const file = join(cache, `${p.id}.html`);
    if (!existsSync(file)) {
      const r = await fetch(p.url, { headers: { 'user-agent': 'langparts-experiment/0.1 (+https://github.com/yahyakhalid/langparts)' } });
      writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    }
    const html = readFileSync(file, 'utf8');
    const t0 = performance.now();
    const res = checkHtml(html);
    const ms = performance.now() - t0;
    const fails = res.findings.filter((f) => f.severity === 'fail' && f.rule !== 'missing-document-lang');
    const reviews = res.findings.filter((f) => f.severity === 'review');
    // Label every fail, or a seeded sample of 30.
    let sample = fails;
    if (fails.length > 30) {
      const r = rng(42);
      sample = fails.map((f) => [r(), f]).sort((a, b) => a[0] - b[0]).slice(0, 30).map((x) => x[1]);
    }
    let tp = 0;
    let fp = 0;
    let unlabelled = 0;
    const fpClasses = {};
    for (const f of sample) {
      const key = `${p.id}:${hash(`${f.selector}|${f.attribute ?? ''}|${f.text}`)}`;
      const l = labels[key];
      if (!l) { unlabelled++; todo.push({ key, page: p.id, declaredLang: f.declaredLang, selector: f.selector, attribute: f.attribute, text: f.text, context: f.context }); continue; }
      if (l.label === 'tp') tp++; else { fp++; fpClasses[l.class] = (fpClasses[l.class] ?? 0) + 1; }
    }
    for (const f of reviews) allReviews.push({ page: p.id, f });
    // Injection: add known foreign sentences to random paragraphs.
    const inj = inject(html, p, rng(7));
    // Same-script injection: English into French pages, French into English pages (review tier).
    if (/^(en|fr)/.test(p.lang)) {
      const pool = p.lang.startsWith('fr') ? SENTENCES.englishInFrench : SENTENCES.frenchInEnglish;
      const s = inject(html, p, rng(11), pool, 'language-mismatch');
      tot.sameInjected += s.total; tot.sameInjectedFound += s.found;
    }
    tot.fails += fails.length; tot.labelled += tp + fp; tot.tp += tp; tot.fp += fp; tot.reviews += reviews.length;
    tot.injected += inj.total; tot.injectedFound += inj.found;
    pages.push({ id: p.id, lang: res.documentLang, kb: Math.round(html.length / 1024), ms: Math.round(ms), fails: fails.length, labelled: tp + fp, tp, fp, unlabelled, fpClasses, reviews: reviews.length, injected: inj.total, injectedFound: inj.found });
  }
  // Review tier: a seeded random sample of 60 review findings across all pages.
  const rr = rng(99);
  const reviewSample = allReviews.map((x) => [rr(), x]).sort((a, b) => a[0] - b[0]).slice(0, 60).map((x) => x[1]);
  const rv = { sampled: reviewSample.length, tp: 0, fp: 0, unlabelled: 0, fpClasses: {} };
  for (const { page, f } of reviewSample) {
    const key = `${page}:${hash(`${f.selector}|${f.attribute ?? ''}|${f.text}`)}`;
    const l = labels[key];
    if (!l) { rv.unlabelled++; todo.push({ key, review: true, page, rule: f.rule, declaredLang: f.declaredLang, detectedLang: f.detectedLang, selector: f.selector, attribute: f.attribute, text: f.text, context: f.context }); continue; }
    if (l.label === 'tp') rv.tp++; else { rv.fp++; rv.fpClasses[l.class] = (rv.fpClasses[l.class] ?? 0) + 1; }
  }
  const summary = {
    C4_precision: pct(tot.tp, tot.tp + tot.fp),
    C6_reviewPrecisionSample: pct(rv.tp, rv.tp + rv.fp),
    C5_injectedRecall: pct(tot.injectedFound, tot.injected),
    sameScriptInjectedRecall: pct(tot.sameInjectedFound, tot.sameInjected),
  };
  const out = { corpus: 'B (real pages)', fetched: list.fetched, totals: tot, summary, reviewSample: rv, pages };
  writeFileSync(join(root, 'docs', 'experiment', 'results-real.json'), `${JSON.stringify(out, null, 2)}\n`);
  console.table(pages.map(({ fpClasses, ...r }) => r));
  console.log(JSON.stringify({ totals: tot, summary }, null, 2));
  if (args.includes('--todo')) {
    writeFileSync(join(root, '.cache', 'labels-todo.json'), `${JSON.stringify(todo, null, 2)}\n`);
    console.log(`${todo.length} fails need a label: .cache/labels-todo.json`);
  }
}

function inject(html, page, r, pool0 = null, rule = 'foreign-script') {
  const doc = parse(html, { sourceCodeLocationInfo: true });
  const paras = [];
  const walk = (n) => {
    for (const c of n.childNodes ?? []) {
      // Content that is not rendered (hidden, template, noscript) is not checked, so don't inject there.
      // So are parts declared in another language.
      const primary = (v) => v.toLowerCase().split('-')[0];
      if (c.tagName && (c.attrs.some((a) => a.name === 'hidden' || (a.name === 'lang' && primary(a.value) !== primary(page.lang))) || ['template', 'noscript', 'script'].includes(c.tagName))) continue;
      if (c.tagName === 'p' && c.sourceCodeLocation?.endTag) {
        const text = textOf(c);
        if ((text.match(/\p{L}/gu) ?? []).length >= 40 && !c.attrs.some((a) => a.name === 'lang')) paras.push(c);
      }
      walk(c);
    }
  };
  walk(doc);
  const latin = /^(en|fr)/.test(page.lang);
  const pool = pool0 ?? (latin ? SENTENCES.latinPage : SENTENCES.otherPage);
  const chosen = paras.map((p) => [r(), p]).sort((a, b) => a[0] - b[0]).slice(0, 5).map((x) => x[1]);
  chosen.sort((a, b) => b.sourceCodeLocation.endTag.startOffset - a.sourceCodeLocation.endTag.startOffset);
  let out = html;
  const marks = [];
  chosen.forEach((p, i) => {
    const at = p.sourceCodeLocation.endTag.startOffset;
    const s = ` ${pool[i % pool.length]}`;
    out = out.slice(0, at) + s + out.slice(at);
    marks.push(pool[i % pool.length]);
  });
  const res = checkHtml(out);
  const fails = res.findings.filter((f) => f.rule === rule && (rule !== 'foreign-script' || f.severity === 'fail'));
  let found = 0;
  for (const m of marks) if (fails.some((f) => m.includes(f.text) || f.text.includes(m.replace(/[.。]$/, '')))) found++;
  return { total: marks.length, found };
}

function textOf(n) {
  let s = '';
  for (const c of n.childNodes ?? []) s += c.nodeName === '#text' ? c.value : textOf(c);
  return s;
}

function hash(s) { return createHash('sha256').update(s).digest('hex').slice(0, 12); }

if (args.includes('--real')) await runReal(); else runCorpus();
