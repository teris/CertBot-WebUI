export const BUNDLED_AGENT_VERSION = "1.3.3";
export const MIN_REMOTE_UPDATE_VERSION = "1.3.0";

/** Compare dotted versions; true if current is older than latest. */
export function agentNeedsUpdate(current: string | null | undefined, latest = BUNDLED_AGENT_VERSION): boolean {
  if (!current) return true;
  const parse = (v: string) =>
    v.split(".").map((n) => Number.parseInt(n.replace(/\D/g, ""), 10) || 0);
  const a = parse(current);
  const b = parse(latest);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x < y) return true;
    if (x > y) return false;
  }
  return false;
}

export function agentSupportsRemoteUpdate(current: string | null | undefined): boolean {
  if (!current) return false;
  return !agentNeedsUpdate(current, MIN_REMOTE_UPDATE_VERSION);
}
