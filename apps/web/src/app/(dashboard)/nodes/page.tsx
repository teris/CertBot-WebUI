"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { StatusBadge } from "@/components/Badges";

type NodeRow = {
  id: string;
  name: string;
  hostname: string | null;
  status: string;
  agentVersion: string | null;
  lastHeartbeatAt: string | null;
  enrollmentUsed: boolean;
  certificateCount: number;
};

export default function NodesPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [name, setName] = useState("");
  const [hostname, setHostname] = useState("");
  const [tokenInfo, setTokenInfo] = useState<{ name: string; token: string; installCommand: string } | null>(
    null
  );
  const [baseUrl, setBaseUrl] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/nodes");
    const data = await res.json();
    setNodes(data.nodes || []);
  }

  useEffect(() => {
    load();
    fetch("/api/public-url")
      .then((r) => r.json())
      .then((d) => setBaseUrl(d.baseUrl || window.location.origin))
      .catch(() => setBaseUrl(window.location.origin));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/nodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, hostname: hostname || undefined }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Fehler");
      return;
    }
    const origin = baseUrl || window.location.origin;
    const installRes = await fetch(
      `/api/public-url?token=${encodeURIComponent(data.enrollmentToken)}`
    );
    const installData = await installRes.json().catch(() => ({}));
    setTokenInfo({
      name: data.node.name,
      token: data.enrollmentToken,
      installCommand:
        installData.installCommand ||
        `curl -fsSL "${origin}/api/public/agent/install?token=${data.enrollmentToken}" | sudo bash`,
    });
    setName("");
    setHostname("");
    await load();
  }

  return (
    <div>
      <h1 className="ui-page-title">Nodes</h1>
      <p className="ui-page-sub">
        Server mit installiertem Agent. Enrollment-Token nur einmalig sichtbar.
        {baseUrl && (
          <>
            {" "}
            Dashboard-URL: <strong className="text-slate-900">{baseUrl}</strong>
          </>
        )}
      </p>

      {isAdmin && (
        <form onSubmit={onCreate} className="ui-card mt-6 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full px-3 py-2 text-sm"
              required
            />
          </label>
          <label className="text-sm">
            Hostname (optional)
            <input
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              className="mt-1 block w-full px-3 py-2 text-sm"
            />
          </label>
          <button type="submit" className="ui-btn">
            Hinzufügen
          </button>
          {error && <p className="w-full text-sm font-medium text-rose-700">{error}</p>}
        </form>
      )}

      {tokenInfo && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-slate-900">
          <p className="font-bold">Node „{tokenInfo.name}“ angelegt — Agent so installieren:</p>
          <pre className="mt-3 overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-100 whitespace-pre-wrap">
            {tokenInfo.installCommand}
          </pre>
          <p className="mt-2 ui-muted text-xs">
            Token (Backup): <code className="break-all">{tokenInfo.token}</code>
          </p>
          <button type="button" className="mt-2 text-xs font-semibold underline" onClick={() => setTokenInfo(null)}>
            Schließen
          </button>
        </div>
      )}

      <div className="mt-6 ui-table-wrap">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Zertifikate</th>
              <th className="px-3 py-2 font-medium">Letzter Heartbeat</th>
              <th className="px-3 py-2 font-medium">Agent</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((n) => (
              <tr key={n.id} className="border-b last:border-0">
                <td className="px-3 py-2">
                  <Link href={`/nodes/${n.id}`} className="font-medium text-sky-800 hover:underline">
                    {n.name}
                  </Link>
                  {n.hostname && <div className="text-xs ui-muted">{n.hostname}</div>}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={n.status} />
                </td>
                <td className="px-3 py-2 tabular-nums">{n.certificateCount}</td>
                <td className="px-3 py-2 ui-muted">
                  {n.lastHeartbeatAt ? new Date(n.lastHeartbeatAt).toLocaleString() : "—"}
                </td>
                <td className="px-3 py-2">{n.agentVersion || "—"}</td>
              </tr>
            ))}
            {!nodes.length && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center ui-muted">
                  Noch keine Nodes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
