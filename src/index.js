// langparts: find passages in another language that have no lang attribute
// (WCAG 2.x Success Criterion 3.1.2, Language of Parts).

export { checkHtml, DEFAULTS } from './check.js';
export { toSarif } from './sarif.js';
export { parseLang } from './scripts.js';
export { VERSION } from './version.js';
