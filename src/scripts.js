// Writing systems: which script each character belongs to, and which scripts
// each language is normally written in.

/** Scripts we classify letters into. Anything else counts as "Other". */
const SCRIPTS = [
  'Latin', 'Arabic', 'Hebrew', 'Cyrillic', 'Greek', 'Armenian', 'Georgian',
  'Han', 'Hiragana', 'Katakana', 'Hangul', 'Bopomofo',
  'Devanagari', 'Bengali', 'Gurmukhi', 'Gujarati', 'Oriya', 'Tamil', 'Telugu',
  'Kannada', 'Malayalam', 'Sinhala', 'Thai', 'Lao', 'Khmer', 'Myanmar',
  'Tibetan', 'Ethiopic', 'Thaana', 'Syriac', 'Mongolian', 'Tifinagh', 'Cherokee',
  'Canadian_Aboriginal', 'Yi', 'Nko', 'Javanese', 'Balinese', 'Sundanese',
];

const SCRIPT_TESTS = SCRIPTS.map((name) => [name, new RegExp(`^\\p{Script=${name}}$`, 'u')]);

/** Scripts written without spaces between words: we count characters, not words. */
export const UNSPACED = new Set(['Han', 'Hiragana', 'Katakana', 'Bopomofo', 'Thai', 'Lao', 'Khmer', 'Myanmar', 'Tibetan', 'Yi', 'Javanese', 'Balinese']);

/** Scripts with upper and lower case, where capitalisation hints at proper names. */
export const CASED = new Set(['Latin', 'Cyrillic', 'Greek', 'Armenian', 'Georgian', 'Cherokee']);

const cache = new Map();

/** Script of one code point, or 'Other' (digits, punctuation, symbols, marks...). */
export function scriptOf(cp) {
  let s = cache.get(cp);
  if (s !== undefined) return s;
  s = 'Other';
  const ch = String.fromCodePoint(cp);
  for (const [name, re] of SCRIPT_TESTS) {
    if (re.test(ch)) { s = name; break; }
  }
  cache.set(cp, s);
  return s;
}

const L = ['Latin'];
const AR = ['Arabic'];
const CY = ['Cyrillic'];
const DEVA = ['Devanagari'];

/** Default scripts for a primary language subtag (ISO 639-1 or 639-3). */
const LANG_SCRIPTS = {
  // Latin
  en: L, fr: L, es: L, de: L, it: L, pt: L, nl: L, sv: L, da: L, no: L, nb: L, nn: L,
  fi: L, is: L, et: L, lv: L, lt: L, pl: L, cs: L, sk: L, sl: L, hr: L, bs: L, sq: L,
  ro: L, hu: L, tr: L, az: L, uz: L, tk: L, id: L, ms: L, tl: L, fil: L, vi: L, sw: L,
  ha: L, yo: L, ig: L, zu: L, xh: L, af: L, ga: L, cy: L, gd: L, eu: L, ca: L, gl: L,
  mt: L, lb: L, fo: L, kmr: L, so: L, om: L, rw: L, mg: L, mi: L, sm: L, to: L, haw: L,
  eo: L, la: L, qu: L, ay: L, gn: L, ht: L, br: L, co: L, oc: L, rm: L, fy: L, se: L,
  wo: L, ln: L, st: L, tn: L, sn: L, ny: L, ceb: L, jv: L, su: L, mos: L, ff: L, ki: L,
  lg: L, ak: L, ee: L, tw: L, nr: L, ss: L, ve: L, ts: L, kg: L, nso: L, gsw: L, hsb: L,
  dsb: L, nds: L, sc: L, vec: L, an: L, ast: L, ia: L, ie: L, io: L, vo: L, kl: L,
  // Kurdish: generic "ku" is written in Latin (Kurmanji) or Arabic (Sorani) script
  ku: ['Latin', 'Arabic'],
  // Arabic script
  ar: AR, fa: AR, ps: AR, ur: AR, ckb: AR, sd: AR, ug: AR, ks: AR, prs: AR, pnb: AR,
  bal: AR, lrc: AR, mzn: AR, glk: AR, azb: AR, skr: AR, arz: AR, ary: AR, apc: AR,
  acm: AR, ajp: AR, afb: AR, aeb: AR, arq: AR, ars: AR, ayl: AR,
  // Hebrew
  he: ['Hebrew'], iw: ['Hebrew'], yi: ['Hebrew'], lad: ['Hebrew', 'Latin'],
  // Cyrillic
  ru: CY, uk: CY, be: CY, bg: CY, mk: CY, kk: CY, ky: CY, tg: CY, mn: CY, tt: CY,
  ba: CY, cv: CY, ce: CY, os: CY, ab: CY, sah: CY, udm: CY, kv: CY, mhr: CY, myv: CY,
  av: CY, lez: CY, rue: CY,
  sr: ['Cyrillic', 'Latin'], sh: ['Latin', 'Cyrillic'], cnr: ['Latin', 'Cyrillic'],
  // Others
  el: ['Greek'], hy: ['Armenian'], ka: ['Georgian'],
  hi: DEVA, mr: DEVA, ne: DEVA, sa: DEVA, kok: DEVA, mai: DEVA, bho: DEVA, doi: DEVA,
  new: DEVA, awa: DEVA, mag: DEVA, hne: DEVA,
  bn: ['Bengali'], as: ['Bengali'], mni: ['Bengali'], pa: ['Gurmukhi'], gu: ['Gujarati'],
  or: ['Oriya'], ta: ['Tamil'], te: ['Telugu'], kn: ['Kannada'], ml: ['Malayalam'],
  si: ['Sinhala'], th: ['Thai'], lo: ['Lao'], km: ['Khmer'], my: ['Myanmar'],
  bo: ['Tibetan'], dz: ['Tibetan'], am: ['Ethiopic'], ti: ['Ethiopic'], tig: ['Ethiopic'],
  dv: ['Thaana'], syr: ['Syriac'], iu: ['Canadian_Aboriginal', 'Latin'], chr: ['Cherokee'],
  ii: ['Yi'], nqo: ['Nko'], zgh: ['Tifinagh'], tzm: ['Tifinagh', 'Latin'],
  ber: ['Tifinagh', 'Latin', 'Arabic'], kab: L, shi: ['Tifinagh', 'Latin'],
  // CJK
  zh: ['Han', 'Bopomofo'], yue: ['Han'], cmn: ['Han', 'Bopomofo'], wuu: ['Han'], nan: ['Han', 'Latin'],
  hak: ['Han'], gan: ['Han'], hsn: ['Han'], lzh: ['Han'],
  ja: ['Han', 'Hiragana', 'Katakana'],
  ko: ['Hangul', 'Han'],
};

/** ISO 15924 script subtags we understand, mapped to our script names. */
const SCRIPT_SUBTAGS = {
  latn: ['Latin'], arab: ['Arabic'], hebr: ['Hebrew'], cyrl: ['Cyrillic'], grek: ['Greek'],
  armn: ['Armenian'], geor: ['Georgian'], hans: ['Han', 'Bopomofo'], hant: ['Han', 'Bopomofo'],
  hani: ['Han'], jpan: ['Han', 'Hiragana', 'Katakana'], kore: ['Hangul', 'Han'],
  hang: ['Hangul'], hira: ['Hiragana'], kana: ['Katakana'], deva: DEVA, beng: ['Bengali'],
  guru: ['Gurmukhi'], gujr: ['Gujarati'], orya: ['Oriya'], taml: ['Tamil'], telu: ['Telugu'],
  knda: ['Kannada'], mlym: ['Malayalam'], sinh: ['Sinhala'], thai: ['Thai'], laoo: ['Lao'],
  khmr: ['Khmer'], mymr: ['Myanmar'], tibt: ['Tibetan'], ethi: ['Ethiopic'], thaa: ['Thaana'],
  syrc: ['Syriac'], mong: ['Mongolian'], tfng: ['Tifinagh'], cher: ['Cherokee'],
  cans: ['Canadian_Aboriginal'], yiii: ['Yi'], nkoo: ['Nko'],
};

const TAG_RE = /^(?:[a-z]{2,3}(?:-[a-z]{3}){0,3}|[a-z]{4,8})(?:-[a-z]{4})?(?:-(?:[a-z]{2}|\d{3}))?(?:-(?:[a-z\d]{5,8}|\d[a-z\d]{3}))*(?:-[\da-wy-z](?:-[a-z\d]{2,8})+)*(?:-x(?:-[a-z\d]{1,8})+)?$|^x(?:-[a-z\d]{1,8})+$|^i-[a-z]+$/i;

/**
 * Parse a lang attribute value.
 * @returns {{tag: string, primary: string, scripts: string[] | null, valid: boolean, unknown: boolean}}
 *   `unknown` is true for "", "und", "zxx", "mul" or private-use tags: we can't say what's expected.
 *   `scripts` is null when we don't know which scripts the language uses.
 */
export function parseLang(value) {
  const tag = String(value ?? '').trim();
  if (tag === '') return { tag, primary: '', scripts: null, valid: true, unknown: true };
  const valid = TAG_RE.test(tag);
  // Lenient about "en_US" style tags, which are invalid but common.
  const parts = tag.toLowerCase().split(/[-_]/);
  const primary = parts[0];
  if (!/^[a-z]{2,8}$/.test(primary)) return { tag, primary, scripts: null, valid: false, unknown: true };
  if (primary === 'und' || primary === 'zxx' || primary === 'mul' || primary === 'x' || primary === 'i' || primary === 'mis') {
    return { tag, primary, scripts: null, valid, unknown: true };
  }
  let scripts = null;
  const scriptSubtag = parts.slice(1).find((p) => p.length === 4 && /^[a-z]+$/.test(p));
  if (scriptSubtag && SCRIPT_SUBTAGS[scriptSubtag]) scripts = SCRIPT_SUBTAGS[scriptSubtag];
  else if (LANG_SCRIPTS[primary]) scripts = LANG_SCRIPTS[primary];
  return { tag, primary, scripts, valid, unknown: false };
}

/** Best-guess language tag for text written in `script`, when nothing better is known. */
export const SCRIPT_DEFAULT_LANG = {
  Hebrew: 'he', Greek: 'el', Armenian: 'hy', Georgian: 'ka', Hangul: 'ko', Hiragana: 'ja',
  Katakana: 'ja', Thai: 'th', Lao: 'lo', Khmer: 'km', Myanmar: 'my', Tibetan: 'bo',
  Ethiopic: 'am', Thaana: 'dv', Bengali: 'bn', Gurmukhi: 'pa', Gujarati: 'gu', Oriya: 'or',
  Tamil: 'ta', Telugu: 'te', Kannada: 'kn', Malayalam: 'ml', Sinhala: 'si', Syriac: 'syr',
  Cherokee: 'chr', Nko: 'nqo', Yi: 'ii',
};
