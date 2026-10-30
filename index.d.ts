export interface CheckOptions {
  /** Page language to assume when <html> has no valid lang (BCP 47 tag, e.g. "ar"). */
  lang?: string | null;
  /** Words a foreign-script passage needs before it is reported as a fail. Default 3. */
  minWords?: number;
  /** Characters needed for scripts written without spaces (Chinese, Japanese, Thai...). Default 6. */
  minChars?: number;
  /** Words a sentence needs before the same-script check looks at it. Default 3. */
  minReviewWords?: number;
  /** Report the needs-review tier. Default true. */
  review?: boolean;
  /** Use the franc n-gram identifier for long same-script passages. Default true. */
  franc?: boolean;
  /** Names, product names or terms to ignore. Entries with spaces match as phrases. */
  ignore?: string[];
  /** Use the built-in list of lower-case names and terms (npm, iPhone, km...). Default true. */
  builtinIgnore?: boolean;
}

export type Rule = 'foreign-script' | 'language-mismatch' | 'missing-document-lang';

export interface Finding {
  /** foreign-script: another writing system; language-mismatch: same script, other language; missing-document-lang: WCAG 3.1.1. */
  rule: Rule;
  /** "fail" is high confidence; "review" needs a person to decide. */
  severity: 'fail' | 'review';
  confidence: 'high' | 'medium' | 'low';
  /** WCAG success criterion: "3.1.2", or "3.1.1" for missing-document-lang. */
  wcag: '3.1.2' | '3.1.1';
  message: string;
  /** CSS selector of the element that holds the text. */
  selector: string;
  /** 1-based line and column in the source (0 when unknown). */
  line: number;
  column: number;
  /** The attribute that holds the text (aria-label, alt, title, placeholder, aria-description, value), or null for text content. */
  attribute: string | null;
  /** The passage that was found. */
  text: string;
  /** The surrounding block of text, shortened. Empty for attributes. */
  context: string;
  /** The language the text is declared in (nearest lang), or null. */
  declaredLang: string | null;
  /** Script of the passage, e.g. "Latin", "Arabic", "Han". */
  detectedScript: string | null;
  /** Best guess of the passage's language, or null when unsure. */
  detectedLang: string | null;
  /** Words in the passage (null for the same-script tier). */
  words?: number | null;
  /** Suggested fix, e.g. `<span lang="en">…</span>` or `<a lang="en">`. */
  fix: string;
}

export interface CheckResult {
  /** The lang attribute of <html>, or null when it has none. */
  documentLang: string | null;
  /** The --lang value used because <html> had no valid lang, or null. */
  assumedLang: string | null;
  findings: Finding[];
  stats: {
    blocks: number;
    attributes: number;
    checkedBlocks: number;
    unknownLangBlocks: number;
    /** lang values that were skipped because their writing system is unknown. */
    unknownLangs: string[];
  };
}

export const DEFAULTS: Readonly<Required<Omit<CheckOptions, 'lang'>> & { lang: null }>;

/** Check an HTML string. Static HTML only: scripts are not run. */
export function checkHtml(html: string, options?: CheckOptions): CheckResult;

/** Convert results to a SARIF 2.1.0 log for GitHub code scanning. */
export function toSarif(
  results: Array<{ file: string; findings: Finding[] }>,
  options?: { version?: string },
): object;

/** Parse a lang attribute value and tell which scripts the language is written in. */
export function parseLang(value: string): {
  tag: string;
  primary: string;
  scripts: string[] | null;
  valid: boolean;
  unknown: boolean;
};

export const VERSION: string;
