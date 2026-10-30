# Images

| Source | Image |
|---|---|
| `banner.html` | `docs/images/banner.png` (English README) and `docs/images/social-preview.png` |
| `banner-ar.html` | `docs/images/banner-ar.png` (Arabic README) |
| `terminal.html` | `docs/images/terminal.png`. Generated from real CLI output by `node scripts/render-terminal.mjs` |

The finding shown in the banners is real: `checkHtml()` reports exactly that
passage and fix for the paragraph in the card.

Palette: deep indigo (`#15122b`) like a dimmed screen, amber (`#ffd23f`) for
the passage a screen reader gets wrong, mint (`#7ee0c3`) for tagged text and
fixes. Fonts: Atkinson Hyperlegible (designed for low-vision readers), IBM Plex
Sans Arabic, IBM Plex Mono.

Serve this folder over HTTP and screenshot it at 1280 px wide:

```bash
node scripts/render-terminal.mjs
python -m http.server 8817 --bind 127.0.0.1 --directory docs/design
# in another terminal:
chrome --headless=new --hide-scrollbars --window-size=1280,640 --force-device-scale-factor=2 --virtual-time-budget=8000 --screenshot=banner.png http://127.0.0.1:8817/banner.html
chrome --headless=new --hide-scrollbars --window-size=1280,640 --force-device-scale-factor=2 --virtual-time-budget=8000 --screenshot=banner-ar.png http://127.0.0.1:8817/banner-ar.html
chrome --headless=new --hide-scrollbars --window-size=1280,1010 --force-device-scale-factor=2 --virtual-time-budget=8000 --screenshot=terminal.png http://127.0.0.1:8817/terminal.html
```
