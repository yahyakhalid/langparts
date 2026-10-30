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

Measured on 2026-10-30 with langparts 0.1.0. Raw output:
[`results-corpus-run1.json`](experiment/results-corpus-run1.json) (first run),
[`results-corpus.json`](experiment/results-corpus.json),
[`results-real.json`](experiment/results-real.json) and the hand labels in
[`real-labels.json`](experiment/real-labels.json) (keys are hashes of
selector and text; no page text is stored).

### Summary

| # | Criterion | Threshold | Result | |
|---|---|---|---|---|
| C1 | Script-tier precision, corpus A | ≥ 95% | first run **97.5%** (39/40); final **100%** (39/39) | pass |
| C2 | Script-tier recall, corpus A | ≥ 90% | first run **100%** (39/39); final **100%** (39/39) | pass |
| C3 | Fails on brand and name cases (Arabic, French pages) | 0 | **0** of 38 cases, first run and final | pass |
| C4 | Precision of fails on real pages, hand-labelled | ≥ 95% | **97.4%** (266 of 273 labelled fails) | pass |
| C5 | Recall of injected sentences in real pages | ≥ 90% | **100%** (86/86) | pass |
| C6 | Review tier precision | reported | corpus A first run 81.8% (9/11), final 100% (10/10); real pages, random sample of 60: **93.3%** (56/60) | — |
| C7 | Same-script tier never reports a fail | always | 0 fails from that tier | pass |

**Read the corpus A numbers with care.** The first run already met C1–C3,
but the design was then changed in response to what it showed, and the final
100% is measured on the same corpus that guided those changes (in-sample).
Corpus B, the real pages, is the honest test of false positives, and it was
not used to tune the script tier (see the change log below).

### First run on corpus A, and what changed

The first run (before any tuning) gave 1 false fail, 2 false reviews and 1
missed review:

| Finding | Class | Change |
|---|---|---|
| `فارسی 中文 עברית` in an English page reported as one 3-word passage (fail) | language menu in several scripts | A passage now ends where the writing system changes (Han, Hiragana and Katakana count as one) |
| `北京, 東京` reported for review | list of short CJK names | Commas and `、` split CJK passages |
| `المتنبي` (one Arabic word, a name) reported for review | single word in a script without case | A single word in Arabic, Hebrew and similar scripts is never reported |
| `Enter your social insurance number` (placeholder in a French page) missed | short UI string | Added common form words (enter, number, name, address...) to the English list |

### Corpus B: real pages

19 public pages fetched on 2026-10-30 (list in
[`real-pages.json`](experiment/real-pages.json)). "Labelled" is every fail on
the page, or a seeded random sample of 30.

| Page | lang | KB | Fails | Labelled | True | False | Reviews | Injected found |
|---|---|---|---|---|---|---|---|---|
| ar-wiki-github | ar | 878 | 137 | 30 | 30 | 0 | 102 | 5/5 |
| ar-wiki-python | ar | 1158 | 98 | 30 | 29 | 1 | 62 | 5/5 |
| ar-wiki-iphone | ar | 2308 | 211 | 30 | 30 | 0 | 170 | 5/5 |
| ar-bbc | ar | 600 | 5 | 5 | 5 | 0 | 1 | 5/5 |
| ar-aljazeera | ar | 971 | 41 | 30 | 30 | 0 | 20 | 5/5 |
| ar-un | ar | 168 | 15 | 15 | 13 | 2 | 4 | 5/5 |
| ar-who | ar | 100 | 6 | 6 | 6 | 0 | 0 | 5/5 |
| ar-moh-sa | ar-sa | 72 | 9 | 9 | 9 | 0 | 5 | 1/1 |
| ar-qatar-hukoomi | ar | 230 | 4 | 4 | 4 | 0 | 1 | 0/0 ¹ |
| fr-canada-home | fr | 37 | 0 | 0 | 0 | 0 | 0 | 5/5 |
| fr-canada-ei | fr | 28 | 0 | 0 | 0 | 0 | 0 | 5/5 |
| en-canada-home | en | 36 | 0 | 0 | 0 | 0 | 0 | 5/5 |
| fr-wiki-github | fr | 242 | 0 | 0 | 0 | 0 | 1 | 5/5 |
| fa-wiki-github | fa | 311 | 60 | 30 | 30 | 0 | 14 | 5/5 |
| ckb-wiki-kurdistan | ckb | 451 | 28 | 28 | 27 | 1 | 17 | 5/5 |
| he-wiki-github | he | 153 | 15 | 15 | 14 | 1 | 10 | 5/5 |
| ru-wiki-github | ru | 250 | 3 | 3 | 3 | 0 | 10 | 5/5 |
| ja-wiki-github | ja | 584 | 112 | 30 | 28 | 2 | 68 | 5/5 |
| en-wiki-arabic | en | 1235 | 8 | 8 | 8 | 0 | 9 | 5/5 |
| **Total** | | | **752** | **273** | **266** | **7** | **494** | **86/86** |

¹ All long paragraphs on that page are inside `hidden` content, which is not
checked, so nothing was injected.

**What the true fails were** (266): English text in Arabic, Persian, Kurdish,
Hebrew, Russian and Japanese pages without `lang`, mostly citation titles and
"Archived from the original" boilerplate on Wikipedia (73), other text (109),
and accessible names: `title` (25), `alt` (24), `aria-label` (24). Examples of
the kind (not quoted from the pages): English `alt` text on every photo of an
Arabic news home page, "Skip to main content" and "Toggle navigation" on an
Arabic intergovernmental page, English `aria-label`s on carousel buttons of an
Arabic government page.

**The 7 false fails**: names of works written with lower-case words (3,
including one image whose `alt` and `title` repeat the same name), technical
terms used as terms (2, "pull request" in Hebrew, a GitHub feature name in
Japanese), a product name (1) and a transliterated personal name written in
lower case (1). All are cases where the words look like an English phrase;
`--ignore` covers them.

**A labelling decision that changes the number.** 11 of the true fails are
interlanguage links of the form `<a lang="be" title="(Arabic text)">`: the
`title` is in the page language, but HTML says an attribute is in the
element's language, so a screen reader would read it with Belarusian rules.
That is a real mismatch and was labelled true. If you count these as false
alarms instead, C4 is **93.4%** (255/273) and the criterion is missed.

**Labelling rule.** A fail is true when it is two or more words of another
language forming a phrase or sentence that is not a proper name, a technical
term or a word that has entered the page language. Titles of articles and
web pages count as passages; names of works, products, people and places
count as names. One person (the author) labelled everything; there was no
second rater.

**Bilingual Government of Canada pages**: 0 fails and 0 reviews on the
French and English home pages and a French service page. Their alternate-
language text is tagged with `lang`.

### Same-script tier on real pages

The random review sample above contained only script-tier reviews, so the
same-script tier was checked separately: it reported 9 passages on the 19
pages, all in English Wikipedia's "Arabic" article and French Wikipedia's
"GitHub" article. 8 are untagged French or German citation titles or
passages; 1 is quoted French words in a discussion of grammar (ambiguous).

Injected sentences (English into French pages, French into English pages,
5 per page on 5 pages): **25/25** found as reviews. Before the sub-span search
(see below) it was 17/25.

### Changes made after corpus B (same-script tier only)

| Observation | Change | Effect |
|---|---|---|
| "Freedom of the Press Foundation" (English name in French) reported for review | Same-script tier skips Title Case runs whose only lower-case words are name particles | removed |
| English sentence glued to French text without punctuation not found | Search the longest stretch of words that clearly votes for one other language | injected recall 17/25 → 25/25 |
| Arabic lists joined with standalone "و" reported as Persian | Added "و" to the Arabic list; count distinct words, not repeats | removed |
| "services as quickly as" reported as French in an English page | Removed words shared by English and French from the lists ("services", "page", "site", "contact", "information", "menu", "application") and added "as" to English | removed |

None of these changed the script-tier numbers above (C4 stayed at 266/273).

### Harness bugs found on the way

- The first injection run reported 0/5 on one page: the paragraphs were inside
  `hidden` content, which the checker correctly skips. The harness now only
  injects into visible paragraphs.
- A first fix skipped every element with a `lang` attribute, which excluded
  Wikipedia's whole article body (`<div lang="ar">`). It now skips only parts
  declared in another language than the page.

### What this does not show

- Corpus A was written by the same person who wrote the detector.
- Corpus B is 19 pages; Arabic is well covered, other languages are 1 page
  each. Pages change, so a re-run will give different numbers.
- Recall on real pages is measured only with injected sentences, which are
  easier than real untagged text (for example two-word phrases).
- The review tier was sampled (60 of 494 findings), not fully labelled.
