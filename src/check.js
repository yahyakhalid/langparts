// checkHtml(): the library entry point.

import { parseHtml, extractBlocks } from './dom.js';
import { parseLang } from './scripts.js';
import { BUILTIN_IGNORE } from './words.js';
import { maskNeutral, tokenize, foreignRuns, judgeRun, sameScriptSuspects, BREAK } from './text.js';
import { guessLanguage, listLanguage } from './guess.js';
import { selectorFor, textLetters } from './selector.js';
import { languageName, scriptName } from './names.js';

export const DEFAULTS = Object.freeze({
  lang: null,
  minWords: 3,
  minChars: 6,
  minReviewWords: 3,
  review: true,
  franc: true,
  ignore: [],
  builtinIgnore: true,
});

/**
 * Check an HTML document for passages whose language differs from the
 * declared language and isn't marked up with lang (WCAG 2.x SC 3.1.2).
 *
 * @param {string} html
 * @param {Partial<typeof DEFAULTS>} [options]
 */
export function checkHtml(html, options = {}) {
  const o = { ...DEFAULTS, ...stripUndefined(options) };
  if (typeof html !== 'string') throw new TypeError('checkHtml(html): html must be a string');
  const ignoreWords = new Set();
  const ignorePhrases = [];
  for (const w of [...(o.builtinIgnore ? BUILTIN_IGNORE : []), ...o.ignore]) {
    const s = String(w).trim();
    if (!s) continue;
    if (/\s/.test(s)) ignorePhrases.push(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(s).replace(/\\?\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`, 'giu'));
    else ignoreWords.add(s.toLowerCase());
  }

  const baseLang = o.lang ? parseLang(o.lang) : null;
  const doc = parseHtml(html);
  const { blocks, html: htmlEl, htmlLang } = extractBlocks(doc, { baseLang });
  const ctx = { html, lines: lineStarts(html), selectors: new Map() };
  const findings = [];

  // WCAG 3.1.1: the page language itself.
  const parsedHtmlLang = htmlLang === undefined ? null : parseLang(htmlLang);
  if (htmlLang === undefined || htmlLang.trim() === '' || !parsedHtmlLang.valid) {
    const loc = htmlEl?.sourceCodeLocation?.startTag ?? htmlEl?.sourceCodeLocation;
    const missing = htmlLang === undefined || htmlLang.trim() === '';
    findings.push({
      rule: 'missing-document-lang',
      severity: 'fail',
      confidence: 'high',
      wcag: '3.1.1',
      message: missing
        ? 'The <html> element has no lang attribute, so the page language cannot be determined.'
          + (baseLang ? ` Checked as ${describeLang(baseLang)} (--lang).` : ' Parts without their own lang were not checked; pass --lang to assume one.')
        : `lang="${htmlLang}" on <html> is not a valid language tag.`
          + (baseLang ? ` Checked as ${describeLang(baseLang)} (--lang).` : ''),
      selector: 'html',
      line: loc?.startLine ?? 1,
      column: loc?.startCol ?? 1,
      attribute: missing ? null : 'lang',
      text: '',
      context: '',
      declaredLang: missing ? null : htmlLang,
      detectedScript: null,
      detectedLang: null,
      fix: missing
        ? `<html lang="${baseLang?.tag ?? 'LANG'}">`
        : `<html lang="${baseLang?.tag ?? 'LANG'}"> with a valid BCP 47 tag`,
    });
  }

  const stats = { blocks: 0, attributes: 0, checkedBlocks: 0, unknownLangBlocks: 0, unknownLangs: [] };
  const unknownLangs = new Set();

  for (const block of blocks) {
    if (block.kind === 'attr') stats.attributes++; else stats.blocks++;
    const langs = new Set(block.segments.map((s) => s.lang));
    for (const lang of langs) {
      if (!lang || !lang.scripts) {
        if (lang && lang.tag) unknownLangs.add(lang.tag);
        stats.unknownLangBlocks++;
        continue;
      }
      stats.checkedBlocks++;
      // Keep only the text declared in this language.
      let text = block.text;
      const chars = text.split('');
      for (const s of block.segments) {
        if (s.lang !== lang || s.neutral) for (let i = s.start; i < s.end; i++) if (chars[i] !== BREAK) chars[i] = ' ';
      }
      text = maskNeutral(chars.join(''), ignorePhrases);
      const tokens = tokenize(text, ignoreWords);
      const allowed = new Set(lang.scripts);

      for (const run of foreignRuns(tokens, allowed, text)) {
        const located = locate(block, run.start, run.end, ctx);
        const runRaw = block.text.slice(run.start, run.end);
        const whole = block.kind === 'attr'
          ? textLetters(block.text) === textLetters(runRaw)
          : located.element && textLetters(elementText(located.element)) === textLetters(runRaw);
        const verdict = judgeRun(run, { whole, minWords: o.minWords, minChars: o.minChars });
        if (!verdict.severity) continue;
        if (verdict.severity === 'review' && !o.review) continue;
        const detectedLang = guessLanguage(runRaw, run.script);
        findings.push(makeFinding({
          rule: 'foreign-script', severity: verdict.severity,
          confidence: verdict.severity === 'fail' ? 'high' : 'medium',
          block, located, runRaw, lang, whole, detectedScript: run.script, detectedLang, verdict,
        }, ctx));
      }

      if (o.review) {
        const declared = listLanguage(lang.primary) ?? lang.primary;
        if (declared) {
          for (const sus of sameScriptSuspects(text, tokens, declared, allowed, o)) {
            const located = locate(block, sus.start, sus.end, ctx);
            const runRaw = block.text.slice(sus.start, sus.end);
            const whole = block.kind === 'attr'
              ? true
              : located.element && textLetters(elementText(located.element)) === textLetters(runRaw);
            findings.push(makeFinding({
              rule: 'language-mismatch', severity: 'review', confidence: sus.method === 'words' ? 'medium' : 'low',
              block, located, runRaw, lang, whole, detectedScript: tokens.find((t) => t.start >= sus.start && !t.brk && !t.neutral)?.script ?? null,
              detectedLang: sus.lang, verdict: { words: null, chars: null, reason: sus.method },
            }, ctx));
          }
        }
      }
    }
  }
  stats.unknownLangs = [...unknownLangs];
  findings.sort((a, b) => a.line - b.line || a.column - b.column);

  return {
    documentLang: htmlLang ?? null,
    assumedLang: baseLang && (!parsedHtmlLang || !parsedHtmlLang.valid || htmlLang.trim() === '') ? baseLang.tag : null,
    findings,
    stats,
  };
}

function makeFinding(f, ctx) {
  const { block, located, runRaw, lang, whole, detectedScript, detectedLang } = f;
  const text = collapse(runRaw);
  const tag = detectedLang ?? 'LANG';
  const el = block.kind === 'attr' ? block.element : located.element;
  const elTag = el?.tagName ?? 'span';
  let fix;
  if (block.kind === 'attr') {
    const hasText = textLetters(elementText(block.element)) > 0;
    fix = `Translate the ${block.attribute} into ${languageName(lang.tag)}`
      + (hasText ? '.' : `, or add lang="${tag}" to the <${elTag}> element.`);
  } else if (whole && el && elTag !== 'body' && elTag !== 'html') {
    fix = `<${elTag} lang="${tag}">`;
  } else {
    fix = `<span lang="${tag}">${text}</span>`;
  }
  const probably = detectedLang ? `, probably ${languageName(detectedLang)},` : '';
  let message;
  if (f.rule === 'foreign-script') {
    message = block.kind === 'attr'
      ? `${scriptName(detectedScript)} ${block.attribute}${probably} on <${elTag}>, which is declared as ${describeLang(lang)}.`
      : `${scriptName(detectedScript)} text${probably} in <${elTag}>, which is declared as ${describeLang(lang)}.`;
    if (f.severity === 'review') message += ' Short: a name, or untranslated text?';
  } else {
    const looks = detectedLang ? languageName(detectedLang) : 'another language';
    message = block.kind === 'attr'
      ? `The ${block.attribute} on <${elTag}> looks like ${looks}, but the element is declared as ${describeLang(lang)}.`
      : `Text in <${elTag}> looks like ${looks}, but it is declared as ${describeLang(lang)}.`;
  }
  return {
    rule: f.rule,
    severity: f.severity,
    confidence: f.confidence,
    wcag: '3.1.2',
    message,
    selector: selectorFor(el, ctx.selectors),
    line: block.kind === 'attr' ? located.line : located.line,
    column: located.column,
    attribute: block.attribute ?? null,
    text,
    context: block.kind === 'attr' ? '' : truncate(collapse(block.text.replace(//g, ' ')), 160),
    declaredLang: lang.tag,
    detectedScript,
    detectedLang,
    words: f.verdict.words,
    fix,
  };
}

/** Find the element and source position of block text [start, end). */
function locate(block, start, end, ctx) {
  if (block.kind === 'attr') {
    const loc = block.element.sourceCodeLocation?.attrs?.[block.attribute] ?? block.element.sourceCodeLocation?.startTag;
    return { element: block.element, line: loc?.startLine ?? 0, column: loc?.startCol ?? 0 };
  }
  const segs = block.segments.filter((s) => s.end > start && s.start < end && /\p{L}/u.test(block.text.slice(Math.max(s.start, start), Math.min(s.end, end))));
  const first = segs[0] ?? block.segments[0];
  const element = lowestCommonAncestor(segs.map((s) => s.node.parentNode));
  const pos = sourcePosition(first.node, Math.max(0, start - first.start), ctx);
  return { element, line: pos.line, column: pos.column };
}

function sourcePosition(textNode, index, ctx) {
  const loc = textNode.sourceCodeLocation;
  if (!loc) return { line: 0, column: 0 };
  const raw = ctx.html.slice(loc.startOffset, loc.endOffset);
  let offset = loc.startOffset;
  const value = textNode.value;
  if (raw === value) offset += index;
  else if (!raw.includes('&')) {
    // Only line endings differ (CRLF in the source, LF in the tree).
    let i = 0;
    let j = 0;
    while (i < index && j < raw.length) {
      if (raw[j] === '\r' && raw[j + 1] === '\n') j++;
      i++; j++;
    }
    offset += j;
  }
  return lineCol(ctx.lines, offset);
}

function lineStarts(s) {
  const starts = [0];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 10) starts.push(i + 1);
    else if (c === 13 && s.charCodeAt(i + 1) !== 10) starts.push(i + 1);
  }
  return starts;
}

function lineCol(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - starts[lo] + 1 };
}

function lowestCommonAncestor(nodes) {
  if (!nodes.length) return null;
  const chain = (n) => { const c = []; for (let x = n; x; x = x.parentNode) c.push(x); return c; };
  let common = chain(nodes[0]);
  for (const n of nodes.slice(1)) {
    const set = new Set(chain(n));
    common = common.filter((x) => set.has(x));
  }
  return common.find((x) => x.tagName) ?? null;
}

const SKIP_TEXT = new Set(['script', 'style', 'template', 'noscript', 'code', 'kbd', 'samp', 'var', 'pre', 'tt']);

/** Text content of an element, without code and scripts (memoised per element). */
function elementText(el) {
  if (el.__lpText !== undefined) return el.__lpText;
  let out = '';
  const walk = (n) => {
    for (const c of n.childNodes ?? []) {
      if (c.nodeName === '#text') out += c.value;
      else if (c.tagName && !SKIP_TEXT.has(c.tagName) && !c.attrs?.some((a) => a.name === 'lang')) walk(c);
      else if (c.tagName) out += ' ';
    }
  };
  walk(el);
  Object.defineProperty(el, '__lpText', { value: out, enumerable: false });
  return out;
}

function describeLang(lang) {
  const name = languageName(lang.tag);
  return name && name.toLowerCase() !== lang.tag.toLowerCase() ? `${name} (lang="${lang.tag}")` : `lang="${lang.tag}"`;
}

const collapse = (s) => s.replace(/\s+/g, ' ').trim();
const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const stripUndefined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
