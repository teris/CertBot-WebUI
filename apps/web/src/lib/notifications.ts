import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { prisma } from "./prisma";

const DEDUP_HOURS = 24;
const SMTP_TIMEOUT_MS = 20_000;
const WEBHOOK_TIMEOUT_MS = 15_000;
export const OFFLINE_AFTER_CHOICES = [15, 30, 45, 60] as const;

export function normalizeOfflineAfterMinutes(minutes: number | null | undefined): number {
  if (minutes && (OFFLINE_AFTER_CHOICES as readonly number[]).includes(minutes)) {
    return minutes;
  }
  return 15;
}

export function offlineAfterMs(minutes: number | null | undefined): number {
  return normalizeOfflineAfterMinutes(minutes) * 60 * 1000;
}

export type NotifyPayload = {
  eventKey: string;
  subject: string;
  message: string;
  data?: Record<string, unknown>;
  /** If false, always send (used for offline/online transitions). Default: 24h dedup. */
  dedupe?: boolean;
};

async function recentlySent(eventKey: string): Promise<boolean> {
  const since = new Date(Date.now() - DEDUP_HOURS * 60 * 60 * 1000);
  const existing = await prisma.notificationLog.findFirst({
    where: { eventKey, outcome: "sent", createdAt: { gte: since } },
  });
  return Boolean(existing);
}

export async function logNotification(entry: {
  eventKey: string;
  channel: string;
  message: string;
  subject?: string;
  outcome: "sent" | "skipped" | "failed";
}) {
  await prisma.notificationLog.create({
    data: {
      eventKey: entry.eventKey,
      channel: entry.channel,
      message: entry.message,
      subject: entry.subject || "",
      outcome: entry.outcome,
    },
  });
}

function createSmtpTransport(settings: Awaited<ReturnType<typeof getSettings>>): Transporter {
  const port = settings.smtpPort ?? 587;
  const useTls = settings.smtpTls !== false;
  const transporter = nodemailer.createTransport({
    host: settings.smtpHost!,
    port,
    secure: useTls && port === 465,
    requireTLS: useTls && port !== 465,
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
    auth:
      settings.smtpUser && settings.smtpPass
        ? { user: settings.smtpUser, pass: settings.smtpPass }
        : undefined,
  });
  transporter.on("error", (err) => {
    console.error("smtp transport error", err);
  });
  return transporter;
}

async function sendEmail(settings: Awaited<ReturnType<typeof getSettings>>, payload: NotifyPayload) {
  if (!settings.smtpHost || !settings.smtpFrom) return false;
  const transporter = createSmtpTransport(settings);
  try {
    await transporter.sendMail({
      from: settings.smtpFrom,
      to: settings.smtpFrom,
      subject: payload.subject,
      text: payload.message,
    });
    await logNotification({
      eventKey: payload.eventKey,
      channel: "email",
      subject: payload.subject,
      message: payload.message,
      outcome: "sent",
    });
    return true;
  } catch (e) {
    await logNotification({
      eventKey: payload.eventKey,
      channel: "email",
      subject: payload.subject,
      message: `Versand fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`,
      outcome: "failed",
    });
    throw e;
  } finally {
    transporter.close();
  }
}

async function sendWebhook(settings: Awaited<ReturnType<typeof getSettings>>, payload: NotifyPayload) {
  if (!settings.webhookUrl) return false;
  const res = await fetch(settings.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: payload.eventKey,
      subject: payload.subject,
      message: payload.message,
      ...payload.data,
      sentAt: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Webhook failed: ${res.status}`);
  }
  await logNotification({
    eventKey: payload.eventKey,
    channel: "webhook",
    subject: payload.subject,
    message: payload.message,
    outcome: "sent",
  });
  return true;
}

export async function getSettings() {
  return prisma.setting.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
}

export async function notify(payload: NotifyPayload) {
  const useDedupe = payload.dedupe !== false;
  if (useDedupe && (await recentlySent(payload.eventKey))) {
    return { skipped: true };
  }
  const settings = await getSettings();
  const results: string[] = [];
  try {
    if (await sendEmail(settings, payload)) results.push("email");
  } catch (e) {
    console.error("email notify failed", e);
  }
  try {
    if (await sendWebhook(settings, payload)) results.push("webhook");
  } catch (e) {
    console.error("webhook notify failed", e);
    await logNotification({
      eventKey: payload.eventKey,
      channel: "webhook",
      subject: payload.subject,
      message: `Webhook fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`,
      outcome: "failed",
    }).catch(() => undefined);
  }
  if (results.length === 0 && payload.dedupe === false) {
    await logNotification({
      eventKey: payload.eventKey,
      channel: "system",
      subject: payload.subject,
      message: payload.message,
      outcome: "skipped",
    });
  }
  return { skipped: false, channels: results };
}

/** One mail when a previously online node comes back. */
export async function notifyNodeRecovered(node: { id: string; name: string }) {
  const settings = await getSettings();
  if (!settings.notifyOnNodeOffline) return;
  await notify({
    eventKey: `online:${node.id}:${Date.now()}`,
    subject: `[CertBot] Node wieder online: ${node.name}`,
    message: `Node ${node.name} hat sich nach einem Ausfall wieder gemeldet.`,
    data: { node: node.name },
    dedupe: false,
  });
}

export async function runNotificationChecks() {
  try {
    await runNotificationChecksInner();
  } catch (e) {
    console.error("notification checks failed", e);
  }
}

async function runNotificationChecksInner() {
  const settings = await getSettings();
  const now = new Date();
  const warnMs = settings.warnDaysBeforeExpiry * 24 * 60 * 60 * 1000;
  const overdueMs = settings.overdueDays * 24 * 60 * 60 * 1000;

  const certs = await prisma.certificate.findMany({ include: { node: true } });
  for (const cert of certs) {
    if (!cert.notAfter) continue;
    const expiresIn = cert.notAfter.getTime() - now.getTime();
    try {
      if (expiresIn < -overdueMs) {
        await notify({
          eventKey: `overdue:${cert.id}`,
          subject: `[CertBot] Zertifikat überfällig: ${cert.primaryDomain}`,
          message: `Zertifikat ${cert.primaryDomain} auf Node ${cert.node.name} ist seit mehr als ${settings.overdueDays} Tagen abgelaufen (Ablauf: ${cert.notAfter.toISOString()}).`,
          data: {
            node: cert.node.name,
            domains: cert.domains,
            expires_at: cert.notAfter.toISOString(),
          },
        });
      } else if (expiresIn >= 0 && expiresIn <= warnMs) {
        await notify({
          eventKey: `expiring:${cert.id}`,
          subject: `[CertBot] Zertifikat läuft bald ab: ${cert.primaryDomain}`,
          message: `Zertifikat ${cert.primaryDomain} auf Node ${cert.node.name} läuft am ${cert.notAfter.toISOString()} ab.`,
          data: {
            node: cert.node.name,
            domains: cert.domains,
            expires_at: cert.notAfter.toISOString(),
          },
        });
      }
    } catch (e) {
      console.error("certificate notify failed", cert.id, e);
    }
  }

  if (settings.notifyOnNodeOffline) {
    const minutes = normalizeOfflineAfterMinutes(settings.offlineAfterMinutes);
    const cutoff = new Date(Date.now() - offlineAfterMs(minutes));
    const stale = await prisma.node.findMany({
      where: {
        enrollmentUsed: true,
        lastHeartbeatAt: { not: null, lt: cutoff },
      },
    });
    for (const node of stale) {
      try {
        if (node.status === "pending") {
          continue;
        }
        if (node.status === "offline" || node.offlineAlertSent) {
          continue;
        }
        if (node.status !== "online") {
          continue;
        }
        await prisma.node.update({
          where: { id: node.id },
          data: { status: "offline", offlineAlertSent: true },
        });
        await notify({
          eventKey: `offline:${node.id}:${now.toISOString()}`,
          subject: `[CertBot] Node offline: ${node.name}`,
          message: `Node ${node.name} hat seit mehr als ${minutes} Minuten keinen Heartbeat gesendet. Es folgt keine weitere Mail, bis der Agent wieder online ist.`,
          data: { node: node.name },
          dedupe: false,
        });
      } catch (e) {
        console.error("offline notify failed", node.id, e);
      }
    }
  }

  if (settings.notifyOnJobFailure) {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const failed = await prisma.job.findMany({
      where: { status: "failed", finishedAt: { gte: since } },
      include: { node: true },
    });
    for (const job of failed) {
      try {
        await notify({
          eventKey: `jobfail:${job.id}`,
          subject: `[CertBot] Job fehlgeschlagen: ${job.type} @ ${job.node.name}`,
          message: `Job ${job.type} auf ${job.node.name} ist fehlgeschlagen.\n\n${job.log.slice(-2000)}`,
          data: { node: job.node.name, jobType: job.type, jobId: job.id },
        });
      } catch (e) {
        console.error("job-fail notify failed", job.id, e);
      }
    }
  }
}
