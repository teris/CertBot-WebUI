export function daysUntil(date: Date | null | undefined, now = new Date()): number | null {
  if (!date) return null;
  const ms = date.getTime() - now.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export type CertHealth = "ok" | "expiring" | "overdue" | "unknown";

export function certificateHealth(
  notAfter: Date | null | undefined,
  warnDays = 14,
  overdueDays = 2,
  now = new Date()
): CertHealth {
  if (!notAfter) return "unknown";
  const days = daysUntil(notAfter, now);
  if (days === null) return "unknown";
  if (days < -overdueDays) return "overdue";
  if (days < 0) return "overdue";
  if (days <= warnDays) return "expiring";
  return "ok";
}

export function parseDomains(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    /* comma-separated fallback */
  }
  return raw
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
}

export function serializeDomains(domains: string[]): string {
  return JSON.stringify(domains);
}
