// SARIF 2.1.0 output, for GitHub code scanning and other tools.

import { pathToFileURL } from 'node:url';
import { isAbsolute } from 'node:path';

const RULES = [
  {
    id: 'foreign-script',
    name: 'ForeignScriptWithoutLang',
    shortDescription: { text: 'Text in another writing system without a matching lang attribute' },
    fullDescription: { text: 'A passage is written in a script the declared language does not use (for example English in an Arabic page) and has no lang attribute, so screen readers pronounce it with the wrong language rules. WCAG 2.x Success Criterion 3.1.2 Language of Parts.' },
    helpUri: 'https://www.w3.org/WAI/WCAG22/Understanding/language-of-parts.html',
    defaultConfiguration: { level: 'error' },
    properties: { tags: ['accessibility', 'wcag2a', 'wcag312'], precision: 'high' },
  },
  {
    id: 'language-mismatch',
    name: 'PossibleLanguageMismatch',
    shortDescription: { text: 'Text that looks like another language in the same script' },
    fullDescription: { text: 'A passage looks like a different language that uses the same script as the declared language (for example English in a French page). This is a hint for review, not a confirmed failure. WCAG 2.x Success Criterion 3.1.2 Language of Parts.' },
    helpUri: 'https://www.w3.org/WAI/WCAG22/Understanding/language-of-parts.html',
    defaultConfiguration: { level: 'warning' },
    properties: { tags: ['accessibility', 'wcag2a', 'wcag312'], precision: 'medium' },
  },
  {
    id: 'missing-document-lang',
    name: 'MissingDocumentLang',
    shortDescription: { text: 'The page has no valid lang on <html>' },
    fullDescription: { text: 'The <html> element has no lang attribute, or an invalid one, so the default language of the page cannot be programmatically determined. WCAG 2.x Success Criterion 3.1.1 Language of Page.' },
    helpUri: 'https://www.w3.org/WAI/WCAG22/Understanding/language-of-page.html',
    defaultConfiguration: { level: 'error' },
    properties: { tags: ['accessibility', 'wcag2a', 'wcag311'], precision: 'very-high' },
  },
];

const LEVEL = { fail: 'error', review: 'warning' };

/**
 * @param {{file: string, findings: object[]}[]} results  `file` is a relative path or URL
 * @param {{version?: string}} [opts]
 */
export function toSarif(results, opts = {}) {
  const index = new Map(RULES.map((r, i) => [r.id, i]));
  const out = [];
  for (const r of results) {
    const uri = toUri(r.file);
    for (const f of r.findings) {
      const text = f.text ? `${f.message} Text: "${f.text}". Suggested fix: ${f.fix}` : `${f.message} Suggested fix: ${f.fix}`;
      out.push({
        ruleId: f.rule,
        ruleIndex: index.get(f.rule),
        level: LEVEL[f.severity] ?? 'note',
        message: { text },
        locations: [{
          physicalLocation: {
            artifactLocation: { uri },
            region: { startLine: Math.max(1, f.line || 1), startColumn: Math.max(1, f.column || 1) },
          },
          logicalLocations: f.selector ? [{ fullyQualifiedName: f.selector, kind: 'element' }] : undefined,
        }],
        partialFingerprints: { langpartsFinding: fingerprint(`${f.rule}|${f.selector}|${f.attribute ?? ''}|${f.text}`) },
        properties: {
          severity: f.severity, confidence: f.confidence, wcag: f.wcag, selector: f.selector,
          attribute: f.attribute, declaredLang: f.declaredLang, detectedScript: f.detectedScript, detectedLang: f.detectedLang,
        },
      });
    }
  }
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'langparts',
          version: opts.version ?? '0.1.0',
          informationUri: 'https://github.com/yahyakhalid/langparts',
          rules: RULES,
        },
      },
      results: out,
    }],
  };
}

/** A valid URI: URLs as they are, absolute paths as file: URLs, relative paths percent-encoded. */
function toUri(file) {
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(file)) return file;
  if (isAbsolute(file) || /^[A-Za-z]:[\\/]/.test(file)) return pathToFileURL(file).href;
  return file.replace(/\\/g, '/').replace(/^\.\//, '').split('/').map(encodeURIComponent).join('/');
}

/** Small stable hash (FNV-1a, 32 bit) so code scanning can track a finding across runs. */
function fingerprint(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
