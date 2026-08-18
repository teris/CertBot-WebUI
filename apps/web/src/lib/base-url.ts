import { headers } from "next/headers";
import { prisma } from "./prisma";

/** HTTPS-URL aus Install-Env (Domain + PORT+1), falls gesetzt. */
export function httpsUrlFromEnv(): string | null {
  const domain = process.env.HTTPS_DOMAIN?.trim();
  if (!domain) return null;
  const port = (process.env.HTTPS_PORT || "").trim();
  if (!port || port === "443") return `https://${domain}`;
  return `https://${domain}:${port}`;
}

/**
 * Kanonische Dashboard-URL für UI + Agent.
 * Reihenfolge: Settings.publicBaseUrl → HTTPS_DOMAIN/PORT → NEXTAUTH_URL (https) → Request-Host → NEXTAUTH_URL → localhost
 */
export async function resolvePublicBaseUrl(req?: Request): Promise<string> {
  const settings = await prisma.setting.findUnique({ where: { id: "default" } });
  const configured = settings?.publicBaseUrl?.trim().replace(/\/$/, "");
  if (configured) return configured;

  const fromHttpsEnv = httpsUrlFromEnv();
  if (fromHttpsEnv) return fromHttpsEnv;

  const envUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, "");
  if (envUrl?.startsWith("https://")) return envUrl;

  if (req) {
    const proto =
      req.headers.get("x-forwarded-proto") ||
      (req.url.startsWith("https:") ? "https" : "http");
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    if (host) {
      return `${proto}://${host}`.replace(/\/$/, "");
    }
  }

  try {
    const h = await headers();
    const proto = h.get("x-forwarded-proto") || "http";
    const host = h.get("x-forwarded-host") || h.get("host");
    if (host) {
      return `${proto}://${host}`.replace(/\/$/, "");
    }
  } catch {
    /* outside request context */
  }

  if (envUrl) return envUrl;

  return "http://localhost:3000";
}

export function agentInstallCommand(baseUrl: string, token: string): string {
  const url = baseUrl.replace(/\/$/, "");
  return [
    `# Auf dem Zielserver ausführen (lädt Agent vom Dashboard):`,
    `curl -fsSL "${url}/api/public/agent/install?token=${token}" | sudo bash`,
    ``,
    `# Alternative mit wget:`,
    `wget -qO- "${url}/api/public/agent/install?token=${token}" | sudo bash`,
  ].join("\n");
}

export function agentUpdateCommand(baseUrl: string): string {
  const url = baseUrl.replace(/\/$/, "");
  return `curl -fsSL "${url}/agent/update.sh" | sudo bash`;
}
