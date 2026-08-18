#!/usr/bin/env bash
set -euo pipefail

# Install CertBot WebUI Agent — Python stdlib only (sqlite3), no pip/venv.
# Usage:
#   sudo CERTBOT_AGENT_API_URL=https://central CERTBOT_AGENT_TOKEN=xxx ./install.sh

API_URL="${CERTBOT_AGENT_API_URL:-}"
TOKEN="${CERTBOT_AGENT_TOKEN:-}"
INSTALL_DIR="${INSTALL_DIR:-/opt/certbot-agent}"
CONFIG_DIR="${CONFIG_DIR:-/etc/certbot-agent}"
DATA_DIR="${DATA_DIR:-/var/lib/certbot-agent}"

if [[ -z "$API_URL" || -z "$TOKEN" ]]; then
  echo "Set CERTBOT_AGENT_API_URL and CERTBOT_AGENT_TOKEN" >&2
  exit 1
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Bitte als root ausführen" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> CertBot-Agent wird installiert"
echo "    Dashboard: ${API_URL}"

if ! command -v python3 >/dev/null; then
  if command -v apt-get >/dev/null; then
    apt-get update -y
    apt-get install -y python3
  else
    echo "python3 is required" >&2
    exit 1
  fi
fi

echo "==> Stoppe ggf. alten Agent-Dienst"
systemctl stop certbot-agent.service 2>/dev/null || true
sleep 1

mkdir -p "$INSTALL_DIR" "$CONFIG_DIR" "$DATA_DIR"
cp "$SCRIPT_DIR/agent.py" "$INSTALL_DIR/agent.py"
chmod 755 "$INSTALL_DIR/agent.py"
if [[ -f "$SCRIPT_DIR/update.sh" ]]; then
  cp "$SCRIPT_DIR/update.sh" "$INSTALL_DIR/update.sh"
  chmod 755 "$INSTALL_DIR/update.sh"
fi

install_cli() {
  local ctl_src="${SCRIPT_DIR}/certbot-agent-ctl.sh"
  if [[ ! -f "$ctl_src" ]]; then
    return 0
  fi
  mkdir -p /usr/local/sbin /usr/local/bin /etc/init.d
  cp "$ctl_src" /usr/local/sbin/certbot-agent
  chmod 755 /usr/local/sbin/certbot-agent
  cp /usr/local/sbin/certbot-agent /etc/init.d/certbot-agent
  chmod 755 /etc/init.d/certbot-agent
  if [[ -f "$SCRIPT_DIR/service-wrapper.sh" ]]; then
    if [[ ! -e /usr/local/bin/service ]] || grep -q 'certbot-agent' /usr/local/bin/service 2>/dev/null; then
      cp "$SCRIPT_DIR/service-wrapper.sh" /usr/local/bin/service
      chmod 755 /usr/local/bin/service
    fi
  fi
}
install_cli

cat > "$CONFIG_DIR/config.toml" <<EOF
api_url = "${API_URL}"
token = "${TOKEN}"
inventory_interval = 900
job_interval = 15
letsencrypt_live = "/etc/letsencrypt/live"
certbot_bin = "certbot"
db_path = "${DATA_DIR}/agent.db"
EOF
chmod 600 "$CONFIG_DIR/config.toml"

cp "$SCRIPT_DIR/certbot-agent.service" /etc/systemd/system/certbot-agent.service

echo "==> Starte Agent-Dienst (Enrollment erfolgt automatisch)"
systemctl daemon-reload
systemctl enable certbot-agent.service >/dev/null
systemctl restart certbot-agent.service

ok=0
for i in 1 2 3 4 5; do
  sleep 1
  if systemctl is-active --quiet certbot-agent.service; then
    ok=1
    break
  fi
done

echo ""
if [[ "$ok" -eq 1 ]]; then
  echo "OK: Agent läuft."
  echo "    Dashboard: ${API_URL}"
  echo "    Befehle:   service certbot-agent status | version | log | restart | update"
else
  echo "FEHLER: Agent-Dienst ist nicht aktiv." >&2
  journalctl -u certbot-agent.service -n 20 --no-pager >&2 || true
  exit 1
fi

if ! command -v certbot >/dev/null && [[ ! -x /usr/bin/certbot ]]; then
  echo ""
  echo "Hinweis: certbot fehlt — Inventar ggf. über /etc/letsencrypt/live."
fi

echo ""
echo "Letzte Agent-Logs:"
journalctl -u certbot-agent.service -n 8 --no-pager -q || true
echo ""
echo "Fertig."
