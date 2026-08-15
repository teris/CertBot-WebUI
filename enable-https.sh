#!/usr/bin/env bash
# HTTPS für CertBot WebUI auf Port (APP_PORT+1), ohne Belegung von 80/443.
#
#   App HTTP:  PORT       (z.B. 3000)
#   App HTTPS: PORT+1     (z.B. 3001) via nginx + Zertifikat
#
# Let's Encrypt: certbot --standalone (nutzt Port 80 nur kurz während Ausstellung/Renewal)
#
#   sudo ./enable-https.sh
#   sudo HTTPS_MODE=letsencrypt HTTPS_DOMAIN=certs.example.com PORT=3000 LETSENCRYPT_EMAIL=a@b.c ./enable-https.sh
#   sudo HTTPS_MODE=existing HTTPS_DOMAIN=certs.example.com SSL_CERT=... SSL_KEY=... PORT=3000 ./enable-https.sh
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Bitte als root ausführen" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_ROOT="${INSTALL_ROOT:-/opt/certbot-webui}"
TEMPLATE="${ROOT_DIR}/deploy/nginx/certbot-webui.conf.template"
NGINX_SITE="/etc/nginx/sites-available/certbot-webui"
NGINX_LINK="/etc/nginx/sites-enabled/certbot-webui"

prompt_if_empty() {
  local var_name="$1"
  local question="$2"
  local default="${3:-}"
  local current="${!var_name:-}"
  if [[ -n "$current" ]]; then
    return 0
  fi
  local answer=""
  if [[ -n "$default" ]]; then
    read -r -p "$question [$default]: " answer
  else
    read -r -p "$question: " answer
  fi
  [[ -z "$answer" ]] && answer="$default"
  printf -v "$var_name" '%s' "$answer"
}

APP_PORT="${PORT:-}"
if [[ -z "$APP_PORT" && -f "$INSTALL_ROOT/.env" ]]; then
  APP_PORT="$(grep -E '^PORT=' "$INSTALL_ROOT/.env" | head -1 | cut -d= -f2- || true)"
fi
APP_PORT="${APP_PORT:-3000}"
HTTPS_PORT="${HTTPS_PORT:-$((APP_PORT + 1))}"

echo ""
echo "=== HTTPS einrichten ==="
echo "  HTTP (App):  ${APP_PORT}"
echo "  HTTPS (TLS): ${HTTPS_PORT}  ← Zertifikat hier, nicht auf 80/443"
echo ""

if [[ "${NONINTERACTIVE:-0}" == "1" ]]; then
  HTTPS_MODE="${HTTPS_MODE:-none}"
else
  if [[ -z "${HTTPS_MODE:-}" ]]; then
    echo "HTTPS-Modus:"
    echo "  1) Kein HTTPS"
    echo "  2) Vorhandenes Zertifikat → HTTPS auf Port ${HTTPS_PORT}"
    echo "  3) Let's Encrypt (certbot standalone) → HTTPS auf Port ${HTTPS_PORT}"
    read -r -p "Auswahl [1]: " choice
    case "${choice:-1}" in
      2) HTTPS_MODE="existing" ;;
      3) HTTPS_MODE="letsencrypt" ;;
      *) HTTPS_MODE="none" ;;
    esac
  fi
fi

if [[ "$HTTPS_MODE" == "none" || "$HTTPS_MODE" == "http" || -z "$HTTPS_MODE" ]]; then
  echo "HTTPS wird übersprungen."
  exit 0
fi

prompt_if_empty HTTPS_DOMAIN "Domain für HTTPS (DNS A-Record → dieser Server)" ""
if [[ -z "$HTTPS_DOMAIN" ]]; then
  echo "Domain ist erforderlich." >&2
  exit 1
fi

public_https_url() {
  if [[ "$HTTPS_PORT" == "443" ]]; then
    echo "https://${HTTPS_DOMAIN}"
  else
    echo "https://${HTTPS_DOMAIN}:${HTTPS_PORT}"
  fi
}

ensure_nginx() {
  if ! command -v nginx >/dev/null; then
    echo "==> Installiere nginx ..."
    apt-get update -y
    apt-get install -y nginx
  fi
  mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled
}

write_nginx_conf() {
  local cert="$1"
  local key="$2"
  if [[ ! -f "$TEMPLATE" ]]; then
    echo "Template fehlt: $TEMPLATE" >&2
    exit 1
  fi
  sed -e "s|__DOMAIN__|${HTTPS_DOMAIN}|g" \
      -e "s|__APP_PORT__|${APP_PORT}|g" \
      -e "s|__HTTPS_PORT__|${HTTPS_PORT}|g" \
      -e "s|__SSL_CERT__|${cert}|g" \
      -e "s|__SSL_KEY__|${key}|g" \
      "$TEMPLATE" > "$NGINX_SITE"
  ln -sfn "$NGINX_SITE" "$NGINX_LINK"
  # Keine Default-Site auf 80 nötig / stört nicht unsere Ports
  rm -f /etc/nginx/sites-enabled/default
}

update_app_env_https() {
  local url
  url="$(public_https_url)"
  mkdir -p "$INSTALL_ROOT"
  if [[ -f "$INSTALL_ROOT/.env" ]]; then
    if grep -q '^NEXTAUTH_URL=' "$INSTALL_ROOT/.env"; then
      sed -i "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=${url}|" "$INSTALL_ROOT/.env"
    else
      echo "NEXTAUTH_URL=${url}" >> "$INSTALL_ROOT/.env"
    fi
    if grep -q '^HTTPS_PORT=' "$INSTALL_ROOT/.env"; then
      sed -i "s|^HTTPS_PORT=.*|HTTPS_PORT=${HTTPS_PORT}|" "$INSTALL_ROOT/.env"
    else
      echo "HTTPS_PORT=${HTTPS_PORT}" >> "$INSTALL_ROOT/.env"
    fi
    if grep -q '^HTTPS_DOMAIN=' "$INSTALL_ROOT/.env"; then
      sed -i "s|^HTTPS_DOMAIN=.*|HTTPS_DOMAIN=${HTTPS_DOMAIN}|" "$INSTALL_ROOT/.env"
    else
      echo "HTTPS_DOMAIN=${HTTPS_DOMAIN}" >> "$INSTALL_ROOT/.env"
    fi
  fi
  if [[ -d "$INSTALL_ROOT/app" ]] && [[ -f "$INSTALL_ROOT/.env" ]]; then
    (
      cd "$INSTALL_ROOT/app"
      set -a
      # shellcheck disable=SC1090
      source "$INSTALL_ROOT/.env"
      set +a
      export NEXTAUTH_URL="$url"
      npx tsx prisma/set-public-url.ts 2>/dev/null || true
    )
  fi
  systemctl restart certbot-webui.service 2>/dev/null || true
  export NEXTAUTH_URL="$url"
}

install_renewal_hint() {
  mkdir -p /etc/letsencrypt/renewal-hooks/deploy
  cat > /etc/letsencrypt/renewal-hooks/deploy/certbot-webui-reload-nginx.sh <<'EOF'
#!/usr/bin/env bash
systemctl reload nginx 2>/dev/null || true
EOF
  chmod +x /etc/letsencrypt/renewal-hooks/deploy/certbot-webui-reload-nginx.sh
}

case "$HTTPS_MODE" in
  existing)
    prompt_if_empty SSL_CERT "Pfad zum Zertifikat (fullchain.pem)" ""
    prompt_if_empty SSL_KEY "Pfad zum Private Key (privkey.pem)" ""
    if [[ ! -f "$SSL_CERT" ]]; then
      echo "Zertifikat nicht gefunden: $SSL_CERT" >&2
      exit 1
    fi
    if [[ ! -f "$SSL_KEY" ]]; then
      echo "Key nicht gefunden: $SSL_KEY" >&2
      exit 1
    fi
    ensure_nginx
    write_nginx_conf "$SSL_CERT" "$SSL_KEY"
    nginx -t
    systemctl enable --now nginx
    systemctl reload nginx
    update_app_env_https
    echo ""
    echo "HTTPS aktiv (vorhandenes Zertifikat)."
    echo "  HTTP:  http://${HTTPS_DOMAIN}:${APP_PORT}  (oder Server-IP:${APP_PORT})"
    echo "  HTTPS: $(public_https_url)"
    ;;

  letsencrypt)
    prompt_if_empty LETSENCRYPT_EMAIL "E-Mail für Let's Encrypt" "${INITIAL_ADMIN_EMAIL:-}"
    if [[ -z "$LETSENCRYPT_EMAIL" ]]; then
      echo "Let's-Encrypt-E-Mail erforderlich." >&2
      exit 1
    fi
    ensure_nginx
    if ! command -v certbot >/dev/null; then
      echo "==> Installiere certbot ..."
      apt-get update -y
      apt-get install -y certbot
    fi

    CERT_PATH="/etc/letsencrypt/live/${HTTPS_DOMAIN}/fullchain.pem"
    KEY_PATH="/etc/letsencrypt/live/${HTTPS_DOMAIN}/privkey.pem"

    echo "==> Let's Encrypt via certbot standalone"
    echo "    Hinweis: Für die Ausstellung muss Port 80 kurz erreichbar/frei sein"
    echo "    (nur während certbot). Der Dashboard-Dienst bleibt auf ${APP_PORT}/${HTTPS_PORT}."
    echo ""

    # Falls etwas auf 80 lauscht: kurz stoppen (z.B. anderes nginx), danach wieder starten
    STOPPED_HTTP=0
    if ss -ltn | grep -q ':80 '; then
      if systemctl is-active --quiet nginx; then
        systemctl stop nginx
        STOPPED_HTTP=1
      fi
    fi

    certbot certonly --standalone \
      -d "$HTTPS_DOMAIN" \
      --non-interactive \
      --agree-tos \
      -m "$LETSENCRYPT_EMAIL" \
      --preferred-challenges http

    if [[ "$STOPPED_HTTP" -eq 1 ]]; then
      systemctl start nginx || true
    fi

    if [[ ! -f "$CERT_PATH" ]]; then
      echo "Zertifikat wurde nicht ausgestellt: $CERT_PATH" >&2
      exit 1
    fi

    write_nginx_conf "$CERT_PATH" "$KEY_PATH"
    nginx -t
    systemctl enable --now nginx
    systemctl reload nginx
    install_renewal_hint
    update_app_env_https

    echo ""
    echo "HTTPS aktiv (Let's Encrypt standalone)."
    echo "  HTTP:  Port ${APP_PORT}"
    echo "  HTTPS: $(public_https_url)"
    echo "  Renewal: certbot renew (standalone, Port 80 nur bei Erneuerung)"
    ;;

  *)
    echo "Unbekannter HTTPS_MODE: $HTTPS_MODE (none|existing|letsencrypt)" >&2
    exit 1
    ;;
esac
