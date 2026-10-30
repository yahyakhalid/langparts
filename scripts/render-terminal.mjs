#!/usr/bin/env node
// Renders real CLI output (with its ANSI colors) into docs/design/terminal.html,
// which is then screenshotted into docs/images/terminal.png (see docs/design/README.md).

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/cli.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = ['examples/ar-page.html', 'examples/fr-page.html'];
let out = '';
const stdout = { isTTY: true, write: (s) => { out += s; return true; } };
const code = await main(args, { stdout, stderr: stdout, cwd: root, env: { FORCE_COLOR: '1' } });

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const CLASSES = { 1: 'b', 2: 'dim', 31: 'red', 32: 'green', 33: 'yellow', 36: 'cyan' };
function ansiToHtml(s) {
  let html = '';
  let open = 0;
  for (const part of s.split(/(\x1b\[[\d;]*m)/)) {
    const m = part.match(/^\x1b\[([\d;]*)m$/);
    if (!m) { html += esc(part); continue; }
    if (m[1] === '0' || m[1] === '') { html += '</span>'.repeat(open); open = 0; continue; }
    const cls = m[1].split(';').map((c) => CLASSES[c]).filter(Boolean).join(' ');
    html += `<span class="${cls}">`;
    open++;
  }
  return html + '</span>'.repeat(open);
}
// Each line is its own left-to-right paragraph; Arabic runs inside it are
// laid out right to left, as in a terminal with BiDi support.
const lines = out.replace(/\n$/, '').split('\n').map((l) => `<div class="l">${ansiToHtml(l) || '&nbsp;'}</div>`).join('\n');
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>langparts terminal output</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans+Arabic:wght@400;600&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1280px; background: #15122b; padding: 36px; font-family: 'IBM Plex Mono', 'IBM Plex Sans Arabic', monospace; }
  .win { background: #0d0b1c; border: 1px solid #3b3470; border-radius: 14px; overflow: hidden; }
  .bar { background: #211c40; padding: 12px 16px; display: flex; gap: 8px; align-items: center; color: #b7b0dc; font-size: 14px; }
  .bar i { width: 12px; height: 12px; border-radius: 50%; background: #3b3470; display: inline-block; }
  .bar span { margin-left: 12px; }
  .term { padding: 18px 22px 22px; color: #e9e6fb; font-size: 17px; line-height: 1.55; }
  .l { white-space: pre; direction: ltr; unicode-bidi: embed; text-align: left; }
  .prompt { color: #7ee0c3; }
  .b { font-weight: 600; color: #ffffff; }
  .dim { color: #8d86b8; }
  .red { color: #ff6b7a; font-weight: 600; }
  .yellow { color: #ffd23f; font-weight: 600; }
  .green { color: #7ee0c3; font-weight: 600; }
  .cyan { color: #7ee0c3; }
</style>
</head>
<body>
<div class="win">
  <div class="bar"><i></i><i></i><i></i><span>bash</span></div>
  <div class="term">
<div class="l"><span class="prompt">$</span> npx github:yahyakhalid/langparts ${args.join(' ')}</div>
${lines}
<div class="l"><span class="prompt">$</span> echo $?</div>
<div class="l">${code}</div>
  </div>
</div>
</body>
</html>
`;
writeFileSync(join(root, 'docs', 'design', 'terminal.html'), page);
console.log(`docs/design/terminal.html written (exit code ${code})`);
