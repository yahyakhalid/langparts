# Experiment: can language-of-parts checking be automated without flooding people with false positives?

This file was written, together with the labelled corpus in `test/corpus/`,
**before** any detection code existed. The criteria below were fixed at that
point. Results are added at the end and changes to the design are explained
there, not by editing the criteria.

## Hypothesis

WCAG 2.x Success Criterion 3.1.2 asks that the language of every passage that
differs from the page language can be programmatically determined, with
exceptions for proper names, technical terms, words of indeterminate language
and words that have become part of the surrounding language.

The hardest part of automating this is not finding foreign text; it is **not
reporting** the foreign text that WCAG allows. A lone Latin brand name in an
Arabic paragraph (`GitHub`, `iPhone 15 Pro`, `Visual Studio Code`) is
extremely common and is not a failure. If a checker reports these, people
will turn it off.

The hypothesis is that two tiers make this workable:

1. **Script mismatch** (text in a writing system the declared language does
   not use, for example Latin in an Arabic part or Arabic in an English part)
   can be reported as a **fail** with high precision, if runs are long enough
   and look like sentences rather than names.
2. **Same-script mismatch** (English inside French, Persian or Sorani inside
   Arabic) is much less certain and should only ever be reported as **needs
   review**.

## Corpus

### A. Synthetic, labelled (committed: `test/corpus/*.html`)

Pages written by hand for this experiment, in Arabic, English, French,
Japanese, Russian, Hebrew, Persian and Kurdish (Sorani). Every case is marked
on its element:

| Marker | Meaning |
|---|---|
| `data-expect="fail"` | Seeded failure. A `fail` finding must be reported on this element or inside it. |
| `data-expect="review"` | Same-script or borderline case. Should be reported as `review` (never `fail`). |
| `data-expect="none"` | A case WCAG allows (proper name, technical term, URL, code, tagged text...). No `fail` may be reported here. |
| `data-expect="any"` | Genuinely ambiguous (for example a book title in another language). Excluded from scoring and listed separately. |

`data-case` gives each case a short id and `data-class` its category (for
example `brand`, `sentence`, `aria-label`). Text that is not marked is
ordinary page-language text and must not produce a `fail` either.

### B. Real public pages (not committed)

A list of public pages (`docs/experiment/real-pages.json`): Arabic, French,
English, Persian, Kurdish, Hebrew, Russian and Japanese pages, including
bilingual Government of Canada pages and Wikipedia articles full of brand and
product names. Page bodies are fetched at run time into a local cache and are
**not** committed; only the URLs, the fetch date and the measured results are.

Every `fail` reported on these pages is labelled by hand as a true positive
(a passage in another language that is not a WCAG exception) or a false
positive. If a page produces more than 30 fails, a random sample of 30 is
labelled (seed recorded).

For recall on realistic markup, a script injects known foreign sentences
(without `lang`) into random paragraphs of the cached real pages and checks
that they are found.

## Criteria (fixed before running)

| # | Criterion | Threshold |
|---|---|---|
| C1 | Script-tier **precision** on corpus A: fails on `fail` cases / all fails (excluding `any`) | ≥ 95% |
| C2 | Script-tier **recall** on corpus A: `fail` cases with at least one fail / all `fail` cases | ≥ 90% |
| C3 | Lone brand and proper-name cases (`data-class` `brand` or `name`) in the Arabic and French pages | **0** fails |
| C4 | Precision of fails on real pages (B), hand-labelled | ≥ 95% |
| C5 | Recall of injected sentences in real pages (B) | ≥ 90% |
| C6 | Review tier: precision on A and B | reported honestly, no threshold |
| C7 | No `review` finding is ever promoted to `fail` by the same-script tier | always |

If a criterion fails, the design is changed and the change is recorded below
with the numbers before and after. A criterion is never relaxed after
seeing the results.

## How to re-run

```bash
npm install
node scripts/experiment.mjs            # corpus A
node scripts/experiment.mjs --real     # corpus B (fetches pages into .cache/)
```

## Results

_Pending: filled in after the first run._
