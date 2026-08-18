"use client";

import { useEffect, useState } from "react";

type LogRow = {
  id: string;
  eventKey: string;
  channel: string;
  subject: string;
  message: string;
  outcome: string;
  createdAt: string;
};

const outcomeLabel: Record<string, string> = {
  sent: "gesendet",
  skipped: "übersprungen",
  failed: "fehlgeschlagen",
};

const outcomeClass: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-800",
  skipped: "bg-slate-100 text-slate-700",
  failed: "bg-rose-100 text-rose-800",
};

const kindLabel: Record<string, string> = {
  offline: "Node offline",
  online: "Node wieder online",
  overdue: "Zertifikat überfällig",
  expiring: "Zertifikat bald ab",
  jobfail: "Job fehlgeschlagen",
};

function isInternalId(value: string | null | undefined): boolean {
  if (!value) return true;
  return /^(offline|online|overdue|expiring|jobfail):[a-z0-9]+/i.test(value.trim());
}

function eventKind(eventKey: string): string {
  const kind = (eventKey || "").split(":")[0];
  return kindLabel[kind] || "Benachrichtigung";
}

function displayTitle(log: LogRow): string {
  const subject = (log.subject || "").replace(/^\[CertBot\]\s*/i, "").trim();
  if (subject && !isInternalId(subject)) return subject;
  const first = (log.message || "").split("\n")[0].trim();
  if (first && !isInternalId(first)) return first;
  return eventKind(log.eventKey);
}

function channelLabel(channel: string): string {
  if (channel === "email") return "E-Mail";
  if (channel === "webhook") return "Webhook";
  if (channel === "system") return "System";
  return channel;
}

export default function NotificationsPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => setLogs(d.logs || []));
  }, []);

  return (
    <div>
      <h1 className="ui-page-title">Protokoll</h1>
      <p className="ui-page-sub">
        Versand von E-Mails und Webhooks (Offline, Wiederkehr, Zertifikate, Jobs).
      </p>
      <div className="mt-4 ui-table-wrap">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2">Zeit</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Kanal</th>
              <th className="px-3 py-2">Ereignis</th>
              <th className="px-3 py-2">Betreff</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => {
              const title = displayTitle(l);
              const body = (l.message || "").trim();
              const showBody = Boolean(body && body !== title && !body.startsWith(title));
              return (
                <tr key={l.id} className="border-b last:border-0 align-top">
                  <td className="whitespace-nowrap px-3 py-2 ui-muted">
                    {new Date(l.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${outcomeClass[l.outcome] || outcomeClass.skipped}`}
                    >
                      {outcomeLabel[l.outcome] || l.outcome}
                    </span>
                  </td>
                  <td className="px-3 py-2">{channelLabel(l.channel)}</td>
                  <td className="px-3 py-2">{eventKind(l.eventKey)}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900">{title}</div>
                    {showBody && (
                      <div className="mt-1 max-w-xl whitespace-pre-wrap text-xs ui-muted">{body}</div>
                    )}
                  </td>
                </tr>
              );
            })}
            {!logs.length && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center ui-muted">
                  Noch keine Einträge.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
