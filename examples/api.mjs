// Use langparts as a library: node examples/api.mjs
import { readFileSync } from 'node:fs';
import { checkHtml } from 'langparts';

const html = readFileSync(new URL('./ar-page.html', import.meta.url), 'utf8');
const { documentLang, findings } = checkHtml(html, { ignore: ['App Store'] });

console.log(`Page language: ${documentLang}`);
for (const f of findings) {
  console.log(`${f.line}:${f.column} ${f.severity} ${f.selector}${f.attribute ? ` [${f.attribute}]` : ''}`);
  console.log(`  "${f.text}" -> ${f.fix}`);
}
