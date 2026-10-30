// Walk an HTML document (parsed with parse5) and collect the text that a
// screen reader would announce, grouped into blocks, each piece tagged with
// the language it is declared in.

import { parse } from 'parse5';
import { parseLang } from './scripts.js';
import { BREAK } from './text.js';

/** Never checked: not rendered, not text, or code (WCAG allows technical terms). */
const SKIP = new Set([
  'script', 'style', 'template', 'noscript', 'iframe', 'object', 'embed', 'canvas',
  'video', 'audio', 'math', 'textarea', 'meta', 'link', 'base', 'pre', 'xmp',
  'plaintext', 'listing',
]);

/** Code inside running text: skipped, but the sentence around it continues. */
const NEUTRAL_INLINE = new Set(['code', 'kbd', 'samp', 'var', 'tt']);

/** Elements whose text flows into the surrounding block. */
const INLINE = new Set([
  'a', 'abbr', 'acronym', 'b', 'bdi', 'bdo', 'big', 'br', 'cite', 'data', 'del', 'dfn',
  'em', 'font', 'i', 'img', 'ins', 'label', 'mark', 'nobr', 'q', 'rb', 'ruby', 'rp', 'rt',
  'rtc', 's', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'time', 'u', 'wbr', 'output',
]);

/** Attributes that become (part of) an accessible name or description. */
const NAME_ATTRS = ['aria-label', 'aria-description', 'alt', 'title', 'placeholder'];
const BUTTON_INPUTS = new Set(['button', 'submit', 'reset']);

const SVG_NS = 'http://www.w3.org/2000/svg';

export function parseHtml(html) {
  return parse(html, { sourceCodeLocationInfo: true, scriptingEnabled: false });
}

function attr(el, name) {
  const a = el.attrs?.find((x) => x.name === name && !x.namespace);
  return a ? a.value : undefined;
}

const XML_NS = 'http://www.w3.org/XML/1998/namespace';

/**
 * The element's language declaration. xml:lang counts only where browsers
 * honour it: as a namespaced attribute (SVG, MathML). On HTML elements in an
 * HTML document a plain "xml:lang" attribute has no effect.
 */
function langAttr(el) {
  const own = attr(el, 'lang');
  if (own !== undefined) return own;
  return el.attrs?.find((x) => x.name === 'lang' && x.namespace === XML_NS)?.value;
}

/** True when the element has xml:lang but no lang (a common XHTML leftover). */
export function hasIneffectiveXmlLang(el) {
  return attr(el, 'lang') === undefined && Boolean(el.attrs?.some((x) => x.name === 'xml:lang' && !x.namespace));
}

/**
 * @typedef {object} Segment
 * @property {number} start offset in the block text
 * @property {number} end
 * @property {object} node parse5 text node (or element for attributes)
 * @property {object | null} lang parsed lang, null when no language is declared
 * @property {boolean} neutral true for translate="no" content
 *
 * @typedef {object} Block
 * @property {'text' | 'attr'} kind
 * @property {string} text
 * @property {Segment[]} segments
 * @property {object} element the element that owns the block
 * @property {string} [attribute]
 */

/**
 * @param {object} document parse5 document
 * @param {{baseLang: object | null}} opts
 * @returns {{blocks: Block[], html: object | null, htmlLang: string | undefined}}
 */
export function extractBlocks(document, opts) {
  const blocks = [];
  const html = document.childNodes.find((n) => n.nodeName === 'html') ?? null;
  const htmlLang = html ? langAttr(html) : undefined;
  let cur = null;

  const flush = () => {
    if (cur && /\p{L}/u.test(cur.text)) blocks.push(cur);
    cur = null;
  };
  const push = (text, node, ctx) => {
    if (!cur) cur = { kind: 'text', text: '', segments: [], element: blockOwner(node) };
    const prev = cur.segments[cur.segments.length - 1];
    if (prev && prev.lang !== ctx.lang) cur.text += BREAK;
    const start = cur.text.length;
    cur.text += text;
    cur.segments.push({ start, end: cur.text.length, node, lang: ctx.lang, neutral: ctx.translateNo });
  };
  const space = () => { if (cur) cur.text += ' '; };

  const addAttr = (el, name, value, ctx) => {
    if (!value || !/\p{L}/u.test(value)) return;
    blocks.push({
      kind: 'attr', attribute: name, text: value, element: el,
      segments: [{ start: 0, end: value.length, node: el, lang: ctx.lang, neutral: ctx.translateNo }],
    });
  };

  // One step of the walk. Returns the context for the element's children, or
  // null when they are not visited. Iterative (explicit stack) so that very
  // deep documents don't overflow the call stack.
  const visit = (child, ctx) => {
    if (child.nodeName === '#text') {
      if (!ctx.svgText) push(child.value, child, ctx);
      return null;
    }
    if (!child.tagName) return null; // comments, doctype
    const tag = child.tagName.toLowerCase();
    if (SKIP.has(tag) || attr(child, 'hidden') !== undefined) {
      if (NEUTRAL_INLINE.has(tag)) space(); else if (!INLINE.has(tag)) flush();
      return null;
    }
    if (tag === 'input' && (attr(child, 'type') ?? '').toLowerCase() === 'hidden') return null;
    const c = { ...ctx, ...langCtx(child) };
    const tr = attr(child, 'translate');
    if (tr !== undefined) c.translateNo = tr.trim().toLowerCase() === 'no';
    const inSvg = child.namespaceURI === SVG_NS;
    // Inside <svg> only <title> and <desc> are read as text (see README),
    // and HTML inside <foreignObject> is ordinary HTML again.
    if (inSvg && tag === 'svg') c.svgText = true;
    if (inSvg && (tag === 'title' || tag === 'desc' || tag === 'foreignobject')) c.svgText = false;

    // Attributes are announced as names or descriptions.
    for (const name of NAME_ATTRS) {
      const v = attr(child, name);
      if (v === undefined) continue;
      if (name === 'title' && (tag === 'link' || tag === 'style' || tag === 'html' || tag === 'abbr')) continue;
      addAttr(child, name, v, c);
    }
    if (tag === 'input' && BUTTON_INPUTS.has((attr(child, 'type') ?? '').toLowerCase())) {
      addAttr(child, 'value', attr(child, 'value'), c);
    }

    if (NEUTRAL_INLINE.has(tag)) { space(); return null; }
    if (tag === 'br' || tag === 'wbr' || tag === 'img') { space(); return null; }
    const inline = INLINE.has(tag) && !(inSvg && (tag === 'title' || tag === 'desc'));
    if (!inline) flush(); else space();
    return { ctx: c, after: inline ? space : flush };
  };

  const walk = (rootNode, rootCtx) => {
    const stack = [{ node: rootNode, ctx: rootCtx, i: 0, after: null }];
    while (stack.length) {
      const fr = stack[stack.length - 1];
      const kids = fr.node.childNodes ?? [];
      if (fr.i >= kids.length) {
        stack.pop();
        fr.after?.();
        continue;
      }
      const child = kids[fr.i++];
      const r = visit(child, fr.ctx);
      if (r) stack.push({ node: child, ctx: r.ctx, i: 0, after: r.after });
    }
  };

  const langCtx = (el) => {
    const v = langAttr(el);
    if (v === undefined) return {};
    return { lang: parseLang(v) };
  };

  const root = { lang: opts.baseLang, translateNo: false, svgText: false };
  if (html) {
    const v = langAttr(html);
    if (v !== undefined && v.trim() !== '') {
      const parsed = parseLang(v);
      root.lang = parsed.scripts ? parsed : (opts.baseLang ?? parsed);
    }
    walk(html, root);
  } else {
    walk(document, root);
  }
  flush();
  return { blocks, html, htmlLang };
}

function blockOwner(node) {
  let el = node.parentNode;
  while (el && el.tagName && INLINE.has(el.tagName)) el = el.parentNode;
  return el;
}
