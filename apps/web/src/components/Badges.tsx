export function HealthBadge({ health }: { health: string }) {
  const styles: Record<string, string> = {
    ok: "bg-emerald-100 text-emerald-800",
    expiring: "bg-amber-100 text-amber-900",
    overdue: "bg-rose-100 text-rose-900",
    unknown: "bg-slate-100 text-slate-700",
  };
  const labels: Record<string, string> = {
    ok: "OK",
    expiring: "Bald ablaufend",
    overdue: "Überfällig",
    unknown: "Unbekannt",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${styles[health] || styles.unknown}`}>
      {labels[health] || health}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    online: "bg-emerald-100 text-emerald-800",
    offline: "bg-rose-100 text-rose-900",
    pending: "bg-slate-100 text-slate-700",
    queued: "bg-slate-100 text-slate-700",
    running: "bg-sky-100 text-sky-900",
    succeeded: "bg-emerald-100 text-emerald-800",
    failed: "bg-rose-100 text-rose-900",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${styles[status] || "bg-slate-100 text-slate-800"}`}>
      {status}
    </span>
  );
}
