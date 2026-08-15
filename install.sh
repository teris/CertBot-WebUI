#!/usr/bin/env bash
# Install CertBot WebUI centrally without Docker.
# Usage:
#   sudo ./install.sh
#     → fragt interaktiv nach Port, Admin-Benutzer, Passwort
#   sudo NONINTERACTIVE=1 PORT=3000 INITIAL_ADMIN_EMAIL=... INITIAL_ADMIN_PASSWORD=... ./install.sh
#   sudo DB_TYPE=postgresql DATABASE_URL=postgresql://... ./install.sh
#   sudo DB_TYPE=mysql DATABASE_URL=mysql://... ./install.sh
#   sudo DB_TYPE=sqlite ./install.sh   # default
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Bitte als root ausführen (sudo ./install.sh)" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
INSTALL_ROOT="${INSTALL_ROOT:-/opt/certbot-webui}"
SERVICE_USER="${SERVICE_USER:-certbot-webui}"
DB_TYPE="${DB_TYPE:-sqlite}"

prompt_if_empty() {
  # prompt_if_empty VAR "Frage" "Default" [secret]
  local var_name="$1"
  local question="$2"
  local default="${3:-}"
  local secret="${4:-0}"
  local current="${!var_name:-}"
  if [[ -n "$current" ]]; then
    return 0
  fi
  local answer=""
  if [[ "$secret" == "1" ]]; then
    if [[ -n "$default" ]]; then
      read -r -s -p "$question [$default]: " answer
    else
      read -r -s -p "$question: " answer
    fi
    echo ""
  else
    if [[ -n "$default" ]]; then
      read -r -p "$question [$default]: " answer
    else
      read -r -p "$question: " answer
    fi
  fi
  if [[ -z "$answer" ]]; then
    answer="$default"
  fi
  printf -v "$var_name" '%s' "$answer"
}

prompt_password() {
  local var_name="$1"
  local question="$2"
  local current="${!var_name:-}"
  if [[ -n "$current" ]]; then
    return 0
  fi
  local p1="" p2=""
  while true; do
    read -r -s -p "$question: " p1
    echo ""
    if [[ ${#p1} -lt 8 ]]; then
      echo "Passwort muss mindestens 8 Zeichen haben." >&2
      continue
    fi
    read -r -s -p "Passwort wiederholen: " p2
    echo ""
    if [[ "$p1" != "$p2" ]]; then
      echo "Passwörter stimmen nicht überein." >&2
      continue
    fi
    printf -v "$var_name" '%s' "$p1"
    break
  done
}

echo ""
echo "=== CertBot WebUI Installation ==="
echo "Werte per Umgebungsvariable vorgeben oder interaktiv eingeben."
echo "Nicht-interaktiv: NONINTERACTIVE=1 PORT=... INITIAL_ADMIN_EMAIL=... INITIAL_ADMIN_PASSWORD=..."
echo ""

if [[ "${NONINTERACTIVE:-0}" == "1" ]]; then
  PORT="${PORT:-3000}"
  INITIAL_ADMIN_EMAIL="${INITIAL_ADMIN_EMAIL:-admin@localhost}"
  INITIAL_ADMIN_PASSWORD="${INITIAL_ADMIN_PASSWORD:-changeme}"
  HTTPS_MODE="${HTTPS_MODE:-none}"
else
  PORT="${PORT:-}"
  INITIAL_ADMIN_EMAIL="${INITIAL_ADMIN_EMAIL:-}"
  INITIAL_ADMIN_PASSWORD="${INITIAL_ADMIN_PASSWORD:-}"
  prompt_if_empty PORT "HTTP-Port für das Dashboard" "3000"
  prompt_if_empty INITIAL_ADMIN_EMAIL "Admin-Benutzer (E-Mail)" "admin@localhost"
  prompt_password INITIAL_ADMIN_PASSWORD "Admin-Passwort"

  if [[ -z "${HTTPS_MODE:-}" ]]; then
    echo ""
    echo "HTTPS / Domain:"
    echo "  HTTP bleibt auf dem gewählten Port (z.B. 3000)."
    echo "  HTTPS kommt automatisch auf Port+1 (z.B. 3001) — ohne 80/443."
    echo "  1) Nur HTTP"
    echo "  2) Vorhandenes Zertifikat → HTTPS auf Port+1"
    echo "  3) Let's Encrypt (certbot standalone) → HTTPS auf Port+1"
    read -r -p "Auswahl [1]: " https_choice
    case "${https_choice:-1}" in
      2) HTTPS_MODE="existing" ;;
      3) HTTPS_MODE="letsencrypt" ;;
      *) HTTPS_MODE="none" ;;
    esac
  fi

  if [[ "$HTTPS_MODE" == "existing" || "$HTTPS_MODE" == "letsencrypt" ]]; then
    prompt_if_empty HTTPS_DOMAIN "Domain (DNS A-Record → dieser Server)" ""
    if [[ "$HTTPS_MODE" == "existing" ]]; then
      prompt_if_empty SSL_CERT "Pfad Zertifikat (fullchain.pem)" ""
      prompt_if_empty SSL_KEY "Pfad Private Key (privkey.pem)" ""
    else
      prompt_if_empty LETSENCRYPT_EMAIL "E-Mail für Let's Encrypt" "$INITIAL_ADMIN_EMAIL"
    fi
  fi
fi

HTTPS_MODE="${HTTPS_MODE:-none}"
HTTPS_PORT="${HTTPS_PORT:-$((PORT + 1))}"

# Port validieren
if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [[ "$PORT" -lt 1 || "$PORT" -gt 65535 ]]; then
  echo "Ungültiger Port: $PORT" >&2
  exit 1
fi
if [[ ${#INITIAL_ADMIN_PASSWORD} -lt 8 ]]; then
  echo "Admin-Passwort muss mindestens 8 Zeichen haben." >&2
  exit 1
fi

detect_listen_ip() {
  local ip=""
  ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}' || true)"
  if [[ -z "$ip" ]]; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  fi
  if [[ -z "$ip" || "$ip" == "127.0.0.1" ]]; then
    ip="127.0.0.1"
  fi
  echo "$ip"
}

DETECTED_IP="$(detect_listen_ip)"
# NEXTAUTH_URL: explizit > HTTPS-Domain:HTTPS_PORT > Server-IP:PORT
if [[ -z "${NEXTAUTH_URL:-}" ]]; then
  if [[ "${HTTPS_MODE:-none}" != "none" && -n "${HTTPS_DOMAIN:-}" ]]; then
    if [[ "${HTTPS_PORT}" == "443" ]]; then
      NEXTAUTH_URL="https://${HTTPS_DOMAIN}"
    else
      NEXTAUTH_URL="https://${HTTPS_DOMAIN}:${HTTPS_PORT}"
    fi
  elif [[ "$DETECTED_IP" != "127.0.0.1" ]]; then
    NEXTAUTH_URL="http://${DETECTED_IP}:${PORT}"
  else
    NEXTAUTH_URL="http://localhost:${PORT}"
  fi
fi
echo ""
echo "Öffentliche Dashboard-URL: ${NEXTAUTH_URL}"
echo "Admin: ${INITIAL_ADMIN_EMAIL}"
echo "HTTP-Port:  ${PORT}"
if [[ "${HTTPS_MODE:-none}" != "none" ]]; then
  echo "HTTPS-Port: ${HTTPS_PORT}"
fi
echo "HTTPS-Modus: ${HTTPS_MODE:-none}"
echo ""

NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-$(openssl rand -hex 32)}"
CRON_SECRET="${CRON_SECRET:-$(openssl rand -hex 16)}"

ensure_node20() {
  local major=0
  if command -v node >/dev/null; then
    major="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
  fi
  if [[ "$major" -ge 20 ]]; then
    echo "Node.js $(node -v) OK"
    return 0
  fi

  echo "Node.js 20+ erforderlich (gefunden: ${major:-keines}). Installiere Node.js 20 ..."
  if ! command -v apt-get >/dev/null; then
    echo "Bitte Node.js 20+ manuell installieren: https://nodejs.org/" >&2
    exit 1
  fi
  if ! command -v curl >/dev/null; then
    apt-get update -y
    apt-get install -y curl ca-certificates
  fi
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -y
  apt-get install -y nodejs

  major="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
  if [[ "$major" -lt 20 ]]; then
    echo "Node.js 20+ konnte nicht installiert werden (aktuell: $(node -v))." >&2
    exit 1
  fi
  echo "Node.js $(node -v) installiert"
}

ensure_node20

if ! command -v npm >/dev/null; then
  echo "npm erforderlich" >&2
  exit 1
fi
if ! command -v curl >/dev/null; then
  if command -v apt-get >/dev/null; then
    apt-get update -y
    apt-get install -y curl
  else
    echo "curl ist für Benachrichtigungs-Checks erforderlich" >&2
    exit 1
  fi
fi

# Dateien nach /opt kopieren — ohne rsync-Abhängigkeit
sync_web_app() {
  local src="$1"
  local dst="$2"
  mkdir -p "$dst"
  if command -v rsync >/dev/null; then
    rsync -a --delete \
      --exclude node_modules --exclude .next --exclude 'prisma/*.db' --exclude 'prisma/*.db-*' --exclude data \
      "$src/" "$dst/"
    return
  fi

  # Fallback mit cp (Debian/Ubuntu ohne rsync)
  find "$dst" -mindepth 1 -maxdepth 1 \
    ! -name node_modules ! -name .next ! -name data \
    -exec rm -rf {} + 2>/dev/null || true

  shopt -s dotglob nullglob
  for item in "$src"/*; do
    base="$(basename "$item")"
    case "$base" in
      node_modules|.next|data) continue ;;
    esac
    if [[ "$base" == "prisma" && -d "$item" ]]; then
      mkdir -p "$dst/prisma"
      for f in "$item"/*; do
        [[ -e "$f" ]] || continue
        case "$(basename "$f")" in
          *.db|*.db-journal|*.db-wal|*.db-shm) continue ;;
        esac
        cp -a "$f" "$dst/prisma/"
      done
      continue
    fi
    rm -rf "$dst/$base"
    cp -a "$item" "$dst/$base"
  done
  shopt -u dotglob nullglob
}

id -u "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --home "$INSTALL_ROOT" --shell /usr/sbin/nologin "$SERVICE_USER"

mkdir -p "$INSTALL_ROOT" "$INSTALL_ROOT/data"
sync_web_app "$WEB_DIR" "$INSTALL_ROOT/app"

cd "$INSTALL_ROOT/app"

case "$DB_TYPE" in
  sqlite)
    DATABASE_URL="${DATABASE_URL:-file:$INSTALL_ROOT/data/certbot-webui.db}"
    ;;
  postgresql|mysql)
    if [[ -z "${DATABASE_URL:-}" ]]; then
      echo "DATABASE_URL ist für DB_TYPE=$DB_TYPE erforderlich" >&2
      exit 1
    fi
    ;;
  *)
    echo "DB_TYPE muss sqlite|postgresql|mysql sein" >&2
    exit 1
    ;;
esac

node scripts/set-db-provider.mjs "$DB_TYPE"
# Saubere Installation (wichtig nach Node-Upgrade / Tailwind native bindings)
rm -rf node_modules .next
npm install
npx prisma generate
export DATABASE_URL NEXTAUTH_URL NEXTAUTH_SECRET INITIAL_ADMIN_EMAIL INITIAL_ADMIN_PASSWORD CRON_SECRET
npx prisma db push
npx tsx prisma/seed.ts

cat > "$INSTALL_ROOT/.env" <<EOF
DATABASE_URL=${DATABASE_URL}
NEXTAUTH_URL=${NEXTAUTH_URL}
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
INITIAL_ADMIN_EMAIL=${INITIAL_ADMIN_EMAIL}
INITIAL_ADMIN_PASSWORD=${INITIAL_ADMIN_PASSWORD}
CRON_SECRET=${CRON_SECRET}
PORT=${PORT}
HTTPS_PORT=${HTTPS_PORT:-}
HTTPS_DOMAIN=${HTTPS_DOMAIN:-}
DB_TYPE=${DB_TYPE}
EOF
chmod 600 "$INSTALL_ROOT/.env"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_ROOT"

# App bleibt auf PORT öffentlich (HTTP); HTTPS kommt separat auf PORT+1
LISTEN_HOST="0.0.0.0"

cat > /etc/systemd/system/certbot-webui.service <<EOF
[Unit]
Description=CertBot WebUI
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${INSTALL_ROOT}/app
EnvironmentFile=${INSTALL_ROOT}/.env
ExecStart=/usr/bin/npm start -- --hostname ${LISTEN_HOST} --port \${PORT}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/certbot-webui-notify.service <<EOF
[Unit]
Description=CertBot WebUI notification check
After=certbot-webui.service

[Service]
Type=oneshot
EnvironmentFile=${INSTALL_ROOT}/.env
ExecStart=/usr/bin/curl -fsS -H "x-cron-secret: \${CRON_SECRET}" http://127.0.0.1:\${PORT}/api/notifications/check
EOF

cat > /etc/systemd/system/certbot-webui-notify.timer <<EOF
[Unit]
Description=Run CertBot WebUI notification checks every 15 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=15min
Unit=certbot-webui-notify.service

[Install]
WantedBy=timers.target
EOF

# Build next app
cd "$INSTALL_ROOT/app"
sudo -u "$SERVICE_USER" bash -lc 'export $(grep -v "^#" '"$INSTALL_ROOT"'/.env | xargs); npm run build'

systemctl daemon-reload
systemctl enable --now certbot-webui.service
systemctl enable --now certbot-webui-notify.timer

# HTTPS optional (nginx + Zertifikat)
if [[ "${HTTPS_MODE:-none}" == "existing" || "${HTTPS_MODE:-none}" == "letsencrypt" ]]; then
  export NONINTERACTIVE=1
  export HTTPS_MODE HTTPS_DOMAIN PORT HTTPS_PORT
  export SSL_CERT="${SSL_CERT:-}"
  export SSL_KEY="${SSL_KEY:-}"
  export LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-$INITIAL_ADMIN_EMAIL}"
  export INITIAL_ADMIN_EMAIL
  export INSTALL_ROOT
  bash "$ROOT_DIR/enable-https.sh"
  if [[ -f "$INSTALL_ROOT/.env" ]]; then
    NEXTAUTH_URL="$(grep -E '^NEXTAUTH_URL=' "$INSTALL_ROOT/.env" | head -1 | cut -d= -f2-)"
  fi
fi

echo ""
echo "Installation abgeschlossen."
echo "  URL:       ${NEXTAUTH_URL}"
echo "  Admin:     ${INITIAL_ADMIN_EMAIL}"
echo "  HTTP-Port: ${PORT}"
if [[ "${HTTPS_MODE:-none}" != "none" ]]; then
  echo "  HTTPS-Port:${HTTPS_PORT}"
fi
echo "  HTTPS:     ${HTTPS_MODE:-none}"
echo "  DB:        ${DB_TYPE}"
echo "Login mit dem soeben gesetzten Admin-Passwort."
if [[ "${HTTPS_MODE:-none}" == "none" ]]; then
  echo "HTTPS später: sudo ./enable-https.sh"
fi
