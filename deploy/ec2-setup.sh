#!/usr/bin/env bash
# Deploys Ledger onto a shared EC2 instance without disturbing other apps already
# running there.
#
# This box runs Apache (not nginx) as the primary web server for every other app,
# each with its own vhost in /etc/apache2/sites-available. An earlier version of this
# script installed nginx instead — nginx and Apache can't both bind port 80, Apache
# was already there serving other sites, and nginx silently lost and never actually
# ran. So: Apache reverse-proxy vhost per domain, matching the existing pattern, not
# a separate web server.
#
# Also: don't assume port 3000 is free. It wasn't — another app (Remorant) already
# had it, and our process was crashing on startup with EADDRINUSE without anyone
# noticing (nothing was actually listening, so requests silently fell through to
# whatever else Apache proxies to). This script scans for a genuinely free port
# instead of hardcoding one.
#
# Expects the code to already be at $APP_DIR (clone/pull it yourself first, e.g.
# via MobaXterm: git clone https://github.com/whizzonby/Tenders.git /var/www/contracts)
# — this script only sets up the environment and process manager around it. If
# $APP_DIR doesn't exist yet, it clones the repo itself as a convenience.
#
# NOTE: this script is for a fresh deploy (a new server, or this app not yet
# running here). Don't re-run it against a server where the app is already up —
# the port-scan will see the app's own current port as "taken" and move it,
# which just churns the config for no reason.
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

echo "==> Checking Apache"
if ! command -v apache2ctl >/dev/null 2>&1; then
  echo "    ERROR: this script assumes Apache is already the web server on this box"
  echo "    (every other app here uses it). If that's no longer true, this script"
  echo "    needs rewriting for whatever replaced it — don't just install nginx"
  echo "    again, see the comment at the top of this file for why."
  exit 1
fi
sudo a2enmod proxy proxy_http >/dev/null 2>&1 || true
sudo systemctl reload apache2

echo "==> Checking PM2"
if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2
else
  echo "    pm2 already installed — reusing it (this app is added as its own process, existing ones are untouched)."
fi

echo "==> Picking a free port for the app"
APP_PORT=""
for candidate in 3001 3003 3004 3005 3006 3007 3008 3009 3010; do
  if ! sudo ss -tlnp 2>/dev/null | grep -q ":$candidate "; then
    APP_PORT="$candidate"
    break
  fi
done
if [ -z "$APP_PORT" ]; then
  echo "    Couldn't find a free port in the 3001-3010 range."
  echo "    Check 'sudo ss -tlnp' manually, then set PORT in backend/.env yourself and rerun."
  exit 1
fi
echo "    Using port $APP_PORT"

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
fi
if grep -q '^PORT=' "$APP_DIR/backend/.env"; then
  sed -i "s/^PORT=.*/PORT=$APP_PORT/" "$APP_DIR/backend/.env"
else
  echo "PORT=$APP_PORT" >> "$APP_DIR/backend/.env"
fi
echo "    backend/.env set to PORT=$APP_PORT — remember to also add SAM_GOV_API_KEY if you have one."

# ecosystem.config.js hardcodes a PORT that overrides .env when PM2 injects its env
# block at process spawn (dotenv won't override an already-set var) — keep the two
# in sync so they can't silently drift apart like they did the first time.
sed -i "s/PORT: [0-9]*/PORT: $APP_PORT/" "$APP_DIR/backend/ecosystem.config.js"

echo "==> Configuring Apache vhost for $DOMAIN (other sites' vhosts are untouched)"
sudo tee "/etc/apache2/sites-available/$DOMAIN.conf" > /dev/null <<APACHECONF
<VirtualHost *:80>
    ServerName $DOMAIN
    ServerAlias www.$DOMAIN

    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:$APP_PORT/
    ProxyPassReverse / http://127.0.0.1:$APP_PORT/

    ErrorLog \${APACHE_LOG_DIR}/${DOMAIN}-error.log
    CustomLog \${APACHE_LOG_DIR}/${DOMAIN}-access.log combined
</VirtualHost>
APACHECONF

sudo a2ensite "$DOMAIN.conf"
sudo apache2ctl configtest
sudo systemctl reload apache2

echo "==> Requesting HTTPS certificate (Let's Encrypt) — requires DNS to already point here"
echo "    Only requesting the bare domain by default — certbot fails the WHOLE request"
echo "    if any listed domain doesn't resolve yet. Add '-d www.$DOMAIN' yourself once"
echo "    you've created that DNS record too, then rerun certbot with both."
sudo certbot --apache -d "$DOMAIN" --agree-tos -m "admin@$DOMAIN" || \
  echo "Certbot failed — check 'sudo certbot certificates' and confirm DNS resolves to this instance first."

echo "==> Starting app with PM2 as '$PM2_NAME' (existing PM2 processes are untouched)"
cd "$APP_DIR/backend"
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u "$USER" --hp "$HOME" | tail -n 1 | sudo bash || true

echo ""
echo "Done. Visit https://$DOMAIN once DNS + certbot have finished propagating."
echo "App lives in: $APP_DIR, running on port $APP_PORT"
echo "PM2 process name: $PM2_NAME  (pm2 logs $PM2_NAME / pm2 restart $PM2_NAME)"
echo "Remember to set SAM_GOV_API_KEY in $APP_DIR/backend/.env, then: pm2 restart $PM2_NAME"
