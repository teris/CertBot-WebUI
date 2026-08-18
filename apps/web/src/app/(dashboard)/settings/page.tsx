"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type Settings = {
  publicBaseUrl: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPass: string | null;
  smtpFrom: string | null;
  smtpTls: boolean;
  webhookUrl: string | null;
  warnDaysBeforeExpiry: number;
  overdueDays: number;
  notifyOnJobFailure: boolean;
  notifyOnNodeOffline: boolean;
  offlineAfterMinutes: number;
};

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [detectedUrl, setDetectedUrl] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "admin") {
      router.push("/");
      return;
    }
    if (status === "authenticated") {
      fetch("/api/settings")
        .then((r) => r.json())
        .then((d) => {
          setSettings({
            ...d.settings,
            offlineAfterMinutes: d.settings.offlineAfterMinutes ?? 15,
          });
          if (d.detectedBaseUrl) setDetectedUrl(d.detectedBaseUrl);
        });
      fetch("/api/public-url")
        .then((r) => r.json())
        .then((d) => setDetectedUrl((prev) => prev || d.baseUrl || window.location.origin))
        .catch(() => setDetectedUrl((prev) => prev || window.location.origin));
    }
  }, [status, session, router]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setError("");
    setSaved(false);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Speichern fehlgeschlagen");
      return;
    }
    setSettings(data.settings);
    setSaved(true);
  }

  async function runCheck() {
    await fetch("/api/notifications/check", { method: "POST" });
    setSaved(true);
  }

  if (!settings) return <p className="ui-muted text-sm">Laden…</p>;

  return (
    <div>
      <h1 className="ui-page-title">Einstellungen</h1>
      <p className="ui-page-sub">Dashboard-URL, SMTP, Webhook und Benachrichtigungsregeln.</p>

      <form onSubmit={onSave} className="ui-card mt-6 max-w-xl space-y-4">
        <h2 className="ui-section-title">Öffentliche Dashboard-URL</h2>
        <p className="text-sm ui-muted">
          Wird für Agent-Installation und Links genutzt. Aktuell erkannt:{" "}
          <strong className="text-slate-900">{detectedUrl || "—"}</strong>
        </p>
        <label className="block text-sm">
          URL oder Domain (optional)
          <input
            value={settings.publicBaseUrl || ""}
            onChange={(e) => setSettings({ ...settings, publicBaseUrl: e.target.value || null })}
            className="mt-1 w-full px-3 py-2 text-sm"
            placeholder={detectedUrl || "https://certs.example.com:3001"}
          />
        </label>
        <p className="text-xs ui-muted">
          Bei HTTPS bitte die URL mit SSL-Port angeben (z.B.{" "}
          <code>https://certs.example.com:3001</code>). Agents übernehmen diese URL beim
          Heartbeat. Leer lassen = Host der aktuellen Anfrage /{" "}
          <code>HTTPS_DOMAIN</code> aus der Server-<code>.env</code>. Nach Änderung ggf. auch{" "}
          <code>NEXTAUTH_URL</code> anpassen und Dienst neu starten.
        </p>

        <h2 className="ui-section-title pt-2">E-Mail (SMTP)</h2>
        <label className="block text-sm">
          Host
          <input
            value={settings.smtpHost || ""}
            onChange={(e) => setSettings({ ...settings, smtpHost: e.target.value || null })}
            className="mt-1 w-full px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          Port
          <input
            type="number"
            value={settings.smtpPort ?? 587}
            onChange={(e) => setSettings({ ...settings, smtpPort: Number(e.target.value) })}
            className="mt-1 w-full px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          Benutzer
          <input
            value={settings.smtpUser || ""}
            onChange={(e) => setSettings({ ...settings, smtpUser: e.target.value || null })}
            className="mt-1 w-full px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          Passwort
          <input
            type="password"
            value={settings.smtpPass || ""}
            onChange={(e) => setSettings({ ...settings, smtpPass: e.target.value || null })}
            className="mt-1 w-full px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          From / Empfänger
          <input
            value={settings.smtpFrom || ""}
            onChange={(e) => setSettings({ ...settings, smtpFrom: e.target.value || null })}
            className="mt-1 w-full px-3 py-2 text-sm"
          />
        </label>

        <h2 className="ui-section-title pt-2">Webhook</h2>
        <label className="block text-sm">
          URL
          <input
            value={settings.webhookUrl || ""}
            onChange={(e) => setSettings({ ...settings, webhookUrl: e.target.value || null })}
            className="mt-1 w-full px-3 py-2 text-sm"
            placeholder="https://hooks.example.com/..."
          />
        </label>

        <h2 className="ui-section-title pt-2">Schwellen</h2>
        <label className="block text-sm">
          Warnung (Tage vor Ablauf)
          <input
            type="number"
            value={settings.warnDaysBeforeExpiry}
            onChange={(e) =>
              setSettings({ ...settings, warnDaysBeforeExpiry: Number(e.target.value) })
            }
            className="mt-1 w-full px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          Überfällig-Alarm (Tage nach Ablauf)
          <input
            type="number"
            value={settings.overdueDays}
            onChange={(e) => setSettings({ ...settings, overdueDays: Number(e.target.value) })}
            className="mt-1 w-full px-3 py-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <input
            type="checkbox"
            checked={settings.notifyOnJobFailure}
            onChange={(e) => setSettings({ ...settings, notifyOnJobFailure: e.target.checked })}
          />
          Bei fehlgeschlagenen Jobs benachrichtigen
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <input
            type="checkbox"
            checked={settings.notifyOnNodeOffline}
            onChange={(e) => setSettings({ ...settings, notifyOnNodeOffline: e.target.checked })}
          />
          Bei offline Nodes benachrichtigen
        </label>
        <label className="block text-sm">
          Offline-Mail nach
          <select
            value={settings.offlineAfterMinutes ?? 15}
            disabled={!settings.notifyOnNodeOffline}
            onChange={(e) =>
              setSettings({ ...settings, offlineAfterMinutes: Number(e.target.value) })
            }
            className="mt-1 w-full px-3 py-2 text-sm"
          >
            <option value={15}>15 Minuten</option>
            <option value={30}>30 Minuten</option>
            <option value={45}>45 Minuten</option>
            <option value={60}>60 Minuten</option>
          </select>
        </label>
        <p className="text-xs ui-muted">
          Eine Mail, wenn ein zuvor online gemeldeter Agent länger als die gewählte Zeit keinen Heartbeat sendet.
          Solange er down bleibt, keine weitere Mail. Eine Mail, sobald er sich wieder meldet.
          Neu angelegte Nodes, die sofort enrollen, lösen keine Mail aus. Siehe{" "}
          <a href="/notifications" className="underline">
            Protokoll
          </a>
          .
        </p>

        <div className="flex flex-wrap gap-2 pt-2">
          <button type="submit" className="ui-btn">
            Speichern
          </button>
          <button type="button" onClick={runCheck} className="ui-btn-secondary">
            Checks jetzt ausführen
          </button>
        </div>
        {saved && <p className="text-sm font-medium text-emerald-800">Gespeichert / ausgeführt.</p>}
        {error && <p className="text-sm font-medium text-rose-700">{error}</p>}
      </form>
    </div>
  );
}
