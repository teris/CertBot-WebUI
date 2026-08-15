#!/usr/bin/env bash
# Update CertBot WebUI (non-Docker install under /opt/certbot-webui).
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Bitte als root ausführen" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
INSTALL_ROOT="${INSTALL_ROOT:-/opt/certbot-webui}"
SERVICE_USER="${SERVICE_USER:-certbot-webui}"

if [[ ! -f "$INSTALL_ROOT/.env" ]]; then
  echo "Keine Installation unter $INSTALL_ROOT gefunden. Zuerst ./install.sh ausführen." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$INSTALL_ROOT/.env"
set +a

DB_TYPE="${DB_TYPE:-sqlite}"

major=0
if command -v node >/dev/null; then
  major="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
fi
if [[ "$major" -lt 20 ]]; then
  echo "Node.js 20+ erforderlich (gefunden: $(node -v 2>/dev/null || echo keines)). Bitte zuerst ./install.sh ausführen." >&2
  exit 1
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

systemctl stop certbot-webui.service || true

sync_web_app "$WEB_DIR" "$INSTALL_ROOT/app"

# NEXTAUTH_URL: localhost → öffentliche IP:PORT — HTTPS-URL nie überschreiben
CURRENT_URL="$(grep -E '^NEXTAUTH_URL=' "$INSTALL_ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2- || true)"
if [[ "$CURRENT_URL" == *localhost* || "$CURRENT_URL" == *127.0.0.1* ]]; then
  if [[ "$CURRENT_URL" == https://* ]]; then
    echo "NEXTAUTH_URL ist HTTPS — belasse unverändert: ${CURRENT_URL}"
  else
    DETECTED_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}' || true)"
    DETECTED_IP="${DETECTED_IP:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
    PORT_VAL="$(grep '^PORT=' "$INSTALL_ROOT/.env" | cut -d= -f2-)"
    PORT_VAL="${PORT_VAL:-3000}"
    if [[ -n "$DETECTED_IP" && "$DETECTED_IP" != "127.0.0.1" ]]; then
      sed -i "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=http://${DETECTED_IP}:${PORT_VAL}|" "$INSTALL_ROOT/.env"
      echo "NEXTAUTH_URL auf http://${DETECTED_IP}:${PORT_VAL} aktualisiert"
    fi
  fi
fi

cat > /etc/systemd/system/certbot-webui.service <<EOF
[Unit]
Description=CertBot WebUI
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${INSTALL_ROOT}/app
EnvironmentFile=${INSTALL_ROOT}/.env
ExecStart=/usr/bin/npm start -- --hostname 0.0.0.0 --port \${PORT}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload

cd "$INSTALL_ROOT/app"
node scripts/set-db-provider.mjs "$DB_TYPE"
rm -rf node_modules .next
npm install
npx prisma generate
npx prisma db push
# shellcheck disable=SC1090
set -a
source "$INSTALL_ROOT/.env"
set +a
npx tsx prisma/seed.ts || true
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_ROOT"
sudo -u "$SERVICE_USER" bash -lc 'export $(grep -v "^#" '"$INSTALL_ROOT"'/.env | xargs); npm run build'

systemctl start certbot-webui.service
systemctl restart certbot-webui-notify.timer || true

echo "Update abgeschlossen."
