#!/usr/bin/env bash
# Полная установка EnglishRoute за один запуск: Apps Script + Таблица + деплой сайта.
# Запуск на своём компьютере из папки englishroute-landing:  bash tools/setup.sh
# Нужен Node.js 18+. От вас: подтверждать входы в Google/Firebase в браузере.
set -euo pipefail
cd "$(dirname "$0")/.."

CLASP="npx -y @google/clasp@2.4.2"
FIREBASE="npx -y firebase-tools@13"
PROJECT="${FIREBASE_PROJECT:-englishroute}"
SITE="englishroute-start"

pause() { read -r -p "$1 Нажмите Enter, когда готово… " _; }

echo "== 1/6 Вход в Google для Apps Script =="
echo "Включите Apps Script API (один раз): https://script.google.com/home/usersettings"
pause "Переключатель «Google Apps Script API» должен быть ВКЛ."
$CLASP login

echo "== 2/6 Создаю Google Таблицу «EnglishRoute — заявки» со скриптом =="
if [ ! -f apps-script/.clasp.json ]; then
  # создаём во временной папке, чтобы clasp не перезаписал наши Code.gs и appsscript.json
  TMP=$(mktemp -d)
  (cd "$TMP" && $CLASP create --type sheets --title "EnglishRoute — заявки")
  node -e '
    const fs = require("fs"); const c = JSON.parse(fs.readFileSync(process.argv[1] + "/.clasp.json", "utf8"));
    delete c.rootDir; fs.writeFileSync("apps-script/.clasp.json", JSON.stringify(c, null, 2));
  ' "$TMP"
  rm -rf "$TMP"
fi
(cd apps-script && $CLASP push -f)

echo "== 3/6 Разрешения для скрипта =="
echo "Сейчас откроется редактор Apps Script. Выберите функцию testLead → «Выполнить» → разрешите доступ."
echo "В Таблице появится лист «Заявки» с тестовой строкой, на почту придёт письмо."
(cd apps-script && $CLASP open) || true
pause "Запустили testLead и выдали разрешения?"

echo "== 4/6 Разворачиваю веб-приложение =="
DEPLOY_OUT=$(cd apps-script && $CLASP deploy --description "landing")
echo "$DEPLOY_OUT"
DEPLOY_ID=$(echo "$DEPLOY_OUT" | grep -oE 'AKfy[A-Za-z0-9_-]+' | head -1)
[ -n "$DEPLOY_ID" ] || { echo "Не нашёл ID развёртывания в выводе clasp"; exit 1; }
URL="https://script.google.com/macros/s/${DEPLOY_ID}/exec"
echo "URL веб-приложения: $URL"
curl -sL "$URL" && echo

echo "== 5/6 Вставляю URL в public/main.js =="
node -e '
  const fs = require("fs"), f = "public/main.js", url = process.argv[1];
  const s = fs.readFileSync(f, "utf8").replace(/const APPS_SCRIPT_URL = .*;/, "const APPS_SCRIPT_URL = \x27" + url + "\x27;");
  fs.writeFileSync(f, s);
' "$URL"
grep -n "const APPS_SCRIPT_URL" public/main.js

echo "== 6/6 Деплой на Firebase: только сайт $SITE =="
$FIREBASE login
$FIREBASE projects:list
read -r -p "ID проекта, где живёт englishroute.web.app [$PROJECT]: " ans
PROJECT="${ans:-$PROJECT}"
if ! $FIREBASE hosting:sites:list --project "$PROJECT" | grep -q "$SITE"; then
  $FIREBASE hosting:sites:create "$SITE" --project "$PROJECT"
fi
$FIREBASE target:clear hosting start --project "$PROJECT" >/dev/null 2>&1 || true
$FIREBASE target:apply hosting start "$SITE" --project "$PROJECT"
$FIREBASE deploy --only hosting:start --project "$PROJECT"

echo
echo "Готово: https://$SITE.web.app"
echo "Не забудьте закоммитить изменённый public/main.js (там теперь URL Apps Script)."
