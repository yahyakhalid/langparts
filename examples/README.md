# Examples

| File | What it shows |
|---|---|
| [`ar-page.html`](ar-page.html) | Arabic page: an English sentence, an English `aria-label`, `alt` and link text (4 fails). Brand names and the tagged span are not reported. |
| [`fr-page.html`](fr-page.html) | French page: an English `aria-label` like the one in [cds-snc/canadalogin-user-selfservice-webapp#2434](https://github.com/cds-snc/canadalogin-user-selfservice-webapp/issues/2434) (review) and untagged Arabic (fail). Loanwords and names are not reported. |
| [`en-page.html`](en-page.html) | English page with an untagged Arabic sentence (fail); a tagged greeting, a one-word name and a tagged language menu are fine. |
| [`langparts.config.json`](langparts.config.json) | A config file. |
| [`api.mjs`](api.mjs) | Using the library. |
| [`github-workflow.yml`](github-workflow.yml) | GitHub Actions: the composite action with SARIF upload, or the CLI with `npx`. |

```bash
npx github:yahyakhalid/langparts examples
node examples/api.mjs
```
