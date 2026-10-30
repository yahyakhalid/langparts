# Security policy

langparts reads HTML from files and URLs you give it and prints parts of that
HTML to your terminal or to JSON/SARIF files. Reports of crafted pages that
make it hang, crash, read files it shouldn't, or write control sequences to
the terminal are especially welcome.

It never runs scripts from the pages it checks, makes no network requests
other than fetching the URLs you pass, and sends no telemetry.

## Supported versions

Only the latest 0.x release receives fixes.

## Reporting a vulnerability

Please do **not** open a public issue. Use GitHub's private reporting:
[Report a vulnerability](https://github.com/yahyakhalid/langparts/security/advisories/new).

Include the input that triggers the problem (a file or a minimal HTML
string), the command you ran, what happened and what you expected. You should
get a reply within 7 days. This is a volunteer project with one maintainer,
so fixes are best effort.
