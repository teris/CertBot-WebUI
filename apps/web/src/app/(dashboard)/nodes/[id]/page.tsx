"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { StatusBadge } from "@/components/Badges";
import { parseDomains } from "@/lib/certs";

export default function NodeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [node, setNode] = useState<{
    id: string;
    name: string;
    hostname: string | null;
    status: string;
    certificates: Array<{
      id: string;
      primaryDomain: string;
      domains: string;
      notAfter: string | null;
      lineageName: string;
    }>;
    jobs: Array<{ id: string; type: string; status: string; createdAt: string }>;
  } | null>(null);
  const [token, setToken] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/nodes/${id}`);
    const data = await res.json();
    setNode(data.node);
  }

  useEffect(() => {
    load();
  }, [id]);

  async function rotate() {
    if (!confirm("Token rotieren? Der Agent muss neu enrolled werden.")) return;
    const res = await fetch(`/api/nodes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rotateToken: true }),
    });
    const data = await res.json();
    if (data.enrollmentToken) setToken(data.enrollmentToken);
    await load();
  }

  async function remove() {
    if (!confirm("Node wirklich löschen?")) return;
    await fetch(`/api/nodes/${id}`, { method: "DELETE" });
    router.push("/nodes");
  }

  if (!node) return <p className="text-sm ui-muted">Laden…</p>;

  return (
    <div>
      <Link href="/nodes" className="text-sm text-sky-700 hover:underline">
        ← Nodes
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="ui-page-title">{node.name}</h1>
          <p className="ui-page-sub">{node.hostname || "kein Hostname"}</p>
        </div>
        <StatusBadge status={node.status} />
      </div>

      {isAdmin && (
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={rotate} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900">
            Token rotieren
          </button>
          <button type="button" onClick={remove} className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-sm text-rose-700">
            Löschen
          </button>
        </div>
      )}

      {token && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          Neues Enrollment-Token: <code className="break-all">{token}</code>
        </div>
      )}

      <h2 className="mt-8 text-lg font-medium">Zertifikate</h2>
      <div className="mt-2 ui-table-wrap">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2">Domain</th>
              <th className="px-3 py-2">Lineage</th>
              <th className="px-3 py-2">Ablauf</th>
            </tr>
          </thead>
          <tbody>
            {node.certificates.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <Link href={`/certificates/${c.id}`} className="text-sky-700 hover:underline">
                    {c.primaryDomain}
                  </Link>
                  <div className="text-xs ui-muted">
                    {Array.isArray(parseDomains(c.domains)) ? parseDomains(c.domains).join(", ") : c.domains}
                  </div>
                </td>
                <td className="px-3 py-2">{c.lineageName}</td>
                <td className="px-3 py-2">
                  {c.notAfter ? new Date(c.notAfter).toLocaleString() : "—"}
                </td>
              </tr>
            ))}
            {!node.certificates.length && (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center ui-muted">
                  Keine Zertifikate gemeldet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-lg font-medium">Letzte Jobs</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {node.jobs.map((j) => (
          <li key={j.id} className="flex items-center gap-2">
            <Link href={`/jobs/${j.id}`} className="text-sky-700 hover:underline">
              {j.type}
            </Link>
            <StatusBadge status={j.status} />
            <span className="ui-muted">{new Date(j.createdAt).toLocaleString()}</span>
          </li>
        ))}
        {!node.jobs.length && <li className="ui-muted">Keine Jobs.</li>}
      </ul>
    </div>
  );
}
