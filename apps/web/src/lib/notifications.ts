import nodemailer from "nodemailer";
import { prisma } from "./prisma";

const DEDUP_HOURS = 24;

export type NotifyPayload = {
  eventKey: string;
  subject: string;
  message: string;
  data?: Record<string, unknown>;
};

async function recentlySent(eventKey: string): Promise<boolean> {
  const since = new Date(Date.now() - DEDUP_HOURS * 60 * 60 * 1000);
  const existing = await prisma.notificationLog.findFirst({
    where: { eventKey, createdAt: { gte: since } },
  });
  return Boolean(existing);
}

async function sendEmail(settings: Awaited<ReturnType<typeof getSettings>>, payload: NotifyPayload) {
  if (!settings.smtpHost || !settings.smtpFrom) return false;
  const transporter = nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort ?? 587,
    secure: settings.smtpTls && (settings.smtpPort ?? 587) === 465,
    auth:
      settings.smtpUser && settings.smtpPass
        ? { user: settings.smtpUser, pass: settings.smtpPass }
        : undefined,
  });
  await transporter.sendMail({
    from: settings.smtpFrom,
    to: settings.smtpFrom,
    subject: payload.subject,
    text: payload.message,
  });
  await prisma.notificationLog.create({
    data: { eventKey: payload.eventKey, channel: "email", message: payload.message },
  });
  return true;
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
  });
  if (!res.ok) {
    throw new Error(`Webhook failed: ${res.status}`);
  }
  await prisma.notificationLog.create({
    data: { eventKey: payload.eventKey, channel: "webhook", message: payload.message },
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
  if (await recentlySent(payload.eventKey)) return { skipped: true };
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
  }
  return { skipped: false, channels: results };
}

export async function runNotificationChecks() {
  const settings = await getSettings();
  const now = new Date();
  const warnMs = settings.warnDaysBeforeExpiry * 24 * 60 * 60 * 1000;
  const overdueMs = settings.overdueDays * 24 * 60 * 60 * 1000;

  const certs = await prisma.certificate.findMany({ include: { node: true } });
  for (const cert of certs) {
    if (!cert.notAfter) continue;
    const expiresIn = cert.notAfter.getTime() - now.getTime();
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
  }

  if (settings.notifyOnNodeOffline) {
    const cutoff = new Date(Date.now() - 20 * 60 * 1000);
    const offline = await prisma.node.findMany({
      where: {
        enrollmentUsed: true,
        OR: [{ lastHeartbeatAt: null }, { lastHeartbeatAt: { lt: cutoff } }],
      },
    });
    for (const node of offline) {
      await prisma.node.update({
        where: { id: node.id },
        data: { status: "offline" },
      });
      await notify({
        eventKey: `offline:${node.id}`,
        subject: `[CertBot] Node offline: ${node.name}`,
        message: `Node ${node.name} hat seit mehr als 20 Minuten keinen Heartbeat gesendet.`,
        data: { node: node.name },
      });
    }
  }

  if (settings.notifyOnJobFailure) {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const failed = await prisma.job.findMany({
      where: { status: "failed", finishedAt: { gte: since } },
      include: { node: true },
    });
    for (const job of failed) {
      await notify({
        eventKey: `jobfail:${job.id}`,
        subject: `[CertBot] Job fehlgeschlagen: ${job.type} @ ${job.node.name}`,
        message: `Job ${job.type} auf ${job.node.name} ist fehlgeschlagen.\n\n${job.log.slice(-2000)}`,
        data: { node: job.node.name, jobType: job.type, jobId: job.id },
      });
    }
  }
}
