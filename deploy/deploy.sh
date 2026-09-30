#!/usr/bin/env bash
# First-time install on Ubuntu.
# Postgres and Redis stay in Docker. The API runs under PM2. Apache serves the site.
# This script creates Docker volumes. It does not delete them.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/deploy/vps.env"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$ROOT/deploy/docker-compose.vps.yml")

if [[ ! -f "$ENV_FILE" ]]; then
    echo "Copy deploy/vps.env.example to deploy/vps.env and fill in the passwords and domain."
    exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${DOMAIN:?DOMAIN is required}"
: "${WEB_ROOT:?WEB_ROOT is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${REDIS_PASSWORD:?REDIS_PASSWORD is required}"
: "${API_PORT:=3001}"

if [[ ! -f "$ROOT/Backend/.env" ]]; then
    echo "Create Backend/.env before deploying."
    echo "NODE_ENV=production"
    echo "DATABASE_URL=postgres://${POSTGRES_USER}:<password>@127.0.0.1:5432/${POSTGRES_DB}"
    echo "REDIS_URL=redis://:<redis-password>@127.0.0.1:6379"
    echo "CLIENT_ORIGINS=https://${DOMAIN}"
    echo "PORT=${API_PORT:-3001}"
    echo "Also set JWT_SECRET, GOOGLE_GENAI_API_KEY, ADMIN_EMAIL, and ADMIN_PASSWORD."
    exit 1
fi

if ! command -v docker >/dev/null || ! command -v node >/dev/null || ! command -v npm >/dev/null || ! command -v pm2 >/dev/null || ! command -v envsubst >/dev/null; then
    echo "Install Docker, Node.js, npm, PM2, and gettext-base (envsubst) on this server first."
    exit 1
fi

echo "Starting Postgres and Redis. Existing volumes are kept."
"${COMPOSE[@]}" up -d

cd "$ROOT/Backend"
npm ci --omit=dev
npm run migrate

cd "$ROOT/Frontend"
npm ci
VITE_API_URL= npm run build

sudo mkdir -p "$WEB_ROOT"
sudo rsync -a --delete "$ROOT/Frontend/dist/" "$WEB_ROOT/"

sudo a2enmod proxy proxy_http headers rewrite ssl
sudo tee /etc/apache2/conf-available/wasm-mime.conf >/dev/null <<'EOF'
AddType application/wasm .wasm
EOF
sudo a2enconf wasm-mime >/dev/null
envsubst '${DOMAIN} ${WEB_ROOT} ${API_PORT}' < "$ROOT/deploy/apache-hirevia.conf" | sudo tee /etc/apache2/sites-available/hirevia.conf >/dev/null
sudo a2ensite hirevia.conf
sudo apache2ctl configtest
sudo systemctl reload apache2

cd "$ROOT/Backend"
if pm2 describe hirevia-api >/dev/null 2>&1; then
    pm2 reload hirevia-api --update-env
else
    pm2 start server.js --name hirevia-api --cwd "$ROOT/Backend"
    pm2 save
fi

echo
echo "Hirevia is installed."
echo "Issue TLS next, then confirm Backend/.env CLIENT_ORIGINS is https://${DOMAIN}"
echo "  sudo certbot --apache -d ${DOMAIN}"
echo "After the certificate exists, run deploy/update.sh for later releases."
