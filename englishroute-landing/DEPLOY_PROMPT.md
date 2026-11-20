Задача: максимально быстро задеплоить лендинг EnglishRoute и подключить приём заявок. Работай сам, через терминал и мой Chrome (Claude in Chrome). Я только подтверждаю входы и разрешения. Вопросы задавай, только если без меня никак.

## Где код
- Репозиторий: https://github.com/Shtormxxxx/English-landing, ветка `claude/magical-mccarthy-exq42y` (PR #1 в `main`).
- Склонируй репозиторий, переключись на эту ветку и перейди в папку `englishroute-landing/`. Там лежат `README.md` (подробности) и `tools/setup.sh` (весь процесс одним скриптом).
- Сайт находится в `public/`, скрипт приёма заявок — в `apps-script/Code.gs`, конфиги — `firebase.json` и `.firebaserc` (target `start` → site `englishroute-start`).

## Порядок (сначала сайт, потом заявки)

### Шаг 1. Деплой сайта на Firebase (приоритет)
1. Выполни `npx -y firebase-tools@13 login`. Вход подтверждаю я в браузере.
2. Выполни `npx -y firebase-tools@13 projects:list` и найди проект, где живёт сайт englishroute.web.app. В `.firebaserc` записан ID `englishroute`. Если в списке другой ID, поправь его в `.firebaserc`.
3. Если сайта `englishroute-start` нет в `hosting:sites:list`, создай его: `hosting:sites:create englishroute-start`.
4. Выполни `target:apply hosting start englishroute-start`.
5. Выполни `deploy --only hosting:start`.
6. Открой https://englishroute-start.web.app в Chrome, сделай скриншоты на телефонной ширине и на десктопе и покажи мне.

ВАЖНО: деплой делай ТОЛЬКО с `--only hosting:start`. Сайт englishroute.web.app не трогай, ничего в нём не перезаписывай.

Форма работает и без Apps Script: она предлагает отправить заявку в WhatsApp. Поэтому сайт можно выкладывать сразу.

### Шаг 2. Приём заявок (Google Таблица + Apps Script)
Вариант А (быстрее): запусти `bash tools/setup.sh`. Скрипт:
- проводит вход через clasp;
- создаёт Таблицу «EnglishRoute — заявки» со скриптом и загружает в неё `Code.gs`;
- просит один раз запустить `testLead` в редакторе, чтобы выдать разрешения;
- разворачивает веб-приложение («от моего имени», доступ «Все»);
- вставляет URL в `public/main.js`;
- деплоит сайт.

Перед запуском включи Apps Script API: https://script.google.com/home/usersettings. Это можно сделать в Chrome.

Вариант Б (если clasp не идёт): сделай то же самое руками в Chrome по `README.md`, раздел 1:
1. Открой sheets.new и задай название.
2. Расширения → Apps Script → вставь `Code.gs`.
3. Запусти `testLead` и выдай разрешения.
4. Развернуть → Новое развёртывание → Веб-приложение, «Выполнять от моего имени», доступ «Все».
5. Скопируй URL и вставь его в `const APPS_SCRIPT_URL` в `public/main.js`.
6. Снова выполни `deploy --only hosting:start`.

### Шаг 3. Проверка
1. Отправь с сайта тестовую заявку с номером +7 707 000 00 00.
2. Убедись, что в Таблице появилась строка со статусом «новая» и пришло письмо.
3. Удали тестовую строку из Таблицы.
4. Покажи мне результат.

### Шаг 4. Git
1. Закоммить изменённый `public/main.js` (в нём теперь URL Apps Script) в ветку `claude/magical-mccarthy-exq42y` и запушь.
2. Спроси меня, сливать ли PR #1 в `main`.

## Правила
- Тексты на сайте не меняй. Отзывы, цифры и обещания не выдумывай.
- Номер WhatsApp во всех ссылках: 77072714655.
- В конце дай мне:
  - ссылку на сайт;
  - ссылку на Таблицу;
  - URL Apps Script;
  - список того, что осталось сделать мне: положить скриншоты отзывов в `public/assets/reviews/` и передеплоить; поставить в шапку Instagram ссылку `https://englishroute-start.web.app/?utm_source=instagram&utm_medium=bio`.
