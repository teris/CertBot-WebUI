import { readFileSync } from "fs";
import { join } from "path";
import { BUNDLED_AGENT_VERSION } from "./agent-version";

function parseVersionFromAgentPy(text: string): string | null {
  const m = text.match(/^VERSION\s*=\s*["']([^"']+)/m);
  return m?.[1] || null;
}

function tryReadVersion(root: string): string | null {
  try {
    const raw = readFileSync(join(root, "public", "agent", "VERSION"), "utf8").trim();
    const v = raw.split(/\s/)[0];
    if (/^\d+\.\d+/.test(v)) return v;
  } catch {
    /* ignore */
  }
  try {
    const py = readFileSync(join(root, "public", "agent", "agent.py"), "utf8");
    return parseVersionFromAgentPy(py);
  } catch {
    return null;
  }
}

/** Liest zur Laufzeit public/agent/VERSION bzw. VERSION in agent.py. */
export function getBundledAgentVersion(): string {
  const candidates = [process.cwd(), join(process.cwd(), "apps", "web")];
  for (const root of candidates) {
    const v = tryReadVersion(root);
    if (v) return v;
  }
  return BUNDLED_AGENT_VERSION;
}
