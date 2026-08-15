"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { HealthBadge } from "@/components/Badges";

type Cert = {
  id: string;
  nodeName: string;
  primaryDomain: string;
  domains: string[];
  notAfter: string | null;
  daysRemaining: number | null;
  health: string;
  lineageName: string;
};

export default function CertificatesPage() {
  const searchParams = useSearchParams();
  const [certs, setCerts] = useState<Cert[]>([]);
  const [status, setStatus] = useState(searchParams.get("status") || "");

  useEffect(() => {
    const q = status ? `?status=${status}` : "";
    fetch(`/api/certificates${q}`)
      .then((r) => r.json())
      .then((d) => setCerts(d.certificates || []));
  }, [status]);

  return (
    <div>
      <h1 className="ui-page-title">Zertifikate</h1>
      <p className="ui-page-sub">Alle Domains und Laufzeiten über alle Nodes.</p>

      <div className="mt-4 flex gap-2">
        {["", "ok", "expiring", "overdue"].map((s) => (
          <button
            key={s || "all"}
            type="button"
            onClick={() => setStatus(s)}
            className={status === s ? "ui-btn" : "ui-btn-secondary"}
          >
            {s || "Alle"}
          </button>
        ))}
      </div>

      <div className="mt-4 ui-table-wrap">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2">Domain</th>
              <th className="px-3 py-2">Node</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Tage</th>
              <th className="px-3 py-2">Ablauf</th>
            </tr>
          </thead>
          <tbody>
            {certs.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <Link href={`/certificates/${c.id}`} className="font-medium text-sky-700 hover:underline">
                    {c.primaryDomain}
                  </Link>
                  <div className="text-xs ui-muted">{c.domains.join(", ")}</div>
                </td>
                <td className="px-3 py-2">{c.nodeName}</td>
                <td className="px-3 py-2">
                  <HealthBadge health={c.health} />
                </td>
                <td className="px-3 py-2 tabular-nums">{c.daysRemaining ?? "—"}</td>
                <td className="px-3 py-2">
                  {c.notAfter ? new Date(c.notAfter).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
            {!certs.length && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center ui-muted">
                  Keine Zertifikate.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
