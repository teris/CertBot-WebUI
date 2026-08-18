#!/usr/bin/env bash
# Fängt „service certbot-agent …“ ab (inkl. log/update), sonst echtes service(8).
if [[ "${1:-}" == "certbot-agent" || "${1:-}" == "certbot-agend" ]]; then
  shift
  exec /usr/local/sbin/certbot-agent "$@"
fi
if [[ -x /usr/sbin/service ]]; then
  exec /usr/sbin/service "$@"
fi
if [[ -x /sbin/service ]]; then
  exec /sbin/service "$@"
fi
echo "service: Befehl nicht gefunden" >&2
exit 127
