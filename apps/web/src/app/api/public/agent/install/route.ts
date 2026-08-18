import { NextRequest, NextResponse } from "next/server";
import { resolvePublicBaseUrl } from "@/lib/base-url";

/** Public bootstrap installer — embeds dashboard URL + enrollment token. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();
  if (!token || token.length < 16) {
    return new NextResponse("Missing or invalid ?token=\n", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const baseUrl = await resolvePublicBaseUrl(req);
  const script = `#!/usr/bin/env bash
set -euo pipefail
# CertBot WebUI Agent — Installation
# Dashboard: ${baseUrl}

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Fehler: bitte als root ausführen (sudo bash)." >&2
  exit 1
fi

API_URL="${baseUrl}"
TOKEN="${token}"
INSTALL_DIR="\${INSTALL_DIR:-/opt/certbot-agent}"
CONFIG_DIR="\${CONFIG_DIR:-/etc/certbot-agent}"
DATA_DIR="\${DATA_DIR:-/var/lib/certbot-agent}"

echo "==> CertBot-Agent wird installiert"
echo "    Dashboard: \${API_URL}"

if ! command -v python3 >/dev/null; then
  if command -v apt-get >/dev/null; then
    echo "==> Installiere python3 ..."
    apt-get update -y
    apt-get install -y python3 curl ca-certificates
  else
    echo "Fehler: python3 fehlt." >&2
    exit 1
  fi
fi

if ! command -v curl >/dev/null && ! command -v wget >/dev/null; then
  apt-get update -y && apt-get install -y curl || true
fi

download() {
  local url="\$1"
  local out="\$2"
  if command -v curl >/dev/null; then
    curl -fsSL "\$url" -o "\$out"
  else
    wget -qO "\$out" "\$url"
  fi
}

echo "==> Stoppe ggf. alten Agent-Dienst"
systemctl stop certbot-agent.service 2>/dev/null || true
sleep 1

mkdir -p "\$INSTALL_DIR" "\$CONFIG_DIR" "\$DATA_DIR" /usr/local/sbin /usr/local/bin /etc/init.d

echo "==> Lade Agent-Dateien vom Dashboard"
download "\${API_URL}/agent/agent.py" "\$INSTALL_DIR/agent.py"
download "\${API_URL}/agent/certbot-agent.service" /etc/systemd/system/certbot-agent.service
download "\${API_URL}/agent/update.sh" "\$INSTALL_DIR/update.sh"
download "\${API_URL}/agent/certbot-agent-ctl.sh" /usr/local/sbin/certbot-agent
chmod 755 "\$INSTALL_DIR/agent.py" "\$INSTALL_DIR/update.sh" /usr/local/sbin/certbot-agent
mkdir -p /etc/init.d /usr/local/bin
cp -f /usr/local/sbin/certbot-agent /etc/init.d/certbot-agent
chmod 755 /etc/init.d/certbot-agent
download "\${API_URL}/agent/service-wrapper.sh" /usr/local/bin/service.new
if [[ ! -e /usr/local/bin/service ]] || grep -q 'certbot-agent' /usr/local/bin/service 2>/dev/null; then
  mv -f /usr/local/bin/service.new /usr/local/bin/service
  chmod 755 /usr/local/bin/service
else
  rm -f /usr/local/bin/service.new
fi

cat > "\$CONFIG_DIR/config.toml" <<EOF
api_url = "\${API_URL}"
token = "\${TOKEN}"
inventory_interval = 900
job_interval = 15
letsencrypt_live = "/etc/letsencrypt/live"
certbot_bin = "certbot"
db_path = "\${DATA_DIR}/agent.db"
EOF
chmod 600 "\$CONFIG_DIR/config.toml"

echo "==> Starte Agent-Dienst (Enrollment erfolgt automatisch)"
systemctl daemon-reload
systemctl enable certbot-agent.service >/dev/null
systemctl restart certbot-agent.service

# Kurz warten und Status prüfen
ok=0
for i in 1 2 3 4 5; do
  sleep 1
  if systemctl is-active --quiet certbot-agent.service; then
    ok=1
    break
  fi
done

echo ""
if [[ "\$ok" -eq 1 ]]; then
  echo "OK: Agent läuft."
  echo "    Dashboard: \${API_URL}"
  echo "    Dienst:    certbot-agent.service"
  echo "    Befehle:   service certbot-agent status | log | restart | update"
else
  echo "FEHLER: Agent-Dienst ist nicht aktiv." >&2
  echo "Letzte Logzeilen:" >&2
  journalctl -u certbot-agent.service -n 20 --no-pager >&2 || true
  exit 1
fi

if ! command -v certbot >/dev/null && [[ ! -x /usr/bin/certbot ]]; then
  echo ""
  echo "Hinweis: certbot ist nicht installiert."
  echo "  Inventar nutzt /etc/letsencrypt/live (falls vorhanden)."
  echo "  Für renew/add/delete: apt-get install -y certbot"
fi

echo ""
echo "Letzte Agent-Logs:"
journalctl -u certbot-agent.service -n 8 --no-pager -q || true
echo ""
echo "Fertig."
`;

  return new NextResponse(script, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": 'inline; filename="certbot-agent-install.sh"',
      "Cache-Control": "no-store",
    },
  });
}
