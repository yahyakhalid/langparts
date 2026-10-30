// Text analysis: split a piece of text into words, find runs of text in a
// script the declared language doesn't use, and look for same-script passages
// in another language. Works on plain strings with offsets, so the DOM layer
// can map results back to nodes.

import { scriptOf, UNSPACED, CASED } from './scripts.js';
import { NAME_PARTICLES, UI_WORDS } from './words.js';
import { guessLanguage, wordListHits, francCode } from './guess.js';

/** Marks a boundary between parts with different declared languages. */
export const BREAK = '';

const URL_RE = /\b(?:https?|ftp|file|mailto|tel):[^\s<>"']+|\bwww\.[^\s<>"']+/giu;
const EMAIL_RE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
const PATH_RE = /(?:^|(?<=\s))(?:[A-Za-z]:\\|\\\\|~\/|\.{1,2}\/|\/(?=[\w.-]+\/))[^\s]*/gu;
const CHUNK_RE = /[^\s]+|/gu;
const EDGE_PUNCT_RE = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
const CODE_CHARS_RE = /[._/\\:@#=+<>{}()[\]$%&*|~^`]/u;
const DIGIT_RE = /\p{N}/u;
const LETTER_RE = /\p{L}/u;
const MARK_RE = /[\p{M}‌‍]/u;
const CAMEL_RE = /\p{Ll}\p{Lu}/u;
const UPPER_RE = /\p{Lu}|\p{Lt}/u;
const LOWER_RE = /\p{Ll}/u;

/**
 * Replace URLs, e-mail addresses, file paths and ignored phrases with spaces
 * of the same length, so offsets stay valid.
 */
export function maskNeutral(text, ignorePhrases) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  let out = text.replace(URL_RE, blank).replace(EMAIL_RE, blank).replace(PATH_RE, blank);
  for (const re of ignorePhrases) out = out.replace(re, blank);
  return out;
}

/**
 * Split text into word tokens. A whitespace-separated chunk that looks like
 * code (digits mixed with letters, dots or slashes inside, camelCase, @handle,
 * #tag) becomes one neutral token. Other chunks are split where the script
 * changes, so "声：This" gives a Han token and a Latin token.
 */
export function tokenize(text, ignoreWords) {
  const tokens = [];
  for (const m of text.matchAll(CHUNK_RE)) {
    if (m[0] === BREAK) { tokens.push({ brk: true, start: m.index, end: m.index + 1 }); continue; }
    const chunk = m[0];
    if (!LETTER_RE.test(chunk)) continue;
    const lead = chunk.match(/^[^\p{L}\p{N}]+/u)?.[0].length ?? 0;
    const core = chunk.replace(EDGE_PUNCT_RE, '');
    const coreStart = m.index + lead;
    const coreEnd = coreStart + core.length;
    const handle = /^[@#]/.test(chunk.slice(Math.max(0, lead - 1), lead + 1)) && lead > 0;
    if (handle || isCodeLike(core) || ignoreWords.has(core.toLowerCase())) {
      tokens.push({ neutral: true, start: coreStart, end: coreEnd, script: 'Other', letters: 0, text: core });
      continue;
    }
    splitByScript(core, coreStart, tokens, ignoreWords);
  }
  return tokens;
}

function isCodeLike(core) {
  if (!LETTER_RE.test(core)) return true;
  if (DIGIT_RE.test(core)) return true;
  if (CODE_CHARS_RE.test(core)) return true;
  if (CAMEL_RE.test(core) && !/^\p{Lu}\p{Ll}+$/u.test(core)) return true;
  return false;
}

function splitByScript(core, base, out, ignoreWords) {
  let cur = null;
  let i = 0;
  for (const ch of core) {
    const cp = ch.codePointAt(0);
    const isLetter = LETTER_RE.test(ch);
    if (isLetter) {
      const s = scriptOf(cp);
      if (!cur || cur.script !== s) {
        if (cur) finish(cur, core, base, out, ignoreWords);
        cur = { script: s, start: i, end: i, letters: 0 };
      }
      cur.letters++;
      cur.end = i + ch.length;
    } else if (cur && (MARK_RE.test(ch) || /['’\-‐]/u.test(ch))) {
      cur.end = i + ch.length;
    }
    i += ch.length;
  }
  if (cur) finish(cur, core, base, out, ignoreWords);
}

function finish(t, core, base, out, ignoreWords) {
  let text = core.slice(t.start, t.end).replace(/['’\-‐]+$/u, '');
  const end = t.start + text.length;
  const lower = text.toLowerCase();
  const first = text[0];
  const tok = {
    start: base + t.start,
    end: base + end,
    script: t.script,
    letters: t.letters,
    text,
    lower,
    upperFirst: UPPER_RE.test(first),
    lowerFirst: LOWER_RE.test(first),
    allUpper: t.letters > 1 && !LOWER_RE.test(text),
  };
  if (ignoreWords.has(lower) || t.script === 'Other') tok.neutral = true;
  out.push(tok);
}

/**
 * Find runs of text in scripts the declared language doesn't use.
 * @param {object[]} tokens from tokenize()
 * @param {Set<string>} allowed scripts of the declared language
 * @returns {object[]} runs: { start, end, tokens, script, letters }
 */
export function foreignRuns(tokens, allowed, text = '') {
  const runs = [];
  let run = null;
  const close = () => { if (run) { runs.push(run); run = null; } };
  for (const t of tokens) {
    if (t.brk) { close(); continue; }
    if (t.neutral) continue;
    if (allowed.has(t.script)) { close(); continue; }
    if (run) {
      const prev = run.tokens[run.tokens.length - 1];
      // A change of writing system ("فارسی 中文 עברית" in a language menu) or a
      // list separator between CJK names ("北京, 東京") ends the passage.
      if (family(prev.script) !== family(t.script)) close();
      else if (UNSPACED.has(t.script) && /[,;、]/.test(text.slice(prev.end, t.start))) close();
    }
    if (!run) run = { start: t.start, end: t.end, tokens: [] };
    run.tokens.push(t);
    run.end = t.end;
  }
  close();
  for (const r of runs) {
    const byScript = new Map();
    for (const t of r.tokens) byScript.set(t.script, (byScript.get(t.script) ?? 0) + t.letters);
    r.script = [...byScript.entries()].sort((a, b) => b[1] - a[1])[0][0];
    r.scripts = [...byScript.keys()];
    r.letters = r.tokens.reduce((n, t) => n + t.letters, 0);
  }
  return runs;
}

const JAPANESE = new Set(['Han', 'Hiragana', 'Katakana']);
function family(script) {
  return JAPANESE.has(script) ? 'CJK' : script;
}

/**
 * Decide whether a foreign-script run is a failure, needs review, or is
 * allowed (a name, a term, a short word).
 * @param {object} run
 * @param {{whole: boolean, minWords: number, minChars: number}} o
 *   `whole`: the run is all the text of its element or attribute.
 * @returns {{severity: 'fail'|'review'|null, words: number, chars: number, reason: string}}
 */
export function judgeRun(run, o) {
  const unspaced = UNSPACED.has(run.script);
  const words = run.tokens.filter((t) => t.letters >= 2 || UNSPACED.has(t.script)).length;
  if (unspaced) {
    const chars = run.tokens.filter((t) => UNSPACED.has(t.script)).reduce((n, t) => n + t.letters, 0);
    if (chars >= o.minChars) return { severity: 'fail', words, chars, reason: 'sentence' };
    if (chars >= 3 || (o.whole && chars >= 2 && run.tokens.some((t) => t.script === 'Hiragana' || t.script === 'Katakana'))) {
      return { severity: 'review', words, chars, reason: 'short' };
    }
    return { severity: null, words, chars, reason: 'name' };
  }
  const chars = run.letters;
  if (CASED.has(run.script)) {
    // Words that start with a lower-case letter and aren't name particles
    // ("of", "de", "von"...) suggest a sentence rather than a name.
    const content = run.tokens.filter((t) => t.letters >= 2 && t.lowerFirst && !NAME_PARTICLES.has(t.lower)).length;
    if (words >= o.minWords && content >= 2) return { severity: 'fail', words, chars, reason: 'sentence' };
    if (o.whole && words >= 2 && content >= 1) return { severity: 'fail', words, chars, reason: 'phrase' };
    if (words >= 2 && content >= 1) return { severity: 'review', words, chars, reason: 'short' };
    if (o.whole && words === 1) {
      const t = run.tokens.find((x) => x.letters >= 2);
      if (t && t.lowerFirst && (UI_WORDS.has(t.lower) || t.letters >= 4)) return { severity: 'review', words, chars, reason: 'word' };
    }
    return { severity: null, words, chars, reason: 'name' };
  }
  // Scripts without case (Arabic, Hebrew, Devanagari, Hangul...): names and
  // sentences look alike, so only the number of words decides.
  if (words >= o.minWords) return { severity: 'fail', words, chars, reason: 'sentence' };
  if (words >= 2) return { severity: 'review', words, chars, reason: 'short' };
  return { severity: null, words, chars, reason: 'name' };
}

const SENTENCE_END_RE = /[.!?؟。！？;؛\n]+/gu;

/**
 * Same-script check: split text into sentences and report those whose words
 * point clearly to another language with the same script.
 * @returns {object[]} { start, end, lang, hits, declaredHits, method }
 */
export function sameScriptSuspects(text, tokens, declared, allowed, o) {
  const out = [];
  const bounds = [0];
  for (const m of text.matchAll(SENTENCE_END_RE)) bounds.push(m.index + m[0].length);
  bounds.push(text.length);
  let ti = 0;
  for (let b = 0; b < bounds.length - 1; b++) {
    const s = bounds[b];
    const e = bounds[b + 1];
    const own = [];
    while (ti < tokens.length && tokens[ti].start < e) {
      const t = tokens[ti++];
      if (t.brk || t.neutral || t.start < s) continue;
      if (allowed.has(t.script)) own.push(t);
    }
    const verdict = judgeSameScript(own, declared, o);
    if (verdict) out.push({ start: own[0].start, end: own[own.length - 1].end, ...verdict });
  }
  // Merge neighbouring sentences in the same language into one passage.
  const merged = [];
  for (const r of out) {
    const prev = merged[merged.length - 1];
    if (prev && prev.lang === r.lang && !//.test(text.slice(prev.end, r.start))) {
      prev.end = r.end;
      prev.hits += r.hits;
      prev.declaredHits += r.declaredHits;
    } else merged.push({ ...r });
  }
  return merged;
}

function judgeSameScript(own, declared, o) {
  const words = own.filter((t) => t.letters >= 2);
  if (words.length < o.minReviewWords) return null;
  // A Title Case name ("Freedom of the Press Foundation") has no lower-case
  // words other than particles; it is a name, not a passage.
  if (CASED.has(own[0].script) && !words.some((t) => t.lowerFirst && !NAME_PARTICLES.has(t.lower))) return null;
  // Proper names are not evidence of a language.
  const evidence = own.filter((t) => !(t.upperFirst && !isSentenceStartish(t, own)));
  const script = own[0].script;
  const hits = wordListHits(evidence.map((t) => t.lower), script);
  if (!hits) return null;
  if (!(declared in hits)) {
    // No word list for the declared language (Swedish, Polish...): let the
    // n-gram identifier decide, and require a word list to agree.
    if (!o.franc || words.length < 8 || !francCode(declared, script)) return null;
    const g = guessLanguage(own.map((t) => t.text).join(' '), script, { francOnly: true });
    if (g && g !== declared && (hits[g] ?? 0) >= 3) return { lang: g, hits: hits[g], declaredHits: 0, method: 'ngram' };
    return null;
  }
  const d = hits[declared];
  let best = null;
  for (const [lang, n] of Object.entries(hits)) {
    if (lang === declared) continue;
    if (!best || n > best.n) best = { lang, n };
  }
  if (!best) return null;
  const tie = Object.entries(hits).filter(([l, n]) => l !== declared && n === best.n).length > 1;
  if (best.n >= 2 && best.n > 3 * d) {
    return { lang: tie ? null : best.lang, hits: best.n, declaredHits: d, method: 'words' };
  }
  // The passage may share a sentence with page-language text when the
  // punctuation between them is missing: look for the longest stretch of
  // words that votes clearly for one other language.
  if (words.length >= 2 * o.minReviewWords && evidence.length <= 400) {
    const span = bestSubSpan(evidence, script, declared, o.minReviewWords);
    if (span) return span;
  }
  if (o.franc && words.length >= 8 && d <= 1) {
    const g = guessLanguage(own.map((t) => t.text).join(' '), script, { francOnly: true });
    if (g && g !== declared && (hits[g] ?? 0) >= 1 && (hits[g] ?? 0) > d) {
      return { lang: g, hits: hits[g] ?? 0, declaredHits: d, method: 'ngram' };
    }
  }
  return null;
}

function bestSubSpan(toks, script, declared, minWords) {
  const votes = toks.map((t) => wordListHits([t.lower], script) ?? {});
  const langs = Object.keys(votes[0] ?? {}).filter((l) => l !== declared);
  let best = null;
  for (const x of langs) {
    const px = [0];
    const pd = [0];
    const pw = [0];
    toks.forEach((t, k) => {
      px.push(px[k] + (votes[k][x] ? 1 : 0));
      pd.push(pd[k] + (votes[k][declared] ? 1 : 0));
      pw.push(pw[k] + (t.letters >= 2 ? 1 : 0));
    });
    for (let i = 0; i < toks.length; i++) {
      if (!votes[i][x] || votes[i][declared]) continue;
      for (let j = toks.length - 1; j >= i + minWords - 1; j--) {
        if (!votes[j][x] || votes[j][declared]) continue;
        const cx = px[j + 1] - px[i];
        const cd = pd[j + 1] - pd[i];
        const n = pw[j + 1] - pw[i];
        if (n < minWords || (best && n <= best.n)) break;
        if (cx >= 3 && cx > 3 * cd && distinctVotes(toks, votes, i, j, x) >= 3) {
          best = { n, lang: x, start: toks[i].start, end: toks[j].end, hits: cx, declaredHits: cd };
          break;
        }
      }
    }
  }
  return best && { lang: best.lang, hits: best.hits, declaredHits: best.declaredHits, method: 'words', start: best.start, end: best.end };
}

function distinctVotes(toks, votes, i, j, x) {
  const seen = new Set();
  for (let k = i; k <= j; k++) if (votes[k][x]) seen.add(toks[k].lower);
  return seen.size;
}

function isSentenceStartish(t, own) {
  return own[0] === t;
}
