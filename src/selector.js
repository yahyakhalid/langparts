// CSS selectors that point back at an element, and small text helpers.

const ID_RE = /^[A-Za-z][\w-]*$/;

/** A readable CSS selector for a parse5 element, e.g. "main > p:nth-of-type(3) > a". */
export function selectorFor(el, cache = new Map()) {
  if (!el || !el.tagName) return '';
  if (cache.has(el)) return cache.get(el);
  const parts = [];
  for (let n = el; n && n.tagName; n = n.parentNode) {
    const tag = n.tagName.toLowerCase();
    const id = n.attrs?.find((a) => a.name === 'id')?.value;
    if (id && ID_RE.test(id)) { parts.unshift(`${tag}#${id}`); break; }
    if (tag === 'html') { parts.unshift('html'); break; }
    if (tag === 'body' || tag === 'head') { parts.unshift(tag); break; }
    const siblings = (n.parentNode?.childNodes ?? []).filter((c) => c.tagName === n.tagName);
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(n) + 1})` : tag);
  }
  const sel = parts.join(' > ');
  cache.set(el, sel);
  return sel;
}

/** Number of letters in a string. */
export function textLetters(s) {
  let n = 0;
  for (const _ of s.matchAll(/\p{L}/gu)) n++;
  return n;
}
