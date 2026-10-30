// Small word lists. They are deliberately short: they decide whether a run of
// foreign text reads like a sentence, and which language a short string is in.

const set = (s) => new Set(s.trim().split(/\s+/));

/**
 * Lower-case words that appear inside Title Case names ("Bank of America",
 * "The Lord of the Rings", "Jean de La Fontaine"). They don't count as
 * evidence that a run is a sentence.
 */
export const NAME_PARTICLES = set(`
  of the and for in on at to a an by with from & et
  de la le les du des d l da do dos das di del della y e el los las al bin ibn bint abu
  von van der den ter zu und
`);

/**
 * Function words and very common words per language, used for two things:
 * guessing the language of a run, and the same-script check (English in a
 * French page). Words shared by several languages are fine: a word counts for
 * every language whose list has it.
 */
export const FUNCTION_WORDS = {
  en: set(`
    a an the and of to in is are was were be been being have has had do does did will would as
    can could should may might must shall this that these those it its they them their
    there here what which who whom whose when where why how not no yes you your yours we
    our ours he him his she her i me my mine with without for from by about into onto
    over under after before between through during than then so if or but because while
    all any each every some more most other such only also just very too again once
    up down out off now new please click here read more learn sign skip main content
    search home next previous back close open account help about privacy
    terms use using used get got make made see view show hide share download upload
    submit send cancel continue start stop website our us
    welcome thank thanks year years day today time first last free available
    enter number name address phone password username required optional select choose
    find go your yours apply form forms report reports
  `),
  fr: set(`
    le la les un une des du de d l au aux et ou mais donc car ni que qui quoi dont où
    ce cet cette ces mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs
    je tu il elle on nous vous ils elles me te se lui y en est sont était étaient être
    avoir ai as avons avez ont avait été fait faire peut peuvent doit doivent sera
    seront dans par pour sur sous avec sans chez entre vers depuis pendant avant après
    ne pas plus moins très bien aussi encore déjà toujours jamais tout tous toute toutes
    cela ça ceci comme si quand comment pourquoi oui non lire suite voir accueil
    recherche rechercher fermer ouvrir compte aide connexion connecter se votre
    renseignements demande demander prestations emploi gouvernement
  `),
  es: set(`
    el la los las un una unos unas de del al y o pero que quien cual cuando donde como
    por para con sin sobre entre hasta desde durante es son era eran ser estar está
    están fue han ha hay tiene tienen puede pueden este esta estos estas ese esa eso
    su sus mi mis tu tus nuestro nuestra nuestros vuestro yo tú él ella nosotros ellos
    ellas se le les lo no sí más muy también ya todo todos toda todas leer inicio
    buscar cerrar abrir cuenta ayuda
  `),
  de: set(`
    der die das den dem des ein eine einen einem einer eines und oder aber denn dass
    wer was wann wo wie warum ist sind war waren sein bin bist hat haben hatte hatten
    wird werden wurde kann können muss müssen soll sollen mit ohne für von zu zum zur
    bei nach vor aus auf über unter zwischen durch gegen nicht kein keine auch noch
    schon sehr nur alle alles dieser diese dieses ich du er sie es wir ihr mein dein
    sein unser euer ihre ihren mehr lesen startseite suche schließen öffnen konto hilfe
  `),
  it: set(`
    il lo la i gli le un uno una di del della dei delle a al alla ai da dal dalla in nel
    nella con su sul sulla per tra fra e o ma che chi cui come dove quando perché è sono
    era erano essere ha hanno aveva avere può possono questo questa questi queste quel
    quella mio mia tuo tua suo sua nostro nostra vostro loro io tu lui lei noi voi non
    più molto anche già tutto tutti leggi cerca chiudi apri conto aiuto
  `),
  pt: set(`
    o a os as um uma uns umas de do da dos das no na nos nas ao aos à às em por para
    com sem sobre entre até desde e ou mas que quem qual quando onde como é são era
    eram ser estar está estão foi tem têm pode podem este esta estes estas esse essa
    isso seu sua seus suas meu minha nosso nossa eu tu ele ela nós eles elas se lhe
    não sim mais muito também já todo todos toda todas ler início pesquisar fechar
    abrir conta ajuda você vocês
  `),
  nl: set(`
    de het een en of maar dat die wie wat wanneer waar hoe waarom is zijn was waren
    ben bent heeft hebben had hadden wordt worden werd kan kunnen moet moeten zal zullen
    met zonder voor van naar bij uit op over onder tussen door tegen niet geen ook nog
    al zeer heel alleen alle alles deze dit ik jij je hij zij wij jullie mijn jouw zijn
    haar ons onze hun meer lezen zoeken sluiten openen account hulp
  `),
  ru: set(`
    и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по
    только ее мне было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если
    уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей
    может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз
    тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом
    один почти мой тем чтобы нее сейчас были куда зачем всех никогда можно при наконец
    два об другой хоть после над больше тот через эти нас про всего них какая много
    разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой
    им более всегда конечно всю между это мы наш наши
  `),
  uk: set(`
    і й та в у на з із зі до від для про по за під над між через без що як але або
    чи це цей ця ці той та ті я ти він вона воно ми ви вони мене тебе його її нас вас
    їх мій моя моє мої твій наш наша наше наші ваш ваша є був була було були буде
    будуть може можна треба також ще вже дуже не ні так тут там де коли який яка яке
    які всі усі все усе кожен свій своя своє свої щоб якщо раді
  `),
  ar: set(`
    و في من على إلى الى عن أن ان إن التي الذي الذين هذا هذه ذلك تلك هناك هنا كان كانت
    يكون تكون مع لا ما لم لن قد كل بعد قبل عند حتى أو او ثم بين نحو لقد كما أي وفي ومن
    وعلى وإلى وذلك وهو وهي وقد وكان هو هي هم نحن أنت أنا يتم تم خلال حول عبر ضمن لدى
    أيضا أيضاً منذ إذا اذا لكن بل غير جميع بعض الآن يمكن يجب
  `),
  fa: set(`
    و در به از که این آن را با است هست بود شد شده می نمی برای تا یا اما اگر هم نیز
    باید بر هر چه چرا کجا چگونه چون همه دیگر روی زیر پس پیش بین خود شما ما ایشان
    آنها اینها یک کرد کرده کند کنند کنید می‌توانید می‌شود می‌کند نیست هستند
  `),
  ckb: set(`
    و لە بە کە ئەم ئەو بۆ لەگەڵ دەکات دەبێت هەموو یان تا کرد کردن هەیە نییە بوو دوای
    پێش زۆر ناو سەر لەسەر دەتوانیت دەتوانن ئێمە ئێوە ئەوان من تۆ ئەوە ئەمە چۆن کوا
    کەی بەڵام ئەگەر هەروەها
  `),
  ur: set(`
    ہے ہیں کے کی کا میں اور سے کو یہ وہ نہیں پر تھا تھی تھے بھی ہو ہوں گا گی گے لیے
    کیا کر کرنا کرتے جو جس اس ان آپ ہم
  `),
};

/** Languages whose lists we have, by script, used for guessing and the same-script check. */
export const LISTS_BY_SCRIPT = {
  Latin: ['en', 'fr', 'es', 'de', 'it', 'pt', 'nl'],
  Cyrillic: ['ru', 'uk'],
  Arabic: ['ar', 'fa', 'ckb', 'ur'],
};

/**
 * Common English interface words. A single lower-case word like "close" or
 * "menu" as a whole accessible name in a non-Latin page is reported for
 * review; a single capitalised word ("GitHub") is assumed to be a name.
 */
export const UI_WORDS = set(`
  close open menu search home next previous back more submit send cancel continue
  login logout signin signup register download upload share print edit delete save
  settings help contact about play pause stop mute unmute expand collapse show hide
  skip loading error warning success copy paste select filter sort view
`);

/**
 * Names that are written in lower case or mixed case and would otherwise look
 * like ordinary words. Capitalised names don't need to be listed: capitalised
 * words are never counted as sentence evidence.
 */
export const BUILTIN_IGNORE = [
  'npm', 'git', 'yarn', 'pnpm', 'deno', 'bun', 'node', 'jquery', 'webpack', 'vite',
  'eslint', 'prettier', 'babel', 'nginx', 'apache', 'linux', 'ubuntu', 'debian',
  'iphone', 'ipad', 'ipod', 'imac', 'macbook', 'airpods', 'icloud', 'itunes', 'ios',
  'ipados', 'macos', 'watchos', 'tvos', 'ebay', 'eshop', 'gmail', 'wifi', 'wi-fi',
  'bluetooth', 'email', 'e-mail', 'online', 'offline', 'blog', 'vlog', 'podcast',
  'hashtag', 'emoji', 'selfie', 'smartphone', 'laptop', 'tablet', 'app', 'apps',
  'ok', 'okay', 'www', 'http', 'https', 'html', 'css', 'json', 'xml', 'pdf', 'jpg',
  'jpeg', 'png', 'gif', 'svg', 'mp3', 'mp4', 'zip', 'km', 'kg', 'cm', 'mm', 'mb',
  'gb', 'tb', 'kb', 'ghz', 'mhz', 'kwh', 'mph', 'am', 'pm', 'vs', 'etc', 'e.g', 'i.e',
  'feat', 'ft', 'via', 'lorem', 'ipsum',
];
