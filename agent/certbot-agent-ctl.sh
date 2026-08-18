#!/usr/bin/env bash
# CertBot-Agent Steuerung — auch als /etc/init.d/certbot-agent
# Nutzung:
#   certbot-agent status|log|restart|start|stop|update
#   service certbot-agent status|log|restart|start|stop|update
set -euo pipefail

SERVICE_NAME="certbot-agent"
UNIT="${SERVICE_NAME}.service"
CONFIG="${CERTBOT_AGENT_CONFIG:-/etc/certbot-agent/config.toml}"
AGENT_PY="${INSTALL_DIR:-/opt/certbot-agent}/agent.py"
UPDATE_SH="${INSTALL_DIR:-/opt/certbot-agent}/update.sh"

need_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "Bitte als root ausführen (sudo $0 $*)" >&2
    exit 1
  fi
}

read_config_value() {
  local key="$1"
  [[ -f "$CONFIG" ]] || return 0
  grep -E "^[[:space:]]*${key}[[:space:]]*=" "$CONFIG" | head -1 | sed -E "s/^[^=]+=[[:space:]]*//; s/^[\"']//; s/[\"']$//"
}

agent_version() {
  if [[ -f "$AGENT_PY" ]]; then
    python3 -c "import re,pathlib; t=pathlib.Path('$AGENT_PY').read_text(encoding='utf-8', errors='replace'); m=re.search(r'^VERSION\\s*=\\s*[\"\\']([^\"\\']+)', t, re.M); print(m.group(1) if m else '?')" 2>/dev/null || echo "?"
  else
    echo "?"
  fi
}

cmd_status() {
  local state="unknown"
  local pid="—"
  local since="—"
  if command -v systemctl >/dev/null; then
    if systemctl is-active --quiet "$UNIT"; then
      state="active (running)"
    elif systemctl is-failed --quiet "$UNIT" 2>/dev/null; then
      state="failed"
    elif systemctl is-enabled --quiet "$UNIT" 2>/dev/null; then
      state="inactive (dead)"
    else
      state="$(systemctl is-active "$UNIT" 2>/dev/null || echo unknown)"
    fi
    pid="$(systemctl show -p MainPID --value "$UNIT" 2>/dev/null || true)"
    [[ -z "$pid" || "$pid" == "0" ]] && pid="—"
    since="$(systemctl show -p ActiveEnterTimestamp --value "$UNIT" 2>/dev/null || true)"
    [[ -z "$since" ]] && since="—"
  fi

  echo "=== certbot-agent ==="
  echo "Status:     ${state}"
  echo "PID:        ${pid}"
  echo "Seit:       ${since}"
  echo "Version:    $(agent_version)"
  echo "Dashboard:  $(read_config_value api_url || echo —)"
  echo "Config:     ${CONFIG}"
  echo ""
  if command -v systemctl >/dev/null; then
    systemctl --no-pager --full status "$UNIT" 2>/dev/null | head -n 12 || true
  fi
}

cmd_log() {
  local n="${2:-20}"
  if ! [[ "$n" =~ ^[0-9]+$ ]]; then
    n=20
  fi
  echo "=== Letzte ${n} Logzeilen (certbot-agent) ==="
  journalctl -u "$UNIT" -n "$n" --no-pager -l || true
}

cmd_version() {
  echo "certbot-agent $(agent_version)"
}
  need_root "$@"
  systemctl restart "$UNIT"
  echo "Agent neu gestartet."
  cmd_status
}

cmd_start() {
  need_root "$@"
  systemctl start "$UNIT"
  echo "Agent gestartet."
}

cmd_stop() {
  need_root "$@"
  systemctl stop "$UNIT"
  echo "Agent gestoppt."
}

cmd_update() {
  need_root "$@"
  if [[ -x "$UPDATE_SH" ]]; then
    bash "$UPDATE_SH"
    return
  fi
  local api
  api="$(read_config_value api_url)"
  if [[ -z "$api" ]]; then
    echo "Keine api_url in ${CONFIG} — Update nicht möglich." >&2
    exit 1
  fi
  echo "==> Lade Update-Skript vom Dashboard ..."
  if command -v curl >/dev/null; then
    curl -fsSL "${api%/}/agent/update.sh" | bash
  else
    wget -qO- "${api%/}/agent/update.sh" | bash
  fi
}

usage() {
  cat <<EOF
CertBot WebUI Agent

Nutzung:
  certbot-agent status
  certbot-agent version
  certbot-agent log [Anzahl]
  certbot-agent restart
  certbot-agent start
  certbot-agent stop
  certbot-agent update

Gleichwertig (init-Skript):
  service certbot-agent status
  service certbot-agent version
  service certbot-agent log
  service certbot-agent restart
  service certbot-agent update
EOF
}

# systemd „service NAME CMD“ ruft /etc/init.d/NAME CMD auf, falls vorhanden.
# Unter reinem systemctl existiert kein Verb „log“ — daher dieses Skript.
action="${1:-status}"
case "$action" in
  status) cmd_status ;;
  version|--version|-V) cmd_version ;;
  log|logs) cmd_log "$@" ;;
  restart) cmd_restart "$@" ;;
  start) cmd_start "$@" ;;
  stop) cmd_stop "$@" ;;
  update|upgrade) cmd_update "$@" ;;
  -h|--help|help) usage ;;
  *)
    echo "Unbekannter Befehl: $action" >&2
    usage >&2
    exit 1
    ;;
esac
