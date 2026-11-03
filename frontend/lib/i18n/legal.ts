import type { Locale } from "./index";

export type LegalBlock =
  | { kind: "p"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "note"; text: string };

export interface LegalPage {
  title: string;
  updated: string;
  description: string;
  blocks: LegalBlock[];
  contact: string;
  related: string;
  relatedHref: string;
}

const PRIVACY_RU: LegalPage = {
  title: "Политика конфиденциальности",
  updated: "Обновлено 3 ноября 2026 года",
  description:
    "Какие данные хранит jey, зачем они нужны, кому передаются, сколько хранятся и как удалить аккаунт.",
  contact: "Трекер проекта",
  related: "Условия использования",
  relatedHref: "/terms",
  blocks: [
    {
      kind: "p",
      text:
        "jey.net — личный некоммерческий портал для учёта фильмов, книг и картинок. Ниже — честное описание того, какие данные хранит сервис и что с ними происходит. Если что-то осталось непонятным, напишите в трекер проекта.",
    },
    { kind: "h2", text: "1. Какие данные хранятся" },
    {
      kind: "ul",
      items: [
        "Аккаунт: адрес электронной почты, отображаемое имя, идентификатор Google-аккаунта (subject), язык интерфейса, аватар, баннер, дата регистрации и признак публичного профиля. Пароля у сервиса нет: вход выполняет Google.",
        "Записи: тип, название, подзаголовок, год, статус, оценка, заметка, ссылка на источник, теги, даты создания и изменения, снимок метаданных фильма из TMDB.",
        "Файлы: загруженные обложки, аватары и баннеры, а также их уменьшенные версии; сведения о размере и типе файла.",
        "Технические данные: хеши токенов сессий, даты входа и последней активности, IP-адрес и user-agent браузера, срок действия сессии, счётчики попыток входа и запросов. Служебных писем сервис сейчас не отправляет.",
      ],
    },
    { kind: "h2", text: "2. Публичный профиль" },
    {
      kind: "p",
      text:
        "Публичный профиль включается только вручную в настройках и по умолчанию выключен. Когда он включён, по ссылке /u/… видны имя, аватар, баннер и только завершённые записи: тип, название, год, оценка, теги, обложка и заметка автора к этой записи. Черновики, планы и записи в других статусах не показываются.",
    },
    {
      kind: "p",
      text:
        "Публичные профили попадают в sitemap.xml и могут быть проиндексированы поисковыми системами. Выключите публичный профиль в настройках — страница сразу начнёт отвечать «не найдено», а ссылка перестанет работать.",
    },
    { kind: "h2", text: "3. Зачем это нужно" },
    {
      kind: "ul",
      items: [
        "чтобы сервис работал: вход, хранение записей, показ обложек;",
        "чтобы защищать аккаунты: счётчики попыток входа и запросов, срок жизни сессий;",
        "чтобы показывать данные о фильмах: сервис запрашивает TMDB по идентификатору фильма, но не передаёт туда данные аккаунта.",
      ],
    },
    {
      kind: "p",
      text:
        "Данные не используются для рекламы, не продаются и не передаются третьим лицам, кроме хостинг-провайдера, Google (вход) и TMDB (метаданные фильмов), как описано выше.",
    },
    { kind: "h2", text: "4. Где и как хранится" },
    {
      kind: "p",
      text:
        "Данные лежат на сервере у хостинг-провайдера: записи — в PostgreSQL, файлы — на диске сервера. Соединение с сайтом шифруется (HTTPS, сертификат Let's Encrypt). Аналитики, рекламных трекеров и сторонних CDN нет.",
    },
    {
      kind: "p",
      text:
        "Для выпуска сертификата Let's Encrypt получает доменное имя сайта — это стандартная работа протокола ACME, персональные данные в ней не участвуют.",
    },
    { kind: "h2", text: "5. Сколько хранится" },
    {
      kind: "ul",
      items: [
        "сессии — до 30 дней, затем перестают действовать;",
        "счётчики попыток и запросов — в пределах окна и блокировки (до часа);",
        "записи и файлы — пока вы их не удалите или не удалите аккаунт;",
        "резервных копий базы сейчас не делается;",
      ],
    },
    { kind: "h2", text: "6. Удаление аккаунта" },
    {
      kind: "p",
      text:
        "Удаление доступно в настройках. Пароль не запрашивается: подтверждение вводится словом «удалить». Что происходит:",
    },
    {
      kind: "ul",
      items: [
        "все сессии и устройства завершаются;",
        "адрес электронной почты заменяется анонимным, имя — на «Deleted user», публичный профиль выключается;",
        "записи и загруженные файлы обезличиваются, но остаются в базе: сейчас они не связаны с вами;",
        "восстановить аккаунт после удаления нельзя.",
      ],
    },
    { kind: "h2", text: "7. Ваши права" },
    {
      kind: "ul",
      items: [
        "Доступ и перенос: в настройках есть экспорт всех записей в JSON и CSV.",
        "Исправление: имя, язык, аватар, баннер и записи меняются в интерфейсе.",
        "Удаление: отдельные записи, файлы и аккаунт удаляются в настройках.",
        "Вопросы: трекер проекта.",
      ],
    },
    { kind: "h2", text: "8. Cookies и локальное хранилище" },
    {
      kind: "p",
      text:
        "Используются две cookie: jey_session — случайный токен сессии, доступен только серверу (HttpOnly) и удаляется при выходе; jey_lang — выбранный язык интерфейса. Тема оформления хранится в localStorage браузера. Рекламных и аналитических cookie нет.",
    },
    { kind: "h2", text: "9. Изменения" },
    {
      kind: "p",
      text:
        "Политика может меняться вместе с сервисом. Дата последнего изменения указана в начале страницы; существенные изменения стоит перечитать.",
    },
    {
      kind: "note",
      text:
        "Ещё раз о главном: публичный профиль по умолчанию выключен; когда он включён, видны завершённые записи вместе с заметками; экспорт доступен в настройках, а удаление аккаунта обезличивает данные. Условия использования — по ссылке ниже.",
    },
  ],
};

const PRIVACY_UK: LegalPage = {
  title: "Політика конфіденційності",
  updated: "Оновлено 3 листопада 2026 року",
  description:
    "Які дані зберігає jey, навіщо вони потрібні, кому передаються, скільки зберігаються та як видалити акаунт.",
  contact: "Трекер проєкту",
  related: "Умови використання",
  relatedHref: "/terms",
  blocks: [
    {
      kind: "p",
      text:
        "jey.net — особистий некомерційний портал для обліку фільмів, книг і картинок. Нижче — чесний опис того, які дані зберігає сервіс і що з ними відбувається. Якщо щось залишилося незрозумілим, напишіть у трекер проєкту.",
    },
    { kind: "h2", text: "1. Які дані зберігаються" },
    {
      kind: "ul",
      items: [
        "Акаунт: адреса електронної пошти, відображуване ім'я, ідентифікатор Google-акаунта (subject), мова інтерфейсу, аватар, банер, дата реєстрації та ознака публічного профілю. Пароля сервіс не має: вхід виконує Google.",
        "Записи: тип, назва, підзаголовок, рік, статус, оцінка, нотатка, посилання на джерело, теги, дати створення й зміни, знімок метаданих фільму з TMDB.",
        "Файли: завантажені обкладинки, аватари й банери, а також їхні зменшені версії; відомості про розмір і тип файлу.",
        "Технічні дані: хеші токенів сесій, дати входу й останньої активності, IP-адреса та user-agent браузера, термін дії сесії, лічильники спроб входу й запитів. Службових листів сервіс зараз не надсилає.",
      ],
    },
    { kind: "h2", text: "2. Публічний профіль" },
    {
      kind: "p",
      text:
        "Публічний профіль вмикається лише вручну в налаштуваннях і за замовчуванням вимкнений. Коли він увімкнений, за посиланням /u/… видно ім'я, аватар, банер і лише завершені записи: тип, назву, рік, оцінку, теги, обкладинку й нотатку автора до цього запису. Чернетки, плани та записи в інших статусах не показуються.",
    },
    {
      kind: "p",
      text:
        "Публічні профілі потрапляють у sitemap.xml і можуть бути проіндексовані пошуковими системами. Вимкніть публічний профіль у налаштуваннях — сторінка одразу почне відповідати «не знайдено», а посилання перестане працювати.",
    },
    { kind: "h2", text: "3. Навіщо це потрібно" },
    {
      kind: "ul",
      items: [
        "щоб сервіс працював: вхід, зберігання записів, показ обкладинок;",
        "щоб захищати акаунти: лічильники спроб входу й запитів, термін життя сесій;",
        "щоб показувати дані про фільми: сервіс запитує TMDB за ідентифікатором фільму, але не передає туди дані акаунта.",
      ],
    },
    {
      kind: "p",
      text:
        "Дані не використовуються для реклами, не продаються й не передаються третім особам, крім хостинг-провайдера, Google (вхід) і TMDB (метадані фільмів), як описано вище.",
    },
    { kind: "h2", text: "4. Де і як зберігається" },
    {
      kind: "p",
      text:
        "Дані лежать на сервері в хостинг-провайдера: записи — у PostgreSQL, файли — на диску сервера. З'єднання із сайтом шифрується (HTTPS, сертифікат Let's Encrypt). Аналітики, рекламних трекерів і сторонніх CDN немає.",
    },
    {
      kind: "p",
      text:
        "Для випуску сертифіката Let's Encrypt отримує доменне ім'я сайту — це стандартна робота протоколу ACME, персональні дані в ній не беруть участі.",
    },
    { kind: "h2", text: "5. Скільки зберігається" },
    {
      kind: "ul",
      items: [
        "сесії — до 30 днів, потім перестають діяти;",
        "лічильники спроб і запитів — у межах вікна й блокування (до години);",
        "записи й файли — доки ви їх не видалите або не видалите акаунт;",
        "резервних копій бази зараз не робиться.",
      ],
    },
    { kind: "h2", text: "6. Видалення акаунта" },
    {
      kind: "p",
      text:
        "Видалення доступне в налаштуваннях. Пароль не запитується: підтвердження вводиться словом «видалити». Що відбувається:",
    },
    {
      kind: "ul",
      items: [
        "усі сесії та пристрої завершуються;",
        "адреса електронної пошти замінюється анонімною, ім'я — на «Deleted user», публічний профіль вимикається;",
        "записи й завантажені файли знеособлюються, але залишаються в базі: зараз вони не пов'язані з вами;",
        "відновити акаунт після видалення неможливо.",
      ],
    },
    { kind: "h2", text: "7. Ваші права" },
    {
      kind: "ul",
      items: [
        "Доступ і перенесення: у налаштуваннях є експорт усіх записів у JSON і CSV.",
        "Виправлення: ім'я, мова, аватар, банер і записи змінюються в інтерфейсі.",
        "Видалення: окремі записи, файли й акаунт видаляються в налаштуваннях.",
        "Питання: трекер проєкту.",
      ],
    },
    { kind: "h2", text: "8. Cookies і локальне сховище" },
    {
      kind: "p",
      text:
        "Використовуються дві cookie: jey_session — випадковий токен сесії, доступний лише серверу (HttpOnly) і видаляється під час виходу; jey_lang — вибрана мова інтерфейсу. Тема оформлення зберігається в localStorage браузера. Рекламних і аналітичних cookie немає.",
    },
    { kind: "h2", text: "9. Зміни" },
    {
      kind: "p",
      text:
        "Політика може змінюватися разом із сервісом. Дата останньої зміни вказана на початку сторінки; суттєві зміни варто перечитати.",
    },
    {
      kind: "note",
      text:
        "Ще раз про головне: публічний профіль за замовчуванням вимкнений; коли він увімкнений, видно завершені записи разом із нотатками; експорт доступний у налаштуваннях, а видалення акаунта знеособлює дані. Умови використання — за посиланням нижче.",
    },
  ],
};

const PRIVACY_EN: LegalPage = {
  title: "Privacy policy",
  updated: "Updated on November 3, 2026",
  description:
    "What data jey stores, why it is needed, who receives it, how long it is kept and how to delete the account.",
  contact: "Project tracker",
  related: "Terms of use",
  relatedHref: "/terms",
  blocks: [
    {
      kind: "p",
      text:
        "jey.net is a personal non-commercial portal for tracking films, books and images. Below is an honest description of what the service stores and what happens to it. If something is still unclear, write to the project tracker.",
    },
    { kind: "h2", text: "1. What data is stored" },
    {
      kind: "ul",
      items: [
        "Account: email address, display name, Google account identifier (subject), interface language, avatar, banner, registration date and the public-profile flag. The service has no password: Google performs the sign-in.",
        "Records: type, title, subtitle, year, status, rating, note, source link, tags, creation and update dates, and a TMDB film metadata snapshot.",
        "Files: uploaded covers, avatars and banners, plus their smaller renditions; file size and type information.",
        "Technical data: session token hashes, sign-in and last-activity dates, IP address and browser user-agent, session expiry, sign-in and request rate-limit counters. The service does not send any service emails right now.",
      ],
    },
    { kind: "h2", text: "2. Public profile" },
    {
      kind: "p",
      text:
        "The public profile is enabled manually in settings and is off by default. When it is on, the /u/… link shows the name, avatar, banner and finished records only: type, title, year, rating, tags, cover and the author's note for that record. Drafts, plans and records in other statuses are not shown.",
    },
    {
      kind: "p",
      text:
        "Public profiles are listed in sitemap.xml and may be indexed by search engines. Turn the public profile off in settings — the page immediately starts answering “not found” and the link stops working.",
    },
    { kind: "h2", text: "3. Why it is needed" },
    {
      kind: "ul",
      items: [
        "to run the service: sign-in, record storage, cover rendering;",
        "to protect accounts: sign-in and request rate-limit counters, session lifetime;",
        "to show film data: the service queries TMDB by film id but does not send account data there.",
      ],
    },
    {
      kind: "p",
      text:
        "The data is not used for advertising, is not sold and is not shared with third parties other than the hosting provider, Google (sign-in) and TMDB (film metadata), as described above.",
    },
    { kind: "h2", text: "4. Where and how it is stored" },
    {
      kind: "p",
      text:
        "The data lives on a hosting provider's server: records in PostgreSQL, files on the server disk. The connection is encrypted (HTTPS, Let's Encrypt certificate). There is no analytics, ad tracking or third-party CDN.",
    },
    {
      kind: "p",
      text:
        "To issue the certificate, Let's Encrypt receives the site's domain name — standard ACME protocol work that does not involve personal data.",
    },
    { kind: "h2", text: "5. How long it is kept" },
    {
      kind: "ul",
      items: [
        "sessions — up to 30 days, then they stop working;",
        "rate-limit counters — within the window and block (up to an hour);",
        "records and files — until you delete them or the account;",
        "the database is not backed up at the moment.",
      ],
    },
    { kind: "h2", text: "6. Account deletion" },
    {
      kind: "p",
      text:
        "Deletion is available in settings. No password is requested: confirmation is typed as the word “delete”. What happens:",
    },
    {
      kind: "ul",
      items: [
        "all sessions and devices are revoked;",
        "the email is replaced with an anonymous one, the name becomes “Deleted user”, the public profile is turned off;",
        "records and uploaded files are anonymized but remain in the database: they are no longer linked to you;",
        "an account cannot be restored after deletion.",
      ],
    },
    { kind: "h2", text: "7. Your rights" },
    {
      kind: "ul",
      items: [
        "Access and portability: settings offer an export of all records to JSON and CSV.",
        "Correction: name, language, avatar, banner and records are edited in the interface.",
        "Deletion: individual records, files and the account are deleted in settings.",
        "Questions: project tracker.",
      ],
    },
    { kind: "h2", text: "8. Cookies and local storage" },
    {
      kind: "p",
      text:
        "Two cookies are used: jey_session — a random session token, HttpOnly and removed on sign-out; jey_lang — the chosen interface language. The theme is stored in the browser's localStorage. There are no advertising or analytics cookies.",
    },
    { kind: "h2", text: "9. Changes" },
    {
      kind: "p",
      text:
        "This policy may change together with the service. The last-update date is shown at the top of the page; significant changes are worth re-reading.",
    },
    {
      kind: "note",
      text:
        "The short version: the public profile is off by default; when it is on, finished records with their notes are visible; export is available in settings, and deleting the account anonymizes the data. Terms of use are linked below.",
    },
  ],
};

const TERMS_RU: LegalPage = {
  title: "Условия использования",
  updated: "Обновлено 3 ноября 2026 года",
  description:
    "Правила использования jey: аккаунт, ваш контент, публичный профиль, доступность сервиса и ограничение ответственности.",
  contact: "Трекер проекта",
  related: "Политика конфиденциальности",
  relatedHref: "/privacy",
  blocks: [
    {
      kind: "p",
      text:
        "jey.net — личный некоммерческий проект. Пользуясь сайтом, вы соглашаетесь с этими условиями. Если не согласны — просто не пользуйтесь сервисом.",
    },
    { kind: "h2", text: "1. Что это за сервис" },
    {
      kind: "p",
      text:
        "Портал для учёта того, что вы посмотрели, прочитали и сохранили. Сервис предоставляется «как есть»: без гарантий бесперебойной работы, без SLA и без обещаний сохранности данных сверх обычной работы приложения. Резервных копий базы сейчас не делается.",
    },
    { kind: "h2", text: "2. Аккаунт" },
    {
      kind: "ul",
      items: [
        "вход выполняется через аккаунт Google: Google передаёт нам адрес почты, имя и идентификатор аккаунта;",
        "пароль сервис не хранит и не запрашивает — доступом к аккаунту управляет Google;",
        "сервис рассчитан на людей от 14 лет; если вы младше, пользуйтесь им с согласия родителя или опекуна;",
        "один человек может создать несколько аккаунтов, но злоупотребление этим (обход лимитов, спам) считается нарушением.",
      ],
    },
    { kind: "h2", text: "3. Ваш контент" },
    {
      kind: "p",
      text:
        "Права на записи, заметки и загруженные изображения остаются у вас. Вы разрешаете сервису хранить их, показывать в вашем аккаунте и создавать уменьшенные копии — только чтобы приложение работало.",
    },
    { kind: "p", text: "Запрещено загружать и публиковать:" },
    {
      kind: "ul",
      items: [
        "материалы, нарушающие закон;",
        "чужие персональные данные без согласия человека;",
        "вредоносные файлы, спам, рекламу и попытки взломать сервис;",
        "контент, на который у вас нет прав.",
      ],
    },
    {
      kind: "p",
      text:
        "Такие материалы могут быть удалены, а аккаунт — заблокирован, особенно если он мешает работе сервиса или других людей.",
    },
    { kind: "h2", text: "4. Публичный профиль" },
    {
      kind: "p",
      text:
        "Публичный профиль включается вручную и по умолчанию выключен. Включая его, вы понимаете, что имя, аватар и завершённые записи вместе с заметками к ним увидит любой человек со ссылкой, а поисковые системы смогут их проиндексировать. Черновики и планы не публикуются. Выключить профиль можно в любой момент в настройках.",
    },
    { kind: "h2", text: "5. Доступность и изменения" },
    {
      kind: "p",
      text:
        "Сервис может быть недоступен из-за обновлений, сбоев у провайдера или ошибок в коде. Функции могут меняться, добавляться и удаляться. О существенных изменениях этих условий будет сказано на этой странице с новой датой.",
    },
    { kind: "h2", text: "6. Ограничение ответственности" },
    {
      kind: "p",
      text:
        "В пределах, разрешённых законом, владелец проекта не отвечает за косвенные убытки, упущенные данные или невозможность воспользоваться сервисом. Это личный проект, а не коммерческий продукт с поддержкой 24/7.",
    },
    { kind: "h2", text: "7. Прекращение использования" },
    {
      kind: "p",
      text:
        "Вы можете удалить аккаунт в настройках в любой момент: сессии и устройства завершатся, профиль обезличится. Записи и файлы при этом обезличиваются, но пока остаются в базе — подробности описаны в политике конфиденциальности.",
    },
    { kind: "h2", text: "8. Применимое право" },
    {
      kind: "p",
      text:
        "К отношениям применяется законодательство Украины, если иное не следует из обязательных норм вашей страны проживания.",
    },
    { kind: "h2", text: "9. Контакты" },
    {
      kind: "p",
      text:
        "Вопросы, сообщения об ошибках и жалобы на контент — в трекере проекта.",
    },
    {
      kind: "note",
      text:
        "Коротко: пользуйтесь с умом, не загружайте чужие данные и незаконный контент, помните, что публичный профиль действительно публичный, а сервис — личный проект без гарантий. Политика конфиденциальности — по ссылке ниже.",
    },
  ],
};

const TERMS_UK: LegalPage = {
  title: "Умови використання",
  updated: "Оновлено 3 листопада 2026 року",
  description:
    "Правила використання jey: акаунт, ваш контент, публічний профіль, доступність сервісу й обмеження відповідальності.",
  contact: "Трекер проєкту",
  related: "Політика конфіденційності",
  relatedHref: "/privacy",
  blocks: [
    {
      kind: "p",
      text:
        "jey.net — особистий некомерційний проєкт. Користуючись сайтом, ви погоджуєтеся з цими умовами. Якщо не згодні — просто не користуйтеся сервісом.",
    },
    { kind: "h2", text: "1. Що це за сервіс" },
    {
      kind: "p",
      text:
        "Портал для обліку того, що ви подивилися, прочитали й зберегли. Сервіс надається «як є»: без гарантій безперебійної роботи, без SLA і без обіцянок збереження даних понад звичайну роботу застосунку. Резервних копій бази зараз не робиться.",
    },
    { kind: "h2", text: "2. Акаунт" },
    {
      kind: "ul",
      items: [
        "вхід виконується через акаунт Google: Google передає нам адресу пошти, ім'я та ідентифікатор акаунта;",
        "пароль сервіс не зберігає й не запитує — доступом до акаунта керує Google;",
        "сервіс розрахований на людей від 14 років; якщо ви молодші, користуйтеся ним із згоди батьків або опікуна;",
        "одна людина може створити кілька акаунтів, але зловживання цим (обхід лімітів, спам) вважається порушенням.",
      ],
    },
    { kind: "h2", text: "3. Ваш контент" },
    {
      kind: "p",
      text:
        "Права на записи, нотатки й завантажені зображення залишаються у вас. Ви дозволяєте сервісу зберігати їх, показувати у вашому акаунті та створювати зменшені копії — лише щоб застосунок працював.",
    },
    { kind: "p", text: "Заборонено завантажувати й публікувати:" },
    {
      kind: "ul",
      items: [
        "матеріали, що порушують закон;",
        "чужі персональні дані без згоди людини;",
        "шкідливі файли, спам, рекламу й спроби зламати сервіс;",
        "контент, на який у вас немає прав.",
      ],
    },
    {
      kind: "p",
      text:
        "Такі матеріали можуть бути видалені, а акаунт — заблокований, особливо якщо він заважає роботі сервісу чи інших людей.",
    },
    { kind: "h2", text: "4. Публічний профіль" },
    {
      kind: "p",
      text:
        "Публічний профіль вмикається вручну й за замовчуванням вимкнений. Вмикаючи його, ви розумієте, що ім'я, аватар і завершені записи разом із нотатками до них побачить будь-хто з посиланням, а пошукові системи зможуть їх проіндексувати. Чернетки й плани не публікуються. Вимкнути профіль можна будь-коли в налаштуваннях.",
    },
    { kind: "h2", text: "5. Доступність і зміни" },
    {
      kind: "p",
      text:
        "Сервіс може бути недоступним через оновлення, збої в провайдера або помилки в коді. Функції можуть змінюватися, додаватися й видалятися. Про суттєві зміни цих умов буде сказано на цій сторінці з новою датою.",
    },
    { kind: "h2", text: "6. Обмеження відповідальності" },
    {
      kind: "p",
      text:
        "У межах, дозволених законом, власник проєкту не відповідає за непрямі збитки, втрачені дані або неможливість скористатися сервісом. Це особистий проєкт, а не комерційний продукт із підтримкою 24/7.",
    },
    { kind: "h2", text: "7. Припинення використання" },
    {
      kind: "p",
      text:
        "Ви можете видалити акаунт у налаштуваннях будь-коли: сесії та пристрої завершаться, профіль знеособиться. Записи й файли при цьому знеособлюються, але поки залишаються в базі — подробиці в політиці конфіденційності.",
    },
    { kind: "h2", text: "8. Застосовне право" },
    {
      kind: "p",
      text:
        "До відносин застосовується законодавство України, якщо інше не випливає з обов'язкових норм вашої країни проживання.",
    },
    { kind: "h2", text: "9. Контакти" },
    {
      kind: "p",
      text: "Питання, повідомлення про помилки й скарги на контент — у трекері проєкту.",
    },
    {
      kind: "note",
      text:
        "Коротко: користуйтеся з розумом, не завантажуйте чужі дані та незаконний контент, пам'ятайте, що публічний профіль справді публічний, а сервіс — особистий проєкт без гарантій. Політика конфіденційності — за посиланням нижче.",
    },
  ],
};

const TERMS_EN: LegalPage = {
  title: "Terms of use",
  updated: "Updated on November 3, 2026",
  description:
    "Rules for using jey: the account, your content, the public profile, service availability and limitation of liability.",
  contact: "Project tracker",
  related: "Privacy policy",
  relatedHref: "/privacy",
  blocks: [
    {
      kind: "p",
      text:
        "jey.net is a personal non-commercial project. By using the site you agree to these terms. If you do not agree, simply do not use the service.",
    },
    { kind: "h2", text: "1. What the service is" },
    {
      kind: "p",
      text:
        "A portal for tracking what you watched, read and saved. The service is provided “as is”: no uptime guarantee, no SLA and no promise of data preservation beyond the normal operation of the application. The database is not backed up at the moment.",
    },
    { kind: "h2", text: "2. Account" },
    {
      kind: "ul",
      items: [
        "sign-in is performed through a Google account: Google gives us the email address, name and account identifier;",
        "the service neither stores nor asks for a password — Google controls access to the account;",
        "the service is intended for people aged 14 and over; if you are younger, use it with a parent's or guardian's consent;",
        "one person may create several accounts, but abusing this (bypassing limits, spam) is a violation.",
      ],
    },
    { kind: "h2", text: "3. Your content" },
    {
      kind: "p",
      text:
        "Rights to records, notes and uploaded images remain yours. You allow the service to store them, show them in your account and create smaller renditions — only so the application works.",
    },
    { kind: "p", text: "It is forbidden to upload or publish:" },
    {
      kind: "ul",
      items: [
        "material that violates the law;",
        "other people's personal data without their consent;",
        "malicious files, spam, advertising and attempts to break the service;",
        "content you do not have rights to.",
      ],
    },
    {
      kind: "p",
      text:
        "Such material may be removed and the account blocked, especially if it interferes with the service or other people.",
    },
    { kind: "h2", text: "4. Public profile" },
    {
      kind: "p",
      text:
        "The public profile is enabled manually and is off by default. By enabling it you understand that the name, avatar and finished records together with their notes will be visible to anyone with the link, and search engines may index them. Drafts and plans are not published. The profile can be turned off at any time in settings.",
    },
    { kind: "h2", text: "5. Availability and changes" },
    {
      kind: "p",
      text:
        "The service may be unavailable due to updates, provider outages or code errors. Features may change, appear or disappear. Significant changes to these terms will be announced on this page with a new date.",
    },
    { kind: "h2", text: "6. Limitation of liability" },
    {
      kind: "p",
      text:
        "To the extent permitted by law, the project owner is not liable for indirect losses, lost data or the inability to use the service. This is a personal project, not a commercial product with 24/7 support.",
    },
    { kind: "h2", text: "7. Termination" },
    {
      kind: "p",
      text:
        "You can delete the account in settings at any time: sessions and devices are revoked and the profile is anonymized. Records and files are anonymized but remain in the database for now — details are in the privacy policy.",
    },
    { kind: "h2", text: "8. Governing law" },
    {
      kind: "p",
      text:
        "The laws of Ukraine apply, unless mandatory rules of your country of residence provide otherwise.",
    },
    { kind: "h2", text: "9. Contacts" },
    {
      kind: "p",
      text: "Questions, bug reports and content complaints — in the project tracker.",
    },
    {
      kind: "note",
      text:
        "The short version: use it wisely, do not upload other people's data or illegal content, remember that the public profile really is public, and the service is a personal project without guarantees. The privacy policy is linked below.",
    },
  ],
};

export const LEGAL: Record<"privacy" | "terms", Record<Locale, LegalPage>> = {
  privacy: { ru: PRIVACY_RU, uk: PRIVACY_UK, en: PRIVACY_EN },
  terms: { ru: TERMS_RU, uk: TERMS_UK, en: TERMS_EN },
};
