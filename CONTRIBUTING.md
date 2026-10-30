# Contributing to langparts

Thanks for helping. Arabic, English, French, Kurdish and Persian are all
welcome in issues and pull requests.

## The most useful contribution: a false positive or a miss

langparts is only useful if people can trust its fails. If it reported a
name, a brand or a technical term, or missed untagged text in another
language, open a **False positive or missed passage** issue with:

1. the HTML of the element and the `lang` attributes that apply to it,
2. the finding from `--json` (if there is one),
3. why it is wrong.

Reports for languages other than Arabic, English and French help most: the
real-page measurements in [docs/experiment.md](docs/experiment.md) cover
those best.

## Development

```bash
git clone https://github.com/yahyakhalid/langparts
cd langparts
npm install
npm test                          # node --test
node bin/langparts.js examples    # try the CLI
node scripts/experiment.mjs       # labelled corpus (criteria C1-C3, C7)
node scripts/bench.mjs            # speed
```

Source is plain JavaScript (ES modules) in `src/`, the CLI in `bin/`, type
declarations in `index.d.ts`, tests in `test/` (Node's built-in test runner).
There is no build step.

## Pull requests

- Keep each pull request to one change, with a test that fails without it.
- A change to detection must keep `test/corpus.test.js` passing, and should
  say what it does to the numbers of `node scripts/experiment.mjs`. If you can,
  run `node scripts/experiment.mjs --real` too and report the result.
- New corpus cases: mark them with `data-expect` (`fail`, `review`, `none` or
  `any`), `data-case` and `data-class`. Write them yourself; don't paste text
  from other sites.
- New word lists: function words only, and leave out words shared with
  another language that uses the same script.
- Update `CHANGELOG.md` under an "Unreleased" heading.

## Conduct

Be kind and assume good faith. Harassment or discrimination of any kind is
not accepted; maintainers may remove comments or block accounts that break
this.
