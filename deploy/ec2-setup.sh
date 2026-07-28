#!/usr/bin/env bash
# Deploys Ledger onto a shared EC2 instance without disturbing other apps already
# running there: no blanket `apt-get upgrade`, reuses Node/nginx/certbot/pm2 if
# already installed, deploys into its own directory, and adds its own nginx server
# block (matched by domain, so other sites' server blocks are untouched).
#
# Expects the code to already be at $APP_DIR (clone/pull it yourself first, e.g.
# via MobaXterm: git clone https://github.com/whizzonby/Tenders.git /var/www/contracts)
# — this script only sets up the environment and process manager around it. If
# $APP_DIR doesn't exist yet, it clones the repo itself as a convenience.
#
# Usage: bash ec2-setup.sh tenders.whizzonby.com
set -euo pipefail

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  echo "Usage: bash ec2-setup.sh yourdomain.com"
  exit 1
fi

APP_DIR="/var/www/contracts"
REPO_URL="https://github.com/whizzonby/Tenders.git"
PM2_NAME="tenders-whizzonby"
APP_PORT="3000"

echo "==> Refreshing package index (not upgrading existing packages)"
sudo apt-get update -y

echo "==> Checking Node.js"
NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
  if [ "$NODE_MAJOR" -ge 18 ]; then
    echo "    Found Node $(node -v) — reusing it, not touching your other apps' Node install."
    NEED_NODE=0
  else
    echo "    Found Node $(node -v), which is older than this app needs (>=18)."
  fi
fi
if [ "$NEED_NODE" -eq 1 ]; then
  echo "    Installing Node.js 20 LTS (none found, or too old)"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs build-essential
fi

echo "==> Checking nginx"
if ! command -v nginx >/dev/null 2>&1; then
  sudo apt-get install -y nginx
else
  echo "    nginx already installed — reusing it."
fi

echo "==> Checking certbot"
if ! command -v certbot >/dev/null 2>&1; then
  sudo apt-get install -y certbot python3-certbot-nginx
else
  echo "    certbot already installed — reusing it."
fi

echo "==> Checking PM2"
if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2
else
  echo "    pm2 already installed — reusing it (this app is added as its own process, existing ones are untouched)."
fi

echo "==> Checking port $APP_PORT is free"
if command -v ss >/dev/null 2>&1 && sudo ss -tlnp 2>/dev/null | grep -q ":$APP_PORT "; then
  echo "    WARNING: something is already listening on port $APP_PORT."
  echo "    If that's another app, set a different PORT in backend/.env before starting this one,"
  echo "    and update the nginx proxy_pass below to match."
fi

echo "==> Checking $APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  echo "    Already cloned — pulling latest."
  git -C "$APP_DIR" pull
elif [ -d "$APP_DIR" ] && [ -n "$(ls -A "$APP_DIR" 2>/dev/null)" ]; then
  echo "    $APP_DIR exists and isn't a git checkout — leaving it alone. If this is the app,"
  echo "    cd in and run 'git init && git remote add origin $REPO_URL' yourself, or clear it and re-run."
  exit 1
else
  echo "    Not found — cloning $REPO_URL into $APP_DIR"
  sudo mkdir -p "$APP_DIR"
  sudo chown "$USER":"$USER" "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi

echo "==> Installing app dependencies"
cd "$APP_DIR/backend"
npm install --omit=dev

if [ ! -f "$APP_DIR/backend/.env" ]; then
  cp "$APP_DIR/backend/.env.example" "$APP_DIR/backend/.env"
  echo "    Created backend/.env from the example — remember to add SAM_GOV_API_KEY."
fi

echo "==> Configuring nginx server block for $DOMAIN (other sites' configs are untouched)"
sudo tee "/etc/nginx/sites-available/$DOMAIN" > /dev/null <<NGINX
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
NGINX

sudo ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
sudo nginx -t && sudo systemctl reload nginx

echo "==> Requesting HTTPS certificate (Let's Encrypt) — requires DNS to already point here"
sudo certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN" || \
  echo "Certbot failed or was skipped — confirm the domain's A record points at this instance's public IP, then rerun: sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"

echo "==> Starting app with PM2 as '$PM2_NAME' (existing PM2 processes are untouched)"
cd "$APP_DIR/backend"
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u "$USER" --hp "$HOME" | tail -n 1 | sudo bash || true

echo ""
echo "Done. Visit https://$DOMAIN once DNS + certbot have finished propagating."
echo "App lives in: $APP_DIR"
echo "PM2 process name: $PM2_NAME  (pm2 logs $PM2_NAME / pm2 restart $PM2_NAME)"
echo "Remember to set SAM_GOV_API_KEY in $APP_DIR/backend/.env, then: pm2 restart $PM2_NAME"
