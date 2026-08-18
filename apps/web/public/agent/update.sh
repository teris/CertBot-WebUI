#!/usr/bin/env bash
# Agent vom Dashboard aktualisieren — Config/Token bleiben erhalten.
# Nutzung:
#   sudo /opt/certbot-agent/update.sh
#   curl -fsSL "https://DASHBOARD/agent/update.sh" | sudo bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Bitte als root ausführen" >&2
  exit 1
fi

INSTALL_DIR="${INSTALL_DIR:-/opt/certbot-agent}"
CONFIG_DIR="${CONFIG_DIR:-/etc/certbot-agent}"
CONFIG="${CERTBOT_AGENT_CONFIG:-$CONFIG_DIR/config.toml}"
SERVICE_UNIT="/etc/systemd/system/certbot-agent.service"
CTL_BIN="/usr/local/sbin/certbot-agent"
INITD="/etc/init.d/certbot-agent"

read_config_value() {
  local key="$1"
  [[ -f "$CONFIG" ]] || return 0
  grep -E "^[[:space:]]*${key}[[:space:]]*=" "$CONFIG" | head -1 | sed -E "s/^[^=]+=[[:space:]]*//; s/^[\"']//; s/[\"']$//"
}

API_URL="${CERTBOT_AGENT_API_URL:-$(read_config_value api_url)}"
API_URL="${API_URL%/}"

if [[ -z "$API_URL" ]]; then
  echo "Keine Dashboard-URL. Setze CERTBOT_AGENT_API_URL oder installiere den Agent zuerst." >&2
  exit 1
fi

if [[ ! -f "$CONFIG" ]]; then
  echo "Config fehlt: $CONFIG — bitte zuerst den Agent installieren." >&2
  exit 1
fi

download() {
  local url="$1"
  local out="$2"
  local tmp="${out}.new"
  mkdir -p "$(dirname "$out")"
  if command -v curl >/dev/null; then
    curl -fsSL "$url" -o "$tmp"
  elif command -v wget >/dev/null; then
    wget -qO "$tmp" "$url"
  else
    echo "curl oder wget erforderlich" >&2
    exit 1
  fi
  mv -f "$tmp" "$out"
}

echo "==> CertBot-Agent Update"
echo "    Dashboard: ${API_URL}"

mkdir -p "$INSTALL_DIR" "$CONFIG_DIR" /usr/local/sbin /usr/local/bin /etc/init.d

echo "==> Lade Dateien"
download "${API_URL}/agent/agent.py" "$INSTALL_DIR/agent.py"
download "${API_URL}/agent/certbot-agent.service" "$SERVICE_UNIT"
download "${API_URL}/agent/certbot-agent-ctl.sh" "$CTL_BIN"
download "${API_URL}/agent/update.sh" "$INSTALL_DIR/update.sh"
download "${API_URL}/agent/service-wrapper.sh" /usr/local/bin/service.new
chmod 755 "$INSTALL_DIR/agent.py" "$CTL_BIN" "$INSTALL_DIR/update.sh"
cp -f "$CTL_BIN" "$INITD"
chmod 755 "$INITD"
if [[ ! -e /usr/local/bin/service ]] || grep -q 'certbot-agent' /usr/local/bin/service 2>/dev/null; then
  mv -f /usr/local/bin/service.new /usr/local/bin/service
  chmod 755 /usr/local/bin/service
else
  rm -f /usr/local/bin/service.new
fi

if ! grep -q '^VERSION' "$INSTALL_DIR/agent.py"; then
  echo "FEHLER: agent.py sieht ungültig aus." >&2
  exit 1
fi

NEW_VER="$(python3 -c "import re,pathlib; t=pathlib.Path('$INSTALL_DIR/agent.py').read_text(encoding='utf-8', errors='replace'); m=re.search(r'^VERSION\\s*=\\s*[\"\\']([^\"\\']+)', t, re.M); print(m.group(1) if m else '?')" 2>/dev/null || echo "?")"

systemctl daemon-reload
systemctl enable certbot-agent.service >/dev/null 2>&1 || true
systemctl restart certbot-agent.service

ok=0
for i in 1 2 3 4 5 6 7 8; do
  sleep 1
  if systemctl is-active --quiet certbot-agent.service; then
    ok=1
    break
  fi
done

echo ""
if [[ "$ok" -eq 1 ]]; then
  echo "OK: Agent ${NEW_VER} läuft."
  echo "    Befehle: service certbot-agent status | version | log | restart | update"
else
  echo "FEHLER: Agent-Dienst ist nicht aktiv." >&2
  journalctl -u certbot-agent.service -n 20 --no-pager >&2 || true
  exit 1
fi
