# One-time setup for CertBot WebUI dashboard on Windows (SQLite).
# Usage (from repo root):
#   .\dev-setup.ps1

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$WebDir = Join-Path $Root "apps\web"
$EnvFile = Join-Path $WebDir ".env"
$EnvExample = Join-Path $WebDir ".env.example"
$DataDir = Join-Path $WebDir "data"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js ist nicht installiert oder nicht im PATH. Bitte Node 20+ installieren."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm ist nicht im PATH."
}

$nodeMajor = [int]((node -v) -replace '^v','' -split '\.')[0]
if ($nodeMajor -lt 20) {
    Write-Error "Node.js 20+ erforderlich (gefunden: $(node -v))."
}

Set-Location $WebDir

if (-not (Test-Path $EnvFile)) {
    if (Test-Path $EnvExample) {
        Copy-Item $EnvExample $EnvFile
        Write-Host "Angelegt: apps\web\.env (aus .env.example)"
    } else {
        @"
DATABASE_URL="file:./data/certbot-webui.db"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="dev-secret-change-me-in-production"
INITIAL_ADMIN_EMAIL="admin@localhost"
INITIAL_ADMIN_PASSWORD="admin123"
"@ | Set-Content -Path $EnvFile -Encoding UTF8
        Write-Host "Angelegt: apps\web\.env (Defaults)"
    }
} else {
    Write-Host "Vorhanden: apps\web\.env (unverändert)"
}

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

# Ensure Prisma provider is sqlite for local Windows testing
node scripts\set-db-provider.mjs sqlite

Write-Host "npm install ..."
npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Datenbank (SQLite) einrichten ..."
npm run db:setup
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Setup fertig."
Write-Host "  Start:  .\dev-start.ps1"
Write-Host "  URL:    http://localhost:3000"
Write-Host "  Login:  siehe apps\web\.env (INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD)"
