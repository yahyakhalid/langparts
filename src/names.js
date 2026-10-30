// Human-readable names for languages and scripts in messages.

let display;
try {
  display = new Intl.DisplayNames(['en'], { type: 'language' });
} catch {
  display = null;
}

export function languageName(tag) {
  if (!tag) return '';
  try {
    return display?.of(tag) ?? tag;
  } catch {
    return tag;
  }
}

const SCRIPT_NAMES = {
  Han: 'Chinese characters (Han)', Hiragana: 'Japanese (Hiragana)', Katakana: 'Japanese (Katakana)',
  Hangul: 'Korean (Hangul)', Canadian_Aboriginal: 'Canadian Syllabics', Nko: "N'Ko",
};

export function scriptName(script) {
  if (!script) return 'Unknown-script';
  return SCRIPT_NAMES[script] ?? `${script}-script`;
}
