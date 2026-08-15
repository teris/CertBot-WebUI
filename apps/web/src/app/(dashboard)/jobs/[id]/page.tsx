"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { StatusBadge } from "@/components/Badges";

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<{
    id: string;
    type: string;
    status: string;
    payload: string;
    log: string;
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
    node: { id: string; name: string };
  } | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      const res = await fetch(`/api/jobs/${id}`);
      const data = await res.json();
      if (alive) setJob(data.job);
      return data.job?.status;
    }
    load();
    const t = setInterval(async () => {
      const status = await load();
      if (status === "succeeded" || status === "failed") clearInterval(t);
    }, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id]);

  if (!job) return <p className="text-sm ui-muted">Laden…</p>;

  let payload: unknown = {};
  try {
    payload = JSON.parse(job.payload || "{}");
  } catch {
    payload = job.payload;
  }

  return (
    <div>
      <Link href="/jobs" className="text-sm text-sky-700 hover:underline">
        ← Jobs
      </Link>
      <div className="mt-2 flex items-center gap-3">
        <h1 className="ui-page-title">Job {job.type}</h1>
        <StatusBadge status={job.status} />
      </div>
      <p className="mt-1 text-sm ui-muted">
        Node{" "}
        <Link href={`/nodes/${job.node.id}`} className="text-sky-700 hover:underline">
          {job.node.name}
        </Link>
      </p>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="ui-muted">Erstellt</dt>
          <dd>{new Date(job.createdAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt className="ui-muted">Gestartet</dt>
          <dd>{job.startedAt ? new Date(job.startedAt).toLocaleString() : "—"}</dd>
        </div>
        <div>
          <dt className="ui-muted">Beendet</dt>
          <dd>{job.finishedAt ? new Date(job.finishedAt).toLocaleString() : "—"}</dd>
        </div>
      </dl>
      <h2 className="mt-6 text-sm font-medium text-slate-700">Payload</h2>
      <pre className="mt-1 overflow-auto rounded border border-slate-200 bg-white p-3 text-xs">
        {JSON.stringify(payload, null, 2)}
      </pre>
      <h2 className="mt-6 text-sm font-medium text-slate-700">Log</h2>
      <pre className="mt-1 max-h-[28rem] overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
        {job.log || "(noch kein Output)"}
      </pre>
    </div>
  );
}
