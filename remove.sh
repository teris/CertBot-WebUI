#!/usr/bin/env bash
# Remove CertBot WebUI systemd install (keeps DB backup optional).
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Bitte als root ausführen" >&2
  exit 1
fi

INSTALL_ROOT="${INSTALL_ROOT:-/opt/certbot-webui}"
SERVICE_USER="${SERVICE_USER:-certbot-webui}"
KEEP_DATA="${KEEP_DATA:-0}"

systemctl disable --now certbot-webui.service 2>/dev/null || true
systemctl disable --now certbot-webui-notify.timer 2>/dev/null || true
rm -f /etc/systemd/system/certbot-webui.service
rm -f /etc/systemd/system/certbot-webui-notify.service
rm -f /etc/systemd/system/certbot-webui-notify.timer
systemctl daemon-reload

# nginx-Site entfernen (nginx selbst bleibt)
rm -f /etc/nginx/sites-enabled/certbot-webui
rm -f /etc/nginx/sites-available/certbot-webui
if command -v nginx >/dev/null; then
  nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true
fi

if [[ "$KEEP_DATA" == "1" ]]; then
  rm -rf "$INSTALL_ROOT/app"
  echo "App entfernt, Daten unter $INSTALL_ROOT/data behalten."
else
  rm -rf "$INSTALL_ROOT"
  echo "Komplett entfernt: $INSTALL_ROOT"
fi

if id -u "$SERVICE_USER" >/dev/null 2>&1; then
  userdel "$SERVICE_USER" 2>/dev/null || true
fi

echo "Fertig."
