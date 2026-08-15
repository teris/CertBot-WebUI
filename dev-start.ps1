# Start CertBot WebUI dashboard (Next.js dev server) on Windows.
# Usage (from repo root):
#   .\dev-start.ps1

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$WebDir = Join-Path $Root "apps\web"
$EnvFile = Join-Path $WebDir ".env"
$Port = if ($env:PORT) { $env:PORT } else { "3000" }

if (-not (Test-Path (Join-Path $WebDir "package.json"))) {
    Write-Error "apps\web nicht gefunden. Bitte aus dem Repo-Root ausführen."
}

if (-not (Test-Path $EnvFile)) {
    Write-Error "apps\web\.env fehlt. Zuerst .\dev-setup.ps1 ausführen."
}

$DataDir = Join-Path $WebDir "data"
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

Set-Location $WebDir
Write-Host "Starte Dashboard auf http://localhost:$Port ..."
npm run dev -- --port $Port
