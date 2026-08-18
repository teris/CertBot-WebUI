#!/usr/bin/env bash
set -euo pipefail
# Remove agent systemd service
if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root" >&2
  exit 1
fi
systemctl disable --now certbot-agent.service 2>/dev/null || true
rm -f /etc/systemd/system/certbot-agent.service
rm -f /usr/local/sbin/certbot-agent /etc/init.d/certbot-agent
if [[ -f /usr/local/bin/service ]] && grep -q 'certbot-agent' /usr/local/bin/service 2>/dev/null; then
  rm -f /usr/local/bin/service
fi
systemctl daemon-reload
rm -rf /opt/certbot-agent
rm -rf /etc/certbot-agent
rm -rf /var/lib/certbot-agent
echo "Agent entfernt."
