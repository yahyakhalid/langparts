// Guess which language a piece of text is in. Word lists first (they work on
// short strings), then the franc n-gram identifier for longer text, limited
// to languages written in the same script.

import { francAll } from 'franc';
import { FUNCTION_WORDS, LISTS_BY_SCRIPT } from './words.js';
import { SCRIPT_DEFAULT_LANG } from './scripts.js';

const SORANI_LETTERS = /[ڕڵۆێە]/u; // ڕ ڵ ۆ ێ ە
const URDU_LETTERS = /[ٹڈڑںےہ]/u; // ٹ ڈ ڑ ں ے ہ

/**
 * Count, per language with a word list for this script, how many distinct
 * words of `words` (lower-cased) are in that list.
 * @returns {Record<string, number> | null}
 */
export function wordListHits(words, script) {
  const langs = LISTS_BY_SCRIPT[script];
  if (!langs) return null;
  const hits = {};
  const seen = new Set(words);
  for (const lang of langs) {
    let n = 0;
    for (const w of seen) if (FUNCTION_WORDS[lang].has(w)) n++;
    hits[lang] = n;
  }
  if (script === 'Arabic') {
    // Letters only Sorani Kurdish uses are stronger evidence than its short words.
    let sorani = 0;
    let urdu = 0;
    for (const w of seen) {
      if (SORANI_LETTERS.test(w)) sorani++;
      if (URDU_LETTERS.test(w)) urdu++;
    }
    hits.ckb += sorani;
    hits.ur += urdu > sorani ? urdu : 0;
  }
  return hits;
}

/** franc codes (ISO 639-3) for the languages we may suggest, per script. */
const FRANC_CANDIDATES = {
  Latin: ['eng', 'fra', 'spa', 'deu', 'ita', 'por', 'nld', 'swe', 'dan', 'nob', 'fin', 'pol', 'ces', 'slk', 'hun', 'ron', 'tur', 'ind', 'vie', 'tgl', 'swh', 'hrv', 'slv', 'lit', 'lvs', 'ekk', 'cat', 'glg', 'afr', 'azj', 'uzn'],
  Cyrillic: ['rus', 'ukr', 'bel', 'bul', 'mkd', 'srp', 'kaz', 'kir', 'tat', 'tgk', 'khk'],
  Arabic: ['arb', 'pes', 'urd', 'pbu'],
  Devanagari: ['hin', 'mar', 'npi', 'mai', 'bho'],
  Hebrew: ['heb', 'ydd'],
};

const ISO3_TO_TAG = {
  eng: 'en', fra: 'fr', spa: 'es', deu: 'de', ita: 'it', por: 'pt', nld: 'nl', swe: 'sv',
  dan: 'da', nob: 'nb', fin: 'fi', pol: 'pl', ces: 'cs', slk: 'sk', hun: 'hu', ron: 'ro',
  tur: 'tr', ind: 'id', vie: 'vi', tgl: 'tl', swh: 'sw', hrv: 'hr', slv: 'sl', lit: 'lt',
  lvs: 'lv', ekk: 'et', cat: 'ca', glg: 'gl', afr: 'af', azj: 'az', uzn: 'uz', rus: 'ru',
  ukr: 'uk', bel: 'be', bul: 'bg', mkd: 'mk', srp: 'sr', kaz: 'kk', kir: 'ky', tat: 'tt',
  tgk: 'tg', khk: 'mn', arb: 'ar', pes: 'fa', urd: 'ur', pbu: 'ps', hin: 'hi', mar: 'mr',
  npi: 'ne', mai: 'mai', bho: 'bho', heb: 'he', ydd: 'yi',
};

/**
 * Best guess for the language of `text`, which is mostly written in `script`.
 * @returns {string | null} a BCP 47 tag, or null when unsure
 */
export function guessLanguage(text, script, opts = {}) {
  if (!opts.francOnly) {
    if (script === 'Han' || script === 'Hiragana' || script === 'Katakana') {
      return /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text) ? 'ja' : 'zh';
    }
    if (SCRIPT_DEFAULT_LANG[script] && !FRANC_CANDIDATES[script]) return SCRIPT_DEFAULT_LANG[script];
    const words = text.toLowerCase().split(/[^\p{L}\p{M}‌'’]+/u).filter(Boolean);
    const hits = wordListHits(words, script);
    if (hits) {
      const ranked = Object.entries(hits).sort((a, b) => b[1] - a[1]);
      if (ranked[0][1] >= 1 && ranked[0][1] > (ranked[1]?.[1] ?? 0)) return ranked[0][0];
    }
  }
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  let only = FRANC_CANDIDATES[script];
  if (only && opts.include) only = [...new Set([...only, ...opts.include])];
  if (only && letters >= 30) {
    const res = francAll(text, { only, minLength: 10 });
    const [top, second] = res;
    if (top && top[0] !== 'und' && (!second || second[1] < 0.95)) return ISO3_TO_TAG[top[0]] ?? null;
  }
  if (opts.francOnly) return null;
  if (script === 'Arabic') return 'ar';
  if (script === 'Hebrew') return 'he';
  return SCRIPT_DEFAULT_LANG[script] ?? null;
}

const TAG_TO_ISO3 = Object.fromEntries(Object.entries(ISO3_TO_TAG).map(([k, v]) => [v, k]));

/** franc code for a primary subtag, if franc can identify it among same-script candidates. */
export function francCode(primary, script) {
  const code = TAG_TO_ISO3[primary];
  return code && FRANC_CANDIDATES[script]?.includes(code) ? code : null;
}

/** Map a declared primary subtag to the word list we use for it, if any. */
export function listLanguage(primary) {
  const alias = { prs: 'fa', pes: 'fa', nb: null, iw: 'he' };
  if (primary in alias) return alias[primary];
  if (/^(arb|arz|ary|apc|acm|ajp|afb|aeb|arq|ars|ayl)$/.test(primary)) return 'ar';
  return FUNCTION_WORDS[primary] ? primary : null;
}
