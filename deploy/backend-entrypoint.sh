#!/bin/sh
# Старт бэкенда в продакшне: миграции, справочники, статика — и gunicorn.
# Все шаги идемпотентны: повторный запуск ничего не ломает.
set -e

python manage.py migrate --noinput
python manage.py seed_catalog
python manage.py collectstatic --noinput --verbosity 0

exec gunicorn config.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers "${GUNICORN_WORKERS:-3}" \
    --timeout 60 \
    --access-logfile - \
    --forwarded-allow-ips "*"
