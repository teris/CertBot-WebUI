# CertBot WebUI

Zentrale Verwaltung von **Let's Encrypt**- / **Certbot**-Zertifikaten über beliebig viele Server — ohne SSH zu den Nodes.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![Python](https://img.shields.io/badge/Agent-Python%203%20stdlib-3776AB?logo=python&logoColor=white)](./agent)

<p align="center">
  <img src="./docs/screenshots/02-overview.png" alt="CertBot WebUI – Übersicht" width="820" />
</p>

## Features

- **Dashboard** (Next.js): Nodes, Zertifikate, Jobs, Benutzer, Einstellungen
- **Agent** (Python, nur Stdlib + SQLite): Inventar alle 15 Min, Job-Polling, offline-fähig
- **Jobs:** Zertifikat erneuern, löschen oder hinzufügen — Logs im UI
- **Benachrichtigungen:** SMTP-E-Mail + Webhook (Ablauf, Offline, Job-Fehler)
- **Datenbank:** SQLite (Default), PostgreSQL oder MySQL
- **HTTPS ohne 80/443:** Installations-Port = HTTP, **Port+1** = HTTPS (Let's Encrypt standalone)

## Screenshots

Die Bilder liegen unter [`docs/screenshots/`](./docs/screenshots/) und werden unten direkt im README angezeigt.

<table>
  <tr>
    <td align="center" width="50%"><strong>Login</strong><br /><img src="./docs/screenshots/01-login.png" alt="Login" width="400" /></td>
    <td align="center" width="50%"><strong>Übersicht</strong><br /><img src="./docs/screenshots/02-overview.png" alt="Übersicht" width="400" /></td>
  </tr>
  <tr>
    <td align="center"><strong>Zertifikate</strong><br /><img src="./docs/screenshots/03-certificates.png" alt="Zertifikate" width="400" /></td>
    <td align="center"><strong>Nodes</strong><br /><img src="./docs/screenshots/04-nodes.png" alt="Nodes" width="400" /></td>
  </tr>
  <tr>
    <td align="center"><strong>Jobs</strong><br /><img src="./docs/screenshots/05-jobs.png" alt="Jobs" width="400" /></td>
    <td align="center"><strong>Einstellungen</strong><br /><img src="./docs/screenshots/06-settings.png" alt="Einstellungen" width="400" /></td>
  </tr>
</table>

## Architektur

```mermaid
flowchart LR
  subgraph Zentrale
    UI[Next.js Dashboard]
    DB[(SQLite / Postgres / MySQL)]
    UI --- DB
  end
  subgraph Node1[Server A]
    A1[certbot-agent]
    C1[certbot / let's encrypt]
    A1 --- C1
  end
  subgraph Node2[Server B]
    A2[certbot-agent]
    C2[certbot / let's encrypt]
    A2 --- C2
  end
  A1 -->|HTTPS Heartbeat / Inventory / Jobs| UI
  A2 -->|HTTPS Heartbeat / Inventory / Jobs| UI
```

Der Agent meldet sich per Token an der Zentrale an — **kein SSH** nötig. Bei konfiguriertem SSL nutzt der Agent automatisch die HTTPS-URL (Port+1).

## Voraussetzungen

| Komponente | Anforderung |
|------------|-------------|
| Zentrale | Linux (Debian/Ubuntu empfohlen) oder Windows für lokale Dev |
| Node.js | **20+** (`install.sh` installiert bei Bedarf Node 20) |
| Agent-Nodes | Python 3, optional `certbot` |
| Firewall | HTTP-Port + HTTPS-Port (Port+1); für LE kurz Port **80** bei Ausstellung/Renewal |

## Schnellstart — Windows (Entwicklung)

```powershell
.\dev-setup.ps1    # .env, SQLite, npm install, Seed
.\dev-start.ps1    # http://localhost:3000
```

Login (Default): `admin@localhost` / `admin123`

Optional Demo-Daten für Screenshots:

```powershell
cd apps\web
npx tsx prisma\seed-demo.ts
```

## Schnellstart — Linux (Produktion)

```bash
sudo ./install.sh
```

Interaktiv werden abgefragt: **Port**, Admin-E-Mail, Passwort und optional **HTTPS**.

Beispiel: Port `3000` → HTTP `:3000`, HTTPS `:3001`

```bash
# Später HTTPS nachrüsten
sudo ./enable-https.sh

# Update / Deinstallation
sudo ./update.sh
sudo ./remove.sh
# Daten behalten: KEEP_DATA=1 sudo ./remove.sh
```

### Nicht-interaktiv

```bash
sudo NONINTERACTIVE=1 \
  PORT=3000 \
  HTTPS_MODE=letsencrypt \
  HTTPS_DOMAIN="certs.example.com" \
  LETSENCRYPT_EMAIL="admin@example.com" \
  INITIAL_ADMIN_EMAIL="admin@example.com" \
  INITIAL_ADMIN_PASSWORD="sicheres-passwort" \
  ./install.sh
```

Andere Datenbanken:

```bash
sudo DB_TYPE=postgresql \
  DATABASE_URL="postgresql://user:pass@localhost:5432/certbot_webui" \
  ./install.sh
```

## Docker Compose (PostgreSQL)

```bash
export NEXTAUTH_SECRET="$(openssl rand -hex 32)"
export INITIAL_ADMIN_PASSWORD="sicheres-passwort"
docker compose up -d --build
```

Öffne http://localhost:3000

## Agent auf einem Zielserver

1. Im Dashboard unter **Nodes** einen Server anlegen
2. Den angezeigten Befehl auf dem Zielserver ausführen:

```bash
# Empfohlen bei HTTPS (Port+1):
curl -fsSL "https://certs.example.com:3001/api/public/agent/install?token=TOKEN" | sudo bash

# Oder per HTTP — das Install-Skript schreibt trotzdem die HTTPS-URL:
curl -fsSL "http://DASHBOARD-IP:3000/api/public/agent/install?token=TOKEN" | sudo bash
```

Die öffentliche URL kommt aus **Einstellungen → Öffentliche Dashboard-URL** bzw. `HTTPS_DOMAIN` / `HTTPS_PORT`. Agents ab Version **1.2.0** übernehmen eine geänderte HTTPS-URL automatisch beim Heartbeat.

Agent deinstallieren:

```bash
# Auf dem Node
sudo systemctl disable --now certbot-agent.service
sudo rm -f /etc/systemd/system/certbot-agent.service
sudo rm -rf /opt/certbot-agent /etc/certbot-agent /var/lib/certbot-agent
sudo systemctl daemon-reload
# Im Dashboard den Node löschen
```

## Projektstruktur

```
├── apps/web/          # Next.js Dashboard + Agent-API
├── agent/             # Python-Agent (Quelle)
├── deploy/nginx/      # nginx-Template für HTTPS auf Port+1
├── docs/screenshots/  # README-Screenshots
├── install.sh         # Produktion: Installation
├── update.sh          # Produktion: Update
├── enable-https.sh    # HTTPS nachrüsten
├── remove.sh          # Deinstallation
└── docker-compose.yml
```

## Umgebungsvariablen

| Variable | Bedeutung |
|----------|-----------|
| `DATABASE_URL` | Prisma-URL (`file:…`, `postgresql://…`, `mysql://…`) |
| `DB_TYPE` | `sqlite` \| `postgresql` \| `mysql` |
| `NEXTAUTH_URL` | Öffentliche URL der Zentrale |
| `NEXTAUTH_SECRET` | Session-Geheimnis |
| `PORT` / `HTTPS_PORT` | HTTP-Port / HTTPS-Port (meist Port+1) |
| `HTTPS_DOMAIN` | Domain für TLS / Agent-URL |
| `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` | Erst-Admin (Seed) |
| `CRON_SECRET` | Geheimnis für Notification-Checks |

DB-Engine wechseln:

```bash
cd apps/web
npm run db:provider -- postgresql
# DATABASE_URL anpassen, dann:
npm run db:setup
```

## Agent-API

Authentifizierung: `Authorization: Bearer <node-token>`

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| `POST` | `/api/agent/enroll` | Enrollment |
| `POST` | `/api/agent/heartbeat` | Heartbeat (+ `apiUrl`) |
| `POST` | `/api/agent/inventory` | Zertifikat-Inventar |
| `GET` | `/api/agent/jobs` | Offene Jobs |
| `POST` | `/api/agent/jobs/:id/status` | Job-Status / Logs |

Cron: `GET /api/notifications/check` mit Header `x-cron-secret: $CRON_SECRET`

## Sicherheit

- Node-Tokens werden nur gehasht gespeichert
- Agent akzeptiert nur Whitelist-Jobtypen (`renew` / `delete` / `add`)
- HTTPS zur Zentrale empfohlen (Port+1)
- Admin-Passwort und Secrets nach der Installation ändern

## Lizenz

[MIT](LICENSE)
