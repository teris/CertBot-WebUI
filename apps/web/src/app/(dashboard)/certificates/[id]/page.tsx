"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { HealthBadge, StatusBadge } from "@/components/Badges";

type Job = {
  id: string;
  type: string;
  status: string;
  log: string;
  createdAt: string;
  finishedAt: string | null;
};

export default function CertificateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [cert, setCert] = useState<{
    id: string;
    nodeId: string;
    node: { id: string; name: string };
    lineageName: string;
    primaryDomain: string;
    domains: string[];
    notBefore: string | null;
    notAfter: string | null;
    daysRemaining: number | null;
    health: string;
  } | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobLog, setJobLog] = useState("");
  const [addDomains, setAddDomains] = useState("");
  const [plugin, setPlugin] = useState("nginx");
  const [webroot, setWebroot] = useState("/var/www/html");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch(`/api/certificates/${id}`);
    const data = await res.json();
    setCert(data.certificate);
    setJobs(data.jobs || []);
  }

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    if (!activeJobId) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/jobs/${activeJobId}`);
      const data = await res.json();
      if (data.job) {
        setJobLog(data.job.log || "");
        if (data.job.status === "succeeded" || data.job.status === "failed") {
          clearInterval(t);
          await load();
        }
      }
    }, 2000);
    return () => clearInterval(t);
  }, [activeJobId]);

  async function createJob(type: "renew" | "delete" | "add", payload: Record<string, unknown>) {
    setError("");
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId: cert!.nodeId, type, payload }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Job fehlgeschlagen");
      return;
    }
    setActiveJobId(data.job.id);
    setJobLog("");
    router.push(`/jobs/${data.job.id}`);
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const domains = addDomains
      .split(/[,\s]+/)
      .map((d) => d.trim())
      .filter(Boolean);
    await createJob("add", {
      domains,
      authenticator: plugin,
      webrootPath: plugin === "webroot" ? webroot : undefined,
    });
  }

  if (!cert) return <p className="text-sm ui-muted">Laden…</p>;

  return (
    <div>
      <Link href="/certificates" className="text-sm text-sky-700 hover:underline">
        ← Zertifikate
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="ui-page-title">{cert.primaryDomain}</h1>
          <p className="ui-page-sub">
            Node{" "}
            <Link href={`/nodes/${cert.nodeId}`} className="text-sky-700 hover:underline">
              {cert.node.name}
            </Link>{" "}
            · Lineage {cert.lineageName}
          </p>
        </div>
        <HealthBadge health={cert.health} />
      </div>

      <dl className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="ui-card text-sm">
          <dt className="ui-muted">Domains (SANs)</dt>
          <dd className="mt-1">{cert.domains.join(", ")}</dd>
        </div>
        <div className="ui-card text-sm">
          <dt className="ui-muted">Gültigkeit</dt>
          <dd className="mt-1">
            {cert.notBefore ? new Date(cert.notBefore).toLocaleString() : "—"} →{" "}
            {cert.notAfter ? new Date(cert.notAfter).toLocaleString() : "—"}
            {cert.daysRemaining !== null && (
              <span className="ml-2 ui-muted">({cert.daysRemaining} Tage)</span>
            )}
          </dd>
        </div>
      </dl>

      {isAdmin && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white"
              onClick={() => createJob("renew", { lineageName: cert.lineageName })}
            >
              Erneuern
            </button>
            <button
              type="button"
              className="rounded-md border border-rose-300 px-3 py-2 text-sm text-rose-700"
              onClick={() => {
                if (confirm("Zertifikat wirklich löschen?")) {
                  createJob("delete", { lineageName: cert.lineageName });
                }
              }}
            >
              Löschen
            </button>
          </div>

          <form onSubmit={onAdd} className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="font-medium">Neues Zertifikat auf diesem Node hinzufügen</h2>
            <label className="mt-3 block text-sm">
              Domains (Komma/Leerzeichen getrennt)
              <input
                value={addDomains}
                onChange={(e) => setAddDomains(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                placeholder="example.com www.example.com"
                required
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-3">
              <label className="text-sm">
                Plugin
                <select
                  value={plugin}
                  onChange={(e) => setPlugin(e.target.value)}
                  className="mt-1 block rounded-md border border-slate-300 px-3 py-2"
                >
                  <option value="nginx">nginx</option>
                  <option value="apache">apache</option>
                  <option value="webroot">webroot</option>
                  <option value="standalone">standalone</option>
                </select>
              </label>
              {plugin === "webroot" && (
                <label className="text-sm">
                  Webroot-Pfad
                  <input
                    value={webroot}
                    onChange={(e) => setWebroot(e.target.value)}
                    className="mt-1 block rounded-md border border-slate-300 px-3 py-2"
                  />
                </label>
              )}
            </div>
            <button type="submit" className="mt-3 rounded-md border border-slate-300 px-3 py-2 text-sm">
              Hinzufügen-Job senden
            </button>
          </form>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
      )}

      <h2 className="mt-8 text-lg font-medium">Zugehörige Jobs</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {jobs.map((j) => (
          <li key={j.id} className="flex items-center gap-2">
            <Link href={`/jobs/${j.id}`} className="text-sky-700 hover:underline">
              {j.type}
            </Link>
            <StatusBadge status={j.status} />
            <span className="ui-muted">{new Date(j.createdAt).toLocaleString()}</span>
          </li>
        ))}
      </ul>
      {jobLog && (
        <pre className="mt-4 max-h-64 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">{jobLog}</pre>
      )}
    </div>
  );
}
