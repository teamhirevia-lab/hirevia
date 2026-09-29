#!/usr/bin/env bash
# Update the app on Ubuntu without deleting Postgres or Redis data.
# Refuses volume-removal flags. Never runs "docker compose down -v".
set -euo pipefail

if [[ "${*:-}" == *"-v"* || "${*:-}" == *"down"* || "${*:-}" == *"volume"* ]]; then
    echo "This update does not delete database volumes."
    exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/deploy/vps.env"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$ROOT/deploy/docker-compose.vps.yml")

if [[ ! -f "$ENV_FILE" ]]; then
    echo "deploy/vps.env is missing. Run deploy/deploy.sh first."
    exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${WEB_ROOT:?WEB_ROOT is required}"
: "${DOMAIN:?DOMAIN is required}"

if ! command -v envsubst >/dev/null; then
    echo "Install gettext-base so envsubst is available."
    exit 1
fi

cd "$ROOT"
git pull --ff-only

echo "Applying container config. Named volumes hirevia_postgres and hirevia_redis are left in place."
"${COMPOSE[@]}" up -d

cd "$ROOT/Backend"
npm ci --omit=dev
npm run migrate

cd "$ROOT/Frontend"
npm ci
VITE_API_URL= npm run build

sudo rsync -a --delete "$ROOT/Frontend/dist/" "$WEB_ROOT/"

envsubst '${DOMAIN} ${WEB_ROOT}' < "$ROOT/deploy/apache-hirevia.conf" | sudo tee /etc/apache2/sites-available/hirevia.conf >/dev/null
sudo apache2ctl configtest
sudo systemctl reload apache2

pm2 reload hirevia-api --update-env

echo "Update finished. Database volumes were not removed."
