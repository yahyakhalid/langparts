// Keeps the experiment criteria (docs/experiment.md, C1-C3 and C7) true on the
// labelled corpus in test/corpus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';
import { checkHtml } from '../src/index.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'corpus');

function cases(html) {
  const out = [];
  const walk = (n) => {
    for (const c of n.childNodes ?? []) {
      const get = (k) => c.attrs?.find((a) => a.name === k)?.value;
      if (get('data-expect')) {
        const loc = c.sourceCodeLocation;
        out.push({ expect: get('data-expect'), id: get('data-case'), cls: get('data-class'), start: loc.startOffset, end: loc.endOffset ?? loc.startTag.endOffset });
      }
      walk(c);
    }
  };
  walk(parse(html, { sourceCodeLocationInfo: true }));
  return out;
}

const totals = { tp: 0, fp: 0, cases: 0, found: 0, nameFails: 0, sameScriptFails: 0 };
for (const file of readdirSync(dir).filter((f) => f.endsWith('.html')).sort()) {
  const html = readFileSync(join(dir, file), 'utf8');
  const starts = [0];
  for (let i = 0; i < html.length; i++) if (html[i] === '\n') starts.push(i + 1);
  const exps = cases(html);
  const { findings } = checkHtml(html);
  const hit = new Set();
  for (const f of findings) {
    if (f.rule === 'missing-document-lang' || f.severity !== 'fail') continue;
    if (f.rule === 'language-mismatch') totals.sameScriptFails++;
    const off = starts[f.line - 1] + f.column - 1;
    const e = exps.filter((x) => x.start <= off && off < x.end).sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
    if (e?.expect === 'any') continue;
    if (e?.expect === 'fail') { totals.tp++; hit.add(e.id); } else totals.fp++;
    if (e && (e.cls === 'brand' || e.cls === 'name') && /^(ar|fr)/.test(file)) totals.nameFails++;
  }
  for (const e of exps.filter((x) => x.expect === 'fail')) {
    totals.cases++;
    if (hit.has(e.id)) totals.found++;
  }
  test(`corpus: ${file} reports a missing page language only when it is missing`, () => {
    assert.equal(findings.some((f) => f.rule === 'missing-document-lang'), file === 'no-lang.html');
  });
}

test('C1: script-tier precision on the labelled corpus is at least 95%', () => {
  assert.ok(totals.tp / (totals.tp + totals.fp) >= 0.95, JSON.stringify(totals));
});
test('C2: script-tier recall on the labelled corpus is at least 90%', () => {
  assert.ok(totals.found / totals.cases >= 0.9, JSON.stringify(totals));
});
test('C3: no fails on brand and proper-name cases in Arabic and French pages', () => {
  assert.equal(totals.nameFails, 0);
});
test('C7: the same-script tier never reports a fail', () => {
  assert.equal(totals.sameScriptFails, 0);
});
