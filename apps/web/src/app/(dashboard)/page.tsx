"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Stats = {
  nodes: number;
  onlineNodes: number;
  certificates: number;
  ok: number;
  expiring: number;
  overdue: number;
  activeJobs: number;
  failedJobsWeek: number;
};

export default function HomePage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => setStats(d.stats))
      .catch(() => setStats(null));
  }, []);

  const cards = [
    { label: "Nodes online", value: stats ? `${stats.onlineNodes}/${stats.nodes}` : "—" },
    { label: "Zertifikate", value: stats?.certificates ?? "—" },
    { label: "OK", value: stats?.ok ?? "—" },
    { label: "Bald ablaufend", value: stats?.expiring ?? "—" },
    { label: "Überfällig", value: stats?.overdue ?? "—" },
    { label: "Aktive Jobs", value: stats?.activeJobs ?? "—" },
  ];

  return (
    <div>
      <h1 className="ui-page-title">Übersicht</h1>
      <p className="ui-page-sub">
        Zentrale Certbot-/Let&apos;s-Encrypt-Verwaltung über alle Nodes.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="ui-card">
            <div className="ui-muted text-sm">{c.label}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{c.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/nodes" className="ui-btn">
          Node hinzufügen
        </Link>
        <Link href="/certificates?status=overdue" className="ui-btn-secondary">
          Überfällige Zertifikate
        </Link>
        <Link href="/jobs" className="ui-btn-secondary">
          Jobs anzeigen
        </Link>
      </div>
      {stats && stats.failedJobsWeek > 0 && (
        <p className="mt-4 text-sm font-medium text-rose-700">
          {stats.failedJobsWeek} fehlgeschlagene Jobs in den letzten 7 Tagen.
        </p>
      )}
    </div>
  );
}
