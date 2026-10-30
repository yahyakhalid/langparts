# Benchmarks

How fast `checkHtml()` is on large pages. Measured on 2026-10-30.

## How to re-run

```bash
npm install
node scripts/bench.mjs            # 5 runs per page, median
node scripts/bench.mjs --runs 10
```

The script always measures two generated Arabic pages (with seeded English
text and `aria-label`s). If you ran `node scripts/experiment.mjs --real`
first, it also measures the 19 cached real pages from the experiment
(`.cache/real/`, not committed).

## Results

Intel Core i9-14900K, Windows 11, Node.js 26.12.1. One process, single
thread; time includes HTML parsing (parse5) and all checks.

| Page | Size (MB) | Median (ms) | MB/s | Findings |
|---|---|---|---|---|
| generated, 1,000 sections | 0.44 | 75 | 5.8 | 243 |
| generated, 10,000 sections | 4.42 | 1,020 | 4.3 | 2,429 |
| ar-wiki-iphone (largest real page) | 2.56 | 150 | 17.0 | 381 |
| ar-wiki-python | 1.24 | 81 | 15.3 | 160 |
| en-wiki-arabic | 1.22 | 91 | 13.4 | 17 |
| ar-aljazeera | 0.96 | 34 | 28.1 | 61 |
| ar-wiki-github | 0.93 | 74 | 12.6 | 239 |
| ar-bbc | 0.62 | 22 | 28.3 | 6 |
| ja-wiki-github | 0.63 | 44 | 14.4 | 180 |
| ckb-wiki-kurdistan | 0.51 | 35 | 14.7 | 45 |
| fr-canada-home | 0.04 | 2 | 14.8 | 0 |

Real pages run at roughly 13–28 MB/s; the generated pages are slower per
megabyte because almost every byte is text. A 2.5 MB Wikipedia article takes
about 0.15 s.

## Worst cases checked

These came out of the self-review and are covered by tests in
`test/review-regressions.test.js`. "Before" times were measured by the
reviewer, "after" times on the machine above:

| Input | Before the fix | After |
|---|---|---|
| 200 KB of letters with no spaces | 14 s (quadratic e-mail pattern) | 10 ms |
| 4,000 inline `<span lang="en">` in one paragraph | 7.8 s | 26 ms |
| 5,000 nested `<div>` | stack overflow | 83 ms |

Numbers depend on the machine; compare runs on the same computer.
