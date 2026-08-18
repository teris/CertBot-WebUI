# Changelog

All notable changes to CertBot WebUI are documented here.  
Alle wesentlichen Änderungen an CertBot WebUI werden hier festgehalten.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)  
Versioning: Agent `VERSION` (currently **1.3.3**).

---

## [1.3.3] — 2026-08-18

### English

#### Added
- `service certbot-agent version` (also `certbot-agent version` / `-V` / `--version`)

### Deutsch

#### Hinzugefügt
- `service certbot-agent version` (auch `certbot-agent version` / `-V` / `--version`)

---

## [1.3.2] — 

### English

#### Changed
- Agent logs no longer dump nginx HTML or Python tracebacks on 502/timeouts
- Transient dashboard outages are logged as a short warning, at most every 2 minutes

### Deutsch

#### Geändert
- Agent-Logs enthalten bei 502/Timeouts kein nginx-HTML und keine Python-Tracebacks mehr
- Vorübergehende Dashboard-Ausfälle erscheinen als kurze Warnung, höchstens alle 2 Minuten

---

## [1.3.1] — 

### English

#### Added
- Agent journal (last 20 lines) is shown on the node page in the dashboard
- **Protokoll** page: log of e-mail/webhook sends (sent / skipped / failed)
- Offline alerts: **one** mail when a previously online agent goes down; **no repeats** while it stays down; **one** mail when it comes back
- Newly added agents that enroll immediately do not trigger an e-mail
- Settings: offline e-mail delay selectable (15 / 30 / 45 / 60 minutes)

### Deutsch

#### Hinzugefügt
- Agent-Journal (letzte 20 Zeilen) auf der Node-Seite im Dashboard
- Seite **Protokoll**: Verlauf der E-Mail-/Webhook-Versände (gesendet / übersprungen / fehlgeschlagen)
- Offline-Alarm: **eine** Mail, wenn ein zuvor online gemeldeter Agent ausfällt; **keine Wiederholung**, solange er down bleibt; **eine** Mail bei Wiederkehr
- Neu angelegte Agents, die sofort enrollen, lösen keine Mail aus
- Einstellung: Wartezeit bis zur Offline-Mail (15 / 30 / 45 / 60 Minuten)

---

## [1.3.0] — 

### English

#### Added
- Agent CLI and `service` commands on each node:
  - `service certbot-agent status` — running state, PID, version, dashboard URL
  - `service certbot-agent log` — last 20 journal lines (`log 50` for more)
  - `service certbot-agent restart`
  - `service certbot-agent update` — pull latest files from the dashboard (config/token kept)
- `agent/update.sh` — one-shot upgrade: `curl -fsSL "https://DASHBOARD/agent/update.sh" | sudo bash`
- Dashboard: **Update agent**, **Restart agent**, and **Update all agents** (job types `update` / `restart`)
- Remote self-update: agent downloads `agent.py`, unit file, and CLI from the dashboard, then restarts

#### Fixed
- Dashboard no longer crashes when a node is offline and an automated e-mail is sent (nodemailer unhandled `error` events, SMTP/webhook timeouts)

#### Changed
- Agents older than 1.3.0 must run `update.sh` once; afterwards updates can be triggered from the Web UI

### Deutsch

#### Hinzugefügt
- Agent-CLI und `service`-Befehle auf jedem Node:
  - `service certbot-agent status` — Zustand, PID, Version, Dashboard-URL
  - `service certbot-agent log` — letzte 20 Logzeilen (`log 50` für mehr)
  - `service certbot-agent restart`
  - `service certbot-agent update` — Dateien vom Dashboard neu laden (Config/Token bleiben)
- `agent/update.sh` — einmaliges Upgrade: `curl -fsSL "https://DASHBOARD/agent/update.sh" | sudo bash`
- Dashboard: **Agent aktualisieren**, **Agent neu starten** und **Alle Agents aktualisieren** (Job-Typen `update` / `restart`)
- Remote-Selbstupdate: Agent lädt `agent.py`, Unit-Datei und CLI vom Dashboard und startet neu

#### Behoben
- Dashboard stürzt nicht mehr ab, wenn eine Node offline ist und eine automatische E-Mail versendet wird (unbehandelte nodemailer-`error`-Events, Timeouts für SMTP/Webhook)

#### Geändert
- Agents älter als 1.3.0 müssen einmalig `update.sh` ausführen; danach sind Updates über das WebUI möglich

---

## [1.2.0] — 

### English

#### Added
- HTTPS without occupying 80/443: install port = HTTP, **port+1** = HTTPS (existing cert or Let’s Encrypt standalone)
- Enroll/heartbeat return canonical `apiUrl`; agents persist HTTPS URL in `config.toml`
- GitHub-ready README with screenshots, MIT license
- Docker: `.dockerignore` and builder copy order so host `node_modules` cannot overwrite Linux deps

#### Changed
- `update.sh` no longer overwrites an HTTPS `NEXTAUTH_URL` with HTTP
- Public dashboard URL prefers `HTTPS_DOMAIN` / `HTTPS_PORT` (and settings)

### Deutsch

#### Hinzugefügt
- HTTPS ohne Belegung von 80/443: Installations-Port = HTTP, **Port+1** = HTTPS (vorhandenes Zertifikat oder Let’s Encrypt standalone)
- Enroll/Heartbeat liefern die kanonische `apiUrl`; Agents speichern die HTTPS-URL in `config.toml`
- GitHub-README mit Screenshots, MIT-Lizenz
- Docker: `.dockerignore` und Builder-Reihenfolge, damit Host-`node_modules` die Linux-Module nicht überschreiben

#### Geändert
- `update.sh` überschreibt eine HTTPS-`NEXTAUTH_URL` nicht mehr mit HTTP
- Öffentliche Dashboard-URL bevorzugt `HTTPS_DOMAIN` / `HTTPS_PORT` (und Einstellungen)

---

## [1.1.1] — 

### English

#### Fixed
- Agent enrollment no longer races systemd (SQLite `database is locked`)
- Certbot binary discovery; clearer install output

### Deutsch

#### Behoben
- Agent-Enrollment läuft nicht mehr parallel zum systemd-Start (SQLite `database is locked`)
- Auffinden der Certbot-Binary; klarere Installationsausgaben

---

## [1.0.0] — 

### English

#### Added
- Initial release: Next.js dashboard, Python stdlib agent, jobs (renew/delete/add), e-mail + webhook notifications, SQLite/PostgreSQL/MySQL, `install.sh` / `update.sh` / Docker Compose

### Deutsch

#### Hinzugefügt
- Erstes Release: Next.js-Dashboard, Python-Agent (nur Stdlib), Jobs (renew/delete/add), E-Mail- + Webhook-Benachrichtigungen, SQLite/PostgreSQL/MySQL, `install.sh` / `update.sh` / Docker Compose
