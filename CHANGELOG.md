# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/). Until 1.0, minor versions may
change the API, the rules and the output.

## [0.1.0] - 2026-10-30

First public, **experimental** release.

### Added
- `checkHtml(html, options)`: finds passages whose language differs from the
  declared language (nearest `lang`) and that have no `lang` of their own,
  WCAG 2.x Success Criterion 3.1.2.
  - `foreign-script` rule: text in a writing system the declared language
    doesn't use (Latin in Arabic, Arabic in English, Cyrillic, Greek, Hebrew,
    Han, kana, Hangul, Devanagari, Thai and more). Reported as **fail** when
    the run reads like a sentence, as **review** when it is short.
  - `language-mismatch` rule: same script, other language (English in French,
    Persian or Sorani Kurdish in Arabic...), always **review**. Word lists for
    English, French, Spanish, German, Italian, Portuguese, Dutch, Russian,
    Ukrainian, Arabic, Persian, Sorani Kurdish and Urdu, plus the franc n-gram
    identifier for long passages.
  - `missing-document-lang` rule: no valid `lang` on `<html>` (WCAG 3.1.1).
  - Checks text blocks and the accessible-name attributes `aria-label`,
    `aria-description`, `alt`, `title`, `placeholder` and the `value` of
    input buttons.
  - Skips what WCAG allows: proper names and brand names (capitalisation and
    name particles), technical tokens, code (`code`, `kbd`, `samp`, `var`,
    `pre`), URLs, e-mail addresses, file paths, numbers, `translate="no"`
    content, and a built-in plus user-supplied ignore list.
  - Findings with selector, line and column, the passage, declared and
    detected language and script, confidence and a suggested fix.
- `langparts` CLI for files, directories, globs and URLs (static HTML only),
  with human, `--json` and `--sarif` output, `--lang`, `--min-words`,
  `--min-chars`, `--ignore`, `--no-review`, `--fail-on` and
  `langparts.config.json`.
- `toSarif()` and a composite GitHub Action (`action.yml`).
- Experiment with criteria fixed before the code was written, a labelled
  corpus, and measurements on 19 real pages (`docs/experiment.md`).

[0.1.0]: https://github.com/yahyakhalid/langparts/releases/tag/v0.1.0
