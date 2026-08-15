"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/Badges";

type Job = {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  finishedAt: string | null;
  node: { id: string; name: string };
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    fetch("/api/jobs")
      .then((r) => r.json())
      .then((d) => setJobs(d.jobs || []));
  }, []);

  return (
    <div>
      <h1 className="ui-page-title">Jobs</h1>
      <p className="ui-page-sub">Warteschlange und Historie der Agent-Befehle.</p>
      <div className="mt-4 ui-table-wrap">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2">Typ</th>
              <th className="px-3 py-2">Node</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Erstellt</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <Link href={`/jobs/${j.id}`} className="text-sky-700 hover:underline">
                    {j.type}
                  </Link>
                </td>
                <td className="px-3 py-2">{j.node.name}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={j.status} />
                </td>
                <td className="px-3 py-2">{new Date(j.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {!jobs.length && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center ui-muted">
                  Keine Jobs.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
