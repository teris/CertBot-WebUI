"""CertBot WebUI Agent — stdlib only (sqlite3 + urllib), no pip packages."""

from __future__ import annotations

import argparse
import json
import logging
import os
import platform
import re
import shutil
import socket
import sqlite3
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

VERSION = "1.2.0"
logger = logging.getLogger("certbot-agent")

_SSL_CTX = ssl.create_default_context()


def persist_api_url(config_path: str | None, api_url: str) -> None:
    """Schreibe api_url zurück in die Config (z.B. nach HTTPS-Umschaltung)."""
    if not config_path:
        return
    path = Path(config_path)
    if not path.exists():
        return
    lines = path.read_text(encoding="utf-8").splitlines()
    out: list[str] = []
    found = False
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("api_url") and "=" in stripped:
            out.append(f'api_url = "{api_url}"')
            found = True
        else:
            out.append(line)
    if not found:
        out.insert(0, f'api_url = "{api_url}"')
    path.write_text("\n".join(out) + "\n", encoding="utf-8")
    logger.info("api_url in %s aktualisiert: %s", config_path, api_url)


def load_config(path: str | None) -> dict[str, Any]:
    cfg: dict[str, Any] = {
        "api_url": os.environ.get("CERTBOT_AGENT_API_URL", "").rstrip("/"),
        "token": os.environ.get("CERTBOT_AGENT_TOKEN", ""),
        "inventory_interval": int(os.environ.get("CERTBOT_AGENT_INVENTORY_INTERVAL", "900")),
        "job_interval": int(os.environ.get("CERTBOT_AGENT_JOB_INTERVAL", "15")),
        "letsencrypt_live": os.environ.get("CERTBOT_LE_LIVE", "/etc/letsencrypt/live"),
        "certbot_bin": os.environ.get("CERTBOT_BIN", "certbot"),
        "db_path": os.environ.get("CERTBOT_AGENT_DB", "/var/lib/certbot-agent/agent.db"),
    }
    if path and Path(path).exists():
        text = Path(path).read_text(encoding="utf-8")
        for line in text.splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key in ("api_url", "token", "letsencrypt_live", "certbot_bin", "db_path"):
                cfg[key] = val
            elif key in ("inventory_interval", "job_interval"):
                cfg[key] = int(val)
    if not cfg["api_url"] or not cfg["token"]:
        raise SystemExit("api_url and token are required (config or env)")
    return cfg


class LocalStore:
    """Local SQLite cache — no external DB server needed on the node."""

    def __init__(self, path: str) -> None:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self.conn = sqlite3.connect(path, check_same_thread=False, timeout=60.0)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA busy_timeout=60000")
        self._migrate()

    def _migrate(self) -> None:
        self.conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS meta (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS certificates (
              lineage_name TEXT PRIMARY KEY,
              primary_domain TEXT NOT NULL,
              domains_json TEXT NOT NULL,
              not_before TEXT,
              not_after TEXT,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS jobs (
              id TEXT PRIMARY KEY,
              type TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              status TEXT NOT NULL,
              log TEXT NOT NULL DEFAULT '',
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS outbox (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              kind TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              created_at TEXT NOT NULL,
              attempts INTEGER NOT NULL DEFAULT 0
            );
            """
        )
        self.conn.commit()

    def get_meta(self, key: str, default: str | None = None) -> str | None:
        row = self.conn.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default

    def set_meta(self, key: str, value: str) -> None:
        self.conn.execute(
            "INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
        self.conn.commit()

    def save_certificates(self, certs: list[dict[str, Any]]) -> None:
        now = datetime.now(timezone.utc).isoformat()
        self.conn.execute("DELETE FROM certificates")
        for c in certs:
            self.conn.execute(
                """
                INSERT INTO certificates(lineage_name, primary_domain, domains_json, not_before, not_after, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    c["lineageName"],
                    c["primaryDomain"],
                    json.dumps(c["domains"]),
                    c.get("notBefore"),
                    c.get("notAfter"),
                    now,
                ),
            )
        self.set_meta("last_inventory_at", now)
        self.conn.commit()

    def list_certificates(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT * FROM certificates ORDER BY lineage_name").fetchall()
        return [
            {
                "lineageName": r["lineage_name"],
                "primaryDomain": r["primary_domain"],
                "domains": json.loads(r["domains_json"]),
                "notBefore": r["not_before"],
                "notAfter": r["not_after"],
            }
            for r in rows
        ]

    def upsert_job(self, job_id: str, job_type: str, payload: dict[str, Any], status: str, log: str = "") -> None:
        now = datetime.now(timezone.utc).isoformat()
        self.conn.execute(
            """
            INSERT INTO jobs(id, type, payload_json, status, log, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              status = excluded.status,
              log = excluded.log,
              updated_at = excluded.updated_at
            """,
            (job_id, job_type, json.dumps(payload), status, log, now),
        )
        self.conn.commit()

    def append_job_log(self, job_id: str, chunk: str, status: str | None = None) -> str:
        row = self.conn.execute("SELECT log, status FROM jobs WHERE id = ?", (job_id,)).fetchone()
        log = (row["log"] if row else "") + chunk
        if len(log) > 200_000:
            log = log[-200_000:]
        st = status or (row["status"] if row else "running")
        now = datetime.now(timezone.utc).isoformat()
        self.conn.execute(
            "UPDATE jobs SET log = ?, status = ?, updated_at = ? WHERE id = ?",
            (log, st, now, job_id),
        )
        self.conn.commit()
        return log

    def enqueue_outbox(self, kind: str, payload: dict[str, Any]) -> None:
        self.conn.execute(
            "INSERT INTO outbox(kind, payload_json, created_at) VALUES (?, ?, ?)",
            (kind, json.dumps(payload), datetime.now(timezone.utc).isoformat()),
        )
        self.conn.commit()

    def list_outbox(self, limit: int = 20) -> list[sqlite3.Row]:
        return self.conn.execute(
            "SELECT * FROM outbox ORDER BY id ASC LIMIT ?",
            (limit,),
        ).fetchall()

    def delete_outbox(self, row_id: int) -> None:
        self.conn.execute("DELETE FROM outbox WHERE id = ?", (row_id,))
        self.conn.commit()

    def bump_outbox(self, row_id: int) -> None:
        self.conn.execute("UPDATE outbox SET attempts = attempts + 1 WHERE id = ?", (row_id,))
        self.conn.commit()


def parse_certbot_certificates(output: str) -> list[dict[str, Any]]:
    certs: list[dict[str, Any]] = []
    blocks = re.split(r"\n\s*Certificate Name:\s*", output)
    for block in blocks[1:]:
        lines = block.strip().splitlines()
        if not lines:
            continue
        name = lines[0].strip()
        domains: list[str] = []
        not_after = None
        for line in lines[1:]:
            if "Domains:" in line:
                domains = line.split("Domains:", 1)[1].strip().split()
            elif "Expiry Date:" in line:
                raw = line.split("Expiry Date:", 1)[1].strip()
                raw = re.sub(r"\s*\(.*\)$", "", raw).strip()
                for fmt in ("%Y-%m-%d %H:%M:%S%z", "%Y-%m-%d %H:%M:%S%Z", "%Y-%m-%d %H:%M:%S"):
                    try:
                        dt = datetime.strptime(raw.replace(" UTC", "+0000"), fmt)
                        if dt.tzinfo is None:
                            dt = dt.replace(tzinfo=timezone.utc)
                        not_after = dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
                        break
                    except ValueError:
                        continue
        if not domains:
            domains = [name]
        certs.append(
            {
                "lineageName": name,
                "primaryDomain": domains[0],
                "domains": domains,
                "notBefore": None,
                "notAfter": not_after,
            }
        )
    return certs


def _openssl_dates(pem: Path) -> tuple[str | None, str | None]:
    """Parse notBefore/notAfter via openssl (usually already on cert hosts)."""
    try:
        proc = subprocess.run(
            ["openssl", "x509", "-in", str(pem), "-noout", "-dates"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if proc.returncode != 0:
            return None, None
        not_before = not_after = None
        for line in proc.stdout.splitlines():
            if line.startswith("notBefore="):
                not_before = _parse_openssl_date(line.split("=", 1)[1].strip())
            elif line.startswith("notAfter="):
                not_after = _parse_openssl_date(line.split("=", 1)[1].strip())
        return not_before, not_after
    except Exception:
        return None, None


def _parse_openssl_date(raw: str) -> str | None:
    # e.g. Mar 15 12:00:00 2026 GMT
    for fmt in ("%b %d %H:%M:%S %Y %Z", "%b %d %H:%M:%S %Y GMT"):
        try:
            dt = datetime.strptime(raw, fmt)
            return dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
        except ValueError:
            continue
    return None


def _openssl_sans(pem: Path) -> list[str]:
    try:
        proc = subprocess.run(
            ["openssl", "x509", "-in", str(pem), "-noout", "-text"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if proc.returncode != 0:
            return []
        domains: list[str] = []
        for line in proc.stdout.splitlines():
            if "DNS:" in line:
                for part in line.split(","):
                    part = part.strip()
                    if part.startswith("DNS:"):
                        domains.append(part[4:].strip())
        return domains
    except Exception:
        return []


def scan_live_dir(live_dir: str) -> list[dict[str, Any]]:
    root = Path(live_dir)
    if not root.is_dir():
        return []
    certs: list[dict[str, Any]] = []
    for entry in sorted(root.iterdir()):
        if not entry.is_dir() or entry.name.startswith("."):
            continue
        pem = entry / "cert.pem"
        if not pem.exists():
            pem = entry / "fullchain.pem"
        if not pem.exists():
            continue
        domains = _openssl_sans(pem) or [entry.name]
        not_before, not_after = _openssl_dates(pem)
        certs.append(
            {
                "lineageName": entry.name,
                "primaryDomain": domains[0],
                "domains": domains,
                "notBefore": not_before,
                "notAfter": not_after,
            }
        )
    return certs


def resolve_certbot_bin(configured: str) -> str | None:
    """Find certbot binary; return None if not installed (still OK for inventory via PEM scan)."""
    if configured and configured != "certbot":
        path = Path(configured)
        if path.is_file() and os.access(path, os.X_OK):
            return str(path)
    found = shutil.which(configured or "certbot")
    if found:
        return found
    for candidate in ("/usr/bin/certbot", "/usr/local/bin/certbot", "/snap/bin/certbot"):
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return None


def collect_inventory(cfg: dict[str, Any]) -> list[dict[str, Any]]:
    certs: list[dict[str, Any]] = []
    certbot = resolve_certbot_bin(str(cfg.get("certbot_bin") or "certbot"))
    if certbot:
        cfg["certbot_bin"] = certbot
        try:
            proc = subprocess.run(
                [certbot, "certificates"],
                capture_output=True,
                text=True,
                timeout=60,
            )
            if proc.returncode == 0:
                certs = parse_certbot_certificates(proc.stdout + "\n" + proc.stderr)
            else:
                logger.warning("certbot certificates exit %s: %s", proc.returncode, (proc.stderr or "")[:500])
        except Exception as exc:
            logger.warning("certbot certificates failed: %s", exc)
    else:
        logger.info("certbot nicht gefunden — Inventar nur über %s", cfg.get("letsencrypt_live"))
    if not certs:
        certs = scan_live_dir(cfg["letsencrypt_live"])
    return certs


class AgentClient:
    def __init__(self, cfg: dict[str, Any], store: LocalStore, config_path: str | None = None) -> None:
        self.cfg = cfg
        self.store = store
        self.config_path = config_path
        self.base = cfg["api_url"].rstrip("/")
        self.token = cfg["token"]

    def apply_api_url(self, api_url: str | None) -> None:
        """Übernimmt die kanonische Dashboard-URL (z.B. https://host:3001)."""
        if not api_url or not isinstance(api_url, str):
            return
        url = api_url.strip().rstrip("/")
        if not url or url == self.base:
            return
        # Nur gültige absolute URLs annehmen
        if not (url.startswith("https://") or url.startswith("http://")):
            return
        logger.info("Dashboard-API-URL wechselt: %s → %s", self.base, url)
        self.base = url
        self.cfg["api_url"] = url
        persist_api_url(self.config_path, url)

    def _request(self, method: str, path: str, body: dict[str, Any] | None = None) -> Any:
        url = f"{self.base}{path}"
        data = None
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json",
            "User-Agent": f"certbot-agent/{VERSION}",
        }
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            ctx = _SSL_CTX if url.startswith("https://") else None
            with urllib.request.urlopen(req, timeout=60, context=ctx) as resp:
                raw = resp.read().decode("utf-8")
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"HTTP {exc.code} {path}: {detail}") from exc

    def enroll(self) -> None:
        try:
            result = self._request(
                "POST",
                "/api/agent/enroll",
                {
                    "enrollmentToken": self.token,
                    "hostname": socket.gethostname(),
                    "agentVersion": VERSION,
                },
            )
            logger.info("Enroll: %s", result)
            self.apply_api_url(result.get("apiUrl") if isinstance(result, dict) else None)
            self.store.set_meta("enrolled", "1")
        except RuntimeError as exc:
            if "409" in str(exc):
                logger.info("Already enrolled")
                self.store.set_meta("enrolled", "1")
                return
            raise

    def heartbeat(self) -> None:
        result = self._request(
            "POST",
            "/api/agent/heartbeat",
            {"hostname": socket.gethostname(), "agentVersion": VERSION},
        )
        if isinstance(result, dict):
            self.apply_api_url(result.get("apiUrl"))

    def inventory(self, certificates: list[dict[str, Any]]) -> None:
        self._request("POST", "/api/agent/inventory", {"certificates": certificates})

    def fetch_jobs(self) -> list[dict[str, Any]]:
        data = self._request("GET", "/api/agent/jobs")
        return data.get("jobs", [])

    def job_status(self, job_id: str, status: str, log_append: str = "", log: str | None = None) -> None:
        body: dict[str, Any] = {"status": status}
        if log is not None:
            body["log"] = log
        if log_append:
            body["logAppend"] = log_append
        try:
            self._request("POST", f"/api/agent/jobs/{job_id}/status", body)
        except Exception as exc:
            logger.warning("job status push failed, queuing: %s", exc)
            self.store.enqueue_outbox(
                "job_status",
                {"job_id": job_id, "status": status, "logAppend": log_append, "log": log},
            )

    def flush_outbox(self) -> None:
        for row in self.store.list_outbox():
            payload = json.loads(row["payload_json"])
            try:
                if row["kind"] == "inventory":
                    self.inventory(payload["certificates"])
                elif row["kind"] == "heartbeat":
                    self.heartbeat()
                elif row["kind"] == "job_status":
                    body: dict[str, Any] = {"status": payload["status"]}
                    if payload.get("log") is not None:
                        body["log"] = payload["log"]
                    if payload.get("logAppend"):
                        body["logAppend"] = payload["logAppend"]
                    self._request("POST", f"/api/agent/jobs/{payload['job_id']}/status", body)
                else:
                    logger.warning("Unknown outbox kind %s", row["kind"])
                self.store.delete_outbox(row["id"])
            except Exception as exc:
                self.store.bump_outbox(row["id"])
                logger.warning("Outbox flush failed for %s: %s", row["id"], exc)
                break


def build_certbot_cmd(cfg: dict[str, Any], job_type: str, payload: dict[str, Any]) -> list[str]:
    bin_ = cfg["certbot_bin"]
    if job_type == "renew":
        name = payload.get("lineageName") or payload.get("certName")
        cmd = [bin_, "renew", "--non-interactive", "--cert-name", str(name)]
        if payload.get("dryRun"):
            cmd.append("--dry-run")
        return cmd
    if job_type == "delete":
        name = payload.get("lineageName") or payload.get("certName")
        return [bin_, "delete", "--non-interactive", "--cert-name", str(name)]
    if job_type == "add":
        domains = payload.get("domains") or []
        if not domains:
            raise ValueError("add requires domains")
        auth = payload.get("authenticator") or payload.get("plugin") or "nginx"
        if payload.get("email"):
            cmd = [bin_, "certonly", "--non-interactive", "--agree-tos", "-m", str(payload["email"])]
        else:
            cmd = [bin_, "certonly", "--non-interactive", "--agree-tos", "--register-unsafely-without-email"]
        if auth == "nginx":
            cmd += ["--nginx"]
        elif auth == "apache":
            cmd += ["--apache"]
        elif auth == "standalone":
            cmd += ["--standalone"]
        elif auth == "webroot":
            path = payload.get("webrootPath") or "/var/www/html"
            cmd += ["--webroot", "-w", str(path)]
        else:
            raise ValueError(f"unsupported authenticator: {auth}")
        for d in domains:
            cmd += ["-d", str(d)]
        return cmd
    raise ValueError(f"unsupported job type: {job_type}")


def run_job(client: AgentClient, store: LocalStore, cfg: dict[str, Any], job: dict[str, Any]) -> None:
    job_id = job["id"]
    job_type = job["type"]
    payload = job.get("payload") or {}
    logger.info("Running job %s (%s)", job_id, job_type)
    store.upsert_job(job_id, job_type, payload, "running", "Starting…\n")
    client.job_status(job_id, "running", log_append=f"Starting {job_type}…\n")
    try:
        cmd = build_certbot_cmd(cfg, job_type, payload)
        store.append_job_log(job_id, f"$ {' '.join(cmd)}\n")
        client.job_status(job_id, "running", log_append=f"$ {' '.join(cmd)}\n")
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        assert proc.stdout is not None
        for line in proc.stdout:
            store.append_job_log(job_id, line)
            client.job_status(job_id, "running", log_append=line)
        code = proc.wait()
        final = "succeeded" if code == 0 else "failed"
        store.append_job_log(job_id, f"\nExit code {code}\n", status=final)
        client.job_status(job_id, final, log_append=f"\nExit code {code}\n")
    except Exception as exc:
        store.append_job_log(job_id, f"\nERROR: {exc}\n", status="failed")
        client.job_status(job_id, "failed", log_append=f"\nERROR: {exc}\n")


def report_inventory(client: AgentClient, store: LocalStore, cfg: dict[str, Any]) -> None:
    try:
        client.heartbeat()
    except Exception as exc:
        logger.warning("Heartbeat failed, queued: %s", exc)
        store.enqueue_outbox("heartbeat", {})
    certs = collect_inventory(cfg)
    store.save_certificates(certs)
    try:
        client.inventory(certs)
        logger.info("Reported %d certificates", len(certs))
    except Exception as exc:
        logger.warning("Inventory push failed, queued (%d certs cached in SQLite): %s", len(certs), exc)
        store.enqueue_outbox("inventory", {"certificates": certs})


def main() -> None:
    parser = argparse.ArgumentParser(description="CertBot WebUI Agent (SQLite, stdlib-only)")
    parser.add_argument("--config", default=os.environ.get("CERTBOT_AGENT_CONFIG", "/etc/certbot-agent/config.toml"))
    parser.add_argument("--once", action="store_true", help="Run one inventory + job poll then exit")
    parser.add_argument("--enroll-only", action="store_true")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    cfg = load_config(args.config)
    store = LocalStore(cfg["db_path"])
    client = AgentClient(cfg, store, config_path=args.config)
    logger.info(
        "CertBot Agent %s on %s (api=%s db=%s)",
        VERSION,
        platform.node(),
        cfg["api_url"],
        cfg["db_path"],
    )

    try:
        client.enroll()
    except Exception as exc:
        logger.warning("Enroll skipped/failed (may already be enrolled): %s", exc)

    if args.enroll_only:
        return

    last_inventory = 0.0
    while True:
        try:
            client.flush_outbox()
            now = time.time()
            if now - last_inventory >= cfg["inventory_interval"] or args.once:
                report_inventory(client, store, cfg)
                last_inventory = now
            jobs = client.fetch_jobs()
            for job in jobs:
                run_job(client, store, cfg, job)
                last_inventory = 0
        except Exception as exc:
            logger.exception("Loop error: %s", exc)

        if args.once:
            break
        time.sleep(cfg["job_interval"])


if __name__ == "__main__":
    main()
