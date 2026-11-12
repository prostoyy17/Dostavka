#!/usr/bin/env bash
# Новая версия сайта для сброса кэша браузера.
# Меняет номер сборки во всех местах сразу: index.html (?v=… и APP_BUILD) и js/app.js (BUILD).
# Запуск из корня репозитория:  tools/bump-version.sh
set -euo pipefail
cd "$(dirname "$0")/.."

old=$(grep -o 'APP_BUILD="[0-9]*"' index.html | grep -o '[0-9]\+')
new=$(date +%s)
sed -i "s/$old/$new/g" index.html
sed -i "s/const BUILD = '$old'/const BUILD = '$new'/" js/app.js

grep -q "APP_BUILD=\"$new\"" index.html && grep -q "const BUILD = '$new'" js/app.js \
  || { echo "Ошибка: версия обновилась не везде" >&2; exit 1; }
echo "Версия: $old -> $new"
