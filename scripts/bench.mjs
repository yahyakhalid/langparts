#!/usr/bin/env node
// Throughput of checkHtml() on a large generated page, and on the cached real
// pages from the experiment when they exist (.cache/real, see docs/experiment.md).
//
//   node scripts/bench.mjs [--runs 5]

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { checkHtml } from '../src/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const runs = Number(process.argv[process.argv.indexOf('--runs') + 1]) || 5;

function generated(paragraphs) {
  const ar = 'تقدّم البوابة خدماتها باللغتين العربية والكردية، ويمكن الوصول إليها من الهاتف أو الحاسوب في أي وقت، وتعمل على GitHub و Visual Studio Code.';
  const en = 'Please read the instructions carefully before you submit the form.';
  let body = '';
  for (let i = 0; i < paragraphs; i++) {
    body += `<section><h2>القسم ${i}</h2><p>${ar} ${i % 10 === 0 ? en : ''}</p>`
      + `<ul><li><a href="/p/${i}" aria-label="${i % 7 === 0 ? 'Open the details page' : 'افتح صفحة التفاصيل'}">التفاصيل</a></li>`
      + `<li><img src="i${i}.png" alt="صورة توضيحية رقم ${i}"></li></ul></section>\n`;
  }
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>اختبار</title></head><body>${body}</body></html>`;
}

function time(html) {
  checkHtml(html); // warm up
  const ms = [];
  let findings = 0;
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    findings = checkHtml(html).findings.length;
    ms.push(performance.now() - t0);
  }
  ms.sort((a, b) => a - b);
  const median = ms[Math.floor(ms.length / 2)];
  const mb = Buffer.byteLength(html) / 1024 / 1024;
  return { sizeMB: +mb.toFixed(2), medianMs: Math.round(median), mbPerSec: +(mb / (median / 1000)).toFixed(2), findings };
}

console.log(`Node ${process.version}, ${os.cpus()[0]?.model ?? 'unknown CPU'}, ${runs} runs, median`);
const rows = {};
for (const n of [1000, 10000]) rows[`generated, ${n} sections`] = time(generated(n));
const cache = join(root, '.cache', 'real');
if (existsSync(cache)) {
  for (const f of readdirSync(cache).filter((x) => x.endsWith('.html')).sort()) {
    rows[f.replace(/\.html$/, '')] = time(readFileSync(join(cache, f), 'utf8'));
  }
}
console.table(rows);
