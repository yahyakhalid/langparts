import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkHtml, parseLang } from '../src/index.js';

const page = (lang, body, head = '') => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">${head}</head><body>${body}</body></html>`;
const run = (lang, body, opts) => checkHtml(page(lang, body), opts).findings;
const fails = (lang, body, opts) => run(lang, body, opts).filter((f) => f.severity === 'fail');
const reviews = (lang, body, opts) => run(lang, body, opts).filter((f) => f.severity === 'review');

describe('script tier: Latin inside Arabic', () => {
  test('an English sentence in an Arabic paragraph fails', () => {
    const f = fails('ar', '<p>وقال المتحدث: We will not accept any further delay in these negotiations، وأضاف أن الوقت ينفد.</p>');
    assert.equal(f.length, 1);
    assert.equal(f[0].rule, 'foreign-script');
    assert.equal(f[0].wcag, '3.1.2');
    assert.equal(f[0].detectedScript, 'Latin');
    assert.equal(f[0].detectedLang, 'en');
    assert.equal(f[0].declaredLang, 'ar');
    assert.equal(f[0].text, 'We will not accept any further delay in these negotiations');
    assert.equal(f[0].fix, '<span lang="en">We will not accept any further delay in these negotiations</span>');
    assert.equal(f[0].selector, 'body > p');
  });

  test('a whole element in English suggests lang on the element', () => {
    const f = fails('ar', '<ul><li><a href="/en">Read the full story in English</a></li></ul>');
    assert.equal(f.length, 1);
    assert.equal(f[0].fix, '<a lang="en">');
    assert.equal(f[0].selector, 'body > ul > li > a');
  });

  for (const name of [
    'GitHub', 'Visual Studio Code', 'iPhone 15 Pro', 'Microsoft Visual Studio Code Insiders',
    'Google Cloud Platform', 'Bank of America', 'The New York Times', 'World Health Organization',
    'António Guterres', 'Jean-Pierre Martin', 'Apple Watch Series 10', 'The Lord of the Rings',
  ]) {
    test(`a proper name is not reported: ${name}`, () => {
      assert.deepEqual(run('ar', `<p>استخدمنا ${name} في هذا المشروع خلال الأسبوع الماضي.</p>`), []);
    });
  }

  test('technical tokens are neutral: versions, dotted names, acronyms, units, handles', () => {
    const f = run('ar', '<p>ثبّت Node.js الإصدار v2.3.1-beta ومنفذ USB-C بحجم 12 MB عبر REST API، وتابع @example_dev و#OpenSource.</p>');
    assert.deepEqual(f, []);
  });

  test('URLs, e-mail addresses and file paths are not text', () => {
    const f = run('ar', '<p>راسلنا على support@example.org أو زر https://example.org/docs/getting-started?lang=en والملف /etc/nginx/sites-available/default هنا.</p>');
    assert.deepEqual(f, []);
  });

  test('code, kbd, samp, var and pre are skipped', () => {
    const f = run('ar', '<p>نفّذ <code>npm install --save-dev typescript eslint prettier</code> ثم <kbd>Ctrl</kbd>.</p><pre>console.log("Hello, welcome to the project and enjoy it");</pre><p>المتغير <var>total number of items</var> و<samp>Permission denied for this user</samp>.</p>');
    assert.deepEqual(f, []);
  });

  test('script, style, template, noscript and hidden content are skipped', () => {
    const f = run('ar', '<script>var s = "Please wait while we load the page";</script><style>/* the main content area */</style><template><p>This template text is never shown</p></template><noscript><p>Please enable JavaScript to use this site</p></noscript><div hidden><p>This hidden text is not rendered at all</p></div><p>نص عربي.</p>');
    assert.deepEqual(f, []);
  });

  test('tagged parts are not reported', () => {
    assert.deepEqual(run('ar', '<p>يقول المثل <span lang="en">practice makes perfect every single day</span> وهذا صحيح.</p>'), []);
    assert.deepEqual(run('ar', '<p xml:lang="en" lang="en">This paragraph is declared as English already.</p>'), []);
  });

  test('xml:lang alone is respected', () => {
    assert.deepEqual(run('ar', '<p xml:lang="en">This paragraph is declared as English with xml:lang only.</p>'), []);
  });

  test('lang="" means unknown language: not checked', () => {
    assert.deepEqual(run('ar', '<p lang="">This text has an explicitly unknown language set on it.</p>'), []);
  });

  test('translate="no" marks names', () => {
    assert.deepEqual(run('ar', '<p>منتجنا <span translate="no">the quick sync tool for teams</span> متاح الآن.</p>'), []);
  });

  test('accessible-name attributes are checked', () => {
    const body = '<button aria-label="Close the navigation menu">✕</button>'
      + '<img src="a.jpg" alt="A man reading a book in the library">'
      + '<input placeholder="Search the documentation">'
      + '<a href="#" title="Open the full archive of climate news">الأرشيف</a>'
      + '<input type="submit" value="Subscribe to the newsletter">'
      + '<div aria-description="Shows the latest news from our team">أخبار</div>';
    const f = fails('ar', body);
    assert.deepEqual(f.map((x) => x.attribute).sort(), ['alt', 'aria-description', 'aria-label', 'placeholder', 'title', 'value']);
    const aria = f.find((x) => x.attribute === 'aria-label');
    assert.match(aria.fix, /Translate the aria-label into Arabic, or add lang="en" to the <button> element/);
    const title = f.find((x) => x.attribute === 'title');
    assert.equal(title.fix, 'Translate the title into Arabic.');
  });

  test('a lone brand in an attribute is not reported', () => {
    assert.deepEqual(run('ar', '<img src="l.svg" alt="GitHub"><a href="/en" aria-label="EN">EN</a>'), []);
  });

  test('a single lower-case interface word as a whole name is only a review', () => {
    const f = run('ar', '<button aria-label="close">✕</button>');
    assert.equal(f.length, 1);
    assert.equal(f[0].severity, 'review');
  });

  test('two words with a lower-case word inside running text are a review, not a fail', () => {
    const f = run('ar', '<p>اضغط هنا Read more للمتابعة.</p>');
    assert.equal(f.length, 1);
    assert.equal(f[0].severity, 'review');
  });

  test('svg text is skipped but svg <title> is checked', () => {
    const f = fails('ar', '<svg role="img"><title>A small chart showing the growth of the project</title><text x="0" y="10">Growth rate per month in percent</text></svg>');
    assert.equal(f.length, 1);
    assert.equal(f[0].selector, 'body > svg > title');
  });

  test('the document <title> is checked', () => {
    const f = checkHtml('<html lang="ar"><head><title>Welcome to our new website for students</title></head><body><p>مرحباً</p></body></html>').findings;
    assert.equal(f.length, 1);
    assert.equal(f[0].selector, 'head > title');
  });

  test('minWords raises or lowers the bar', () => {
    const body = '<p>كتب أحدهم: thanks for the help اليوم.</p>';
    assert.equal(fails('ar', body).length, 1);
    assert.equal(fails('ar', body, { minWords: 5 }).length, 0);
  });

  test('ignore takes words and phrases', () => {
    const body = '<p>سنستخدم أداة the quick sync tool في المشروع وأيضاً widget.</p>';
    assert.equal(fails('ar', body).length, 1);
    assert.deepEqual(run('ar', body, { ignore: ['the quick sync tool'] }), []);
  });
});

describe('script tier: other scripts', () => {
  const sentences = {
    Arabic: 'مرحباً بكم في الجامعة، نتمنى لكم سنة دراسية موفقة.',
    Hebrew: 'ברוכים הבאים לאוניברסיטה שלנו, אנחנו שמחים שבחרתם בנו.',
    Cyrillic: 'Добро пожаловать в наш университет, мы рады видеть вас здесь.',
    Han: '欢迎来到我们的大学，祝你学习愉快。',
    Hiragana: '私たちの大学へようこそ。楽しい一年になりますように。',
    Hangul: '우리 대학교에 오신 것을 환영합니다. 즐거운 한 해 되세요.',
    Greek: 'Καλώς ήρθατε στο πανεπιστήμιό μας, σας ευχόμαστε καλή χρονιά.',
    Devanagari: 'हमारे विश्वविद्यालय में आपका स्वागत है, आपका साल शुभ हो।',
    Thai: 'ยินดีต้อนรับสู่มหาวิทยาลัยของเรา ขอให้มีความสุขตลอดปี',
  };
  for (const [script, s] of Object.entries(sentences)) {
    test(`${script} sentence in an English page fails`, () => {
      const f = fails('en', `<p>Our message: ${s}</p>`);
      assert.equal(f.length, 1, JSON.stringify(f));
    });
  }

  test('expected guesses for the detected language', () => {
    const lang = (s) => fails('en', `<p>Note: ${s}</p>`)[0]?.detectedLang;
    assert.equal(lang(sentences.Arabic), 'ar');
    assert.equal(lang(sentences.Hebrew), 'he');
    assert.equal(lang(sentences.Hiragana), 'ja');
    assert.equal(lang(sentences.Han), 'zh');
    assert.equal(lang(sentences.Hangul), 'ko');
    assert.equal(lang(sentences.Cyrillic), 'ru');
  });

  test('regression: a language menu in several scripts is not one passage', () => {
    assert.deepEqual(run('en', '<nav><a href="/fa">فارسی</a> <a href="/zh">中文</a> <a href="/he">עברית</a> <a href="/ru">Русский</a></nav>'), []);
  });

  test('regression: a list of short CJK names is not one passage', () => {
    assert.deepEqual(run('en', '<p>Partner universities are in 北京, 東京 and Москва.</p>'), []);
  });

  test('regression: a single word in an uncased script is a name', () => {
    assert.deepEqual(run('en', '<p>The campus is named after the poet <span>المتنبي</span>.</p>'), []);
  });

  test('Greek letters in math are not Greek text', () => {
    assert.deepEqual(run('en', '<p>You will meet π, Δx and the α-helix in biology.</p>'), []);
  });

  test('Latin brand names in a Japanese page are fine, an English sentence is not', () => {
    assert.deepEqual(run('ja', '<p>今月は iPhone 16 Pro と Apple Watch、そして Nintendo Switch を販売しています。</p>'), []);
    assert.equal(fails('ja', '<p>お客様の声：This is the best online store I have ever used.</p>').length, 1);
  });

  test('Han is allowed in Japanese and Korean pages', () => {
    assert.deepEqual(run('ja', '<p>東京大学の研究者が新しい論文を発表しました。</p>'), []);
    assert.deepEqual(run('ko', '<p>大韓民國 헌법 제1조는 다음과 같습니다.</p>'), []);
  });

  test('Kana in a Chinese page is reported', () => {
    assert.equal(fails('zh', '<p>日本語の文章：ここにひらがなとカタカナがたくさんあります。</p>').length, 1);
  });

  test('Serbian allows both Cyrillic and Latin', () => {
    assert.deepEqual(run('sr', '<p>Добро дошли на наш сајт. Dobro došli na naš sajt i hvala vam.</p>'), []);
  });

  test('script subtags override the default script', () => {
    assert.deepEqual(run('az-Arab', '<p>آذربایجان دیلینده بیر جمله یازیلیب.</p>'), []);
    assert.equal(fails('uz-Cyrl', '<p>This sentence is written in English text here.</p>').length, 1);
  });

  test('English inside Hebrew and Persian pages fails', () => {
    assert.equal(fails('he', '<p>הודעה: The service will be unavailable on Sunday night because of maintenance.</p>').length, 1);
    assert.equal(fails('fa', '<p>پیام: Your registration has been received and will be processed soon.</p>').length, 1);
  });

  test('regression: attribute text in the page language on an element with another lang is reported', () => {
    // Interlanguage links: <a lang="be" title="(Arabic)">. The title is declared Belarusian.
    const f = fails('ar', '<ul><li><a lang="be" hreflang="be" title="اللغة البيلاروسية الحديثة">Беларуская</a></li></ul>');
    assert.equal(f.length, 1);
    assert.equal(f[0].attribute, 'title');
    assert.equal(f[0].declaredLang, 'be');
  });

  test('languages with an unknown writing system are skipped and listed', () => {
    const r = checkHtml(page('tlh', '<p>This should not be checked at all because tlh is unknown.</p>'));
    assert.deepEqual(r.findings, []);
    assert.deepEqual(r.stats.unknownLangs, ['tlh']);
  });
});

describe('same-script tier (review only)', () => {
  test('an English aria-label in a French page is a review', () => {
    const f = run('fr', '<a href="#c" aria-label="Skip to main content">Passer au contenu principal</a>');
    assert.equal(f.length, 1);
    assert.equal(f[0].rule, 'language-mismatch');
    assert.equal(f[0].severity, 'review');
    assert.equal(f[0].detectedLang, 'en');
  });

  test('an English paragraph in a French page is a review, never a fail', () => {
    const f = run('fr', '<p>Applications submitted after the deadline will be reviewed in the order they are received.</p>');
    assert.equal(f.length, 1);
    assert.equal(f[0].severity, 'review');
  });

  test('an English sentence glued to French text without punctuation is found', () => {
    const f = run('fr', '<p>Le traitement prend habituellement de quatre à six semaines Please read the instructions carefully before you submit the form</p>');
    assert.equal(f.length, 1);
    assert.match(f[0].text, /read the instructions carefully before you submit the form$/);
  });

  test('French loanwords and names in French are fine', () => {
    assert.deepEqual(run('fr', '<p>Pendant le week-end, envoyez un email à notre équipe de marketing digital ou à Service Canada.</p>'), []);
  });

  test('regression: a Title Case English name in a French page is not a review', () => {
    assert.deepEqual(run('fr', '<p>Selon la <a title="Freedom of the Press Foundation" href="#">fondation</a>, le site est sûr.</p>'), []);
  });

  test('regression: "services as quickly as" in English is not French', () => {
    assert.deepEqual(run('en', '<p>We are working to restore services as quickly as possible for everyone.</p>'), []);
  });

  test('regression: Arabic lists joined with و are not Persian', () => {
    assert.deepEqual(run('ar', '<p>و مجلس الأمن و المجلس الاقتصادي والاجتماعي و مجلس الوصاية و محكمة العدل الدولية و الأمانة العامة</p>'), []);
  });

  test('Sorani Kurdish and Persian inside Arabic are reviews', () => {
    const ckb = run('ar', '<p>ئەم دەروازەیە خزمەتگوزارییەکانی حکومەت بە زمانی کوردی و عەرەبی پێشکەش دەکات.</p>');
    assert.equal(ckb.length, 1);
    assert.equal(ckb[0].detectedLang, 'ckb');
    const fa = run('ar', '<p>این درگاه خدمات دولتی را به زبان‌های مختلف ارائه می‌دهد و شما می‌توانید از آن استفاده کنید.</p>');
    assert.equal(fa.length, 1);
    assert.equal(fa[0].detectedLang, 'fa');
  });

  test('Arabic inside a Persian page is a review', () => {
    const f = run('fa', '<p>يرجى من جميع الطلاب الالتزام بالمواعيد المحددة للتسجيل، وذلك لضمان حصولهم على المقاعد المتاحة في الوقت المناسب.</p>');
    assert.equal(f.length, 1);
    assert.equal(f[0].detectedLang, 'ar');
  });

  test('Iraqi Arabic with چ and گ is not Persian', () => {
    assert.deepEqual(run('ar', '<p>نقول دائماً چاي العصر قبل الاجتماع، وگال المدير إن الوقت مناسب للجميع.</p>'), []);
  });

  test('a language without a word list uses n-grams, confirmed by a word list', () => {
    const f = run('sv', '<p>Välkommen till vår webbplats. Please read the instructions carefully before you submit the form to the office.</p>');
    assert.equal(f.length, 1);
    assert.equal(f[0].detectedLang, 'en');
    assert.deepEqual(run('sv', '<p>Välkommen till vår webbplats, här hittar du information om hur du ansöker om bidrag och vilka dokument som behövs.</p>'), []);
  });

  test('close Romance languages in their own pages are fine', () => {
    assert.deepEqual(run('es', '<p>Bienvenidos a nuestra página. Esta página ya no se actualiza y será eliminada el próximo mes por el equipo.</p>'), []);
    assert.deepEqual(run('pt', '<p>Bem-vindo ao nosso site. Esta página não é mais atualizada e será removida no próximo mês pela equipe.</p>'), []);
    assert.deepEqual(run('it', '<p>Benvenuti nel nostro sito. Questa pagina non viene più aggiornata e sarà rimossa il mese prossimo.</p>'), []);
  });

  test('review: false turns the tier off', () => {
    assert.deepEqual(run('fr', '<a href="#c" aria-label="Skip to main content">Passer</a>', { review: false }), []);
  });
});

describe('page language (WCAG 3.1.1)', () => {
  test('missing <html lang> is reported and parts without lang are not checked', () => {
    const r = checkHtml('<!doctype html><html><body><p>مرحباً بكم في موقعنا الجديد هذا الأسبوع.</p><div lang="en"><p>Inside: مرحباً بكم جميعاً في موقعنا الجديد هذا الأسبوع.</p></div></body></html>');
    assert.equal(r.documentLang, null);
    assert.equal(r.findings[0].rule, 'missing-document-lang');
    assert.equal(r.findings[0].wcag, '3.1.1');
    assert.equal(r.findings.filter((f) => f.rule === 'foreign-script').length, 1);
  });

  test('--lang assumes a page language', () => {
    const r = checkHtml('<html><body><p>Hello: مرحباً بكم في موقعنا الجديد هذا الأسبوع.</p></body></html>', { lang: 'en' });
    assert.equal(r.assumedLang, 'en');
    assert.equal(r.findings.filter((f) => f.rule === 'foreign-script').length, 1);
    assert.match(r.findings[0].message, /Checked as English/);
  });

  test('an invalid lang on <html> is reported', () => {
    const r = checkHtml('<html lang="english!"><body><p>Hello world.</p></body></html>');
    assert.equal(r.findings[0].rule, 'missing-document-lang');
    assert.equal(r.findings[0].attribute, 'lang');
  });

  test('en_US style tags are understood though not valid', () => {
    const r = checkHtml('<html lang="en_US"><body><p>Hello: مرحباً بكم في موقعنا الجديد هذا الأسبوع.</p></body></html>');
    assert.equal(r.findings.filter((f) => f.rule === 'foreign-script').length, 1);
  });
});

describe('source positions', () => {
  test('line and column point at the start of the passage', () => {
    const html = '<html lang="ar">\n<body>\n<p>نص عربي هنا ثم We will not accept any further delay here.</p>\n</body></html>';
    const f = checkHtml(html).findings[0];
    assert.equal(f.line, 3);
    assert.equal(f.column, html.split('\n')[2].indexOf('We') + 1);
  });

  test('CRLF line endings', () => {
    const html = '<html lang="ar">\r\n<body>\r\n<p>نص عربي\r\nثم We will not accept any further delay here.</p>\r\n</body></html>';
    const f = checkHtml(html).findings[0];
    assert.equal(f.line, 4);
    assert.equal(f.column, 4);
  });

  test('attributes point at the attribute', () => {
    const html = '<html lang="ar">\n<body>\n  <button   aria-label="Close the navigation menu">✕</button>\n</body></html>';
    const f = checkHtml(html).findings[0];
    assert.equal(f.line, 3);
    assert.equal(f.column, 13);
  });

  test('entities fall back to the start of the text node', () => {
    const html = '<html lang="ar"><body><p>نص &amp; We will not accept any further delay here.</p></body></html>';
    const f = checkHtml(html).findings[0];
    assert.equal(f.line, 1);
    assert.ok(f.column > 0);
  });
});

describe('parseLang', () => {
  test('known languages and script subtags', () => {
    assert.deepEqual(parseLang('ar-IQ').scripts, ['Arabic']);
    assert.deepEqual(parseLang('sr-Latn').scripts, ['Latin']);
    assert.deepEqual(parseLang('zh-Hant-TW').scripts, ['Han', 'Bopomofo']);
    assert.equal(parseLang('').unknown, true);
    assert.equal(parseLang('und').unknown, true);
    assert.equal(parseLang('xx-invalid-!').valid, false);
  });
});

test('throws on non-string input', () => {
  assert.throws(() => checkHtml(null), TypeError);
});

test('empty and text-free documents', () => {
  assert.deepEqual(checkHtml('<html lang="en"></html>').findings, []);
  assert.deepEqual(checkHtml('<html lang="en"><body><img src="x.png"><p>123 456</p></body></html>').findings, []);
});
