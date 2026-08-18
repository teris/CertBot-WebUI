import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireSession } from "@/lib/session";
import { generateToken, hashToken } from "@/lib/tokens";
import { agentNeedsUpdate } from "@/lib/agent-version";
import { getBundledAgentVersion } from "@/lib/agent-version.server";
import { getSettings, offlineAfterMs } from "@/lib/notifications";

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const nodes = await prisma.node.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { certificates: true } } },
  });

  const settings = await getSettings();
  const cutoff = new Date(Date.now() - offlineAfterMs(settings.offlineAfterMinutes));
  const latestAgentVersion = getBundledAgentVersion();
  const enriched = nodes.map((n) => {
    let status = n.status;
    if (n.enrollmentUsed && (!n.lastHeartbeatAt || n.lastHeartbeatAt < cutoff)) {
      status = "offline";
    }
    return {
      id: n.id,
      name: n.name,
      hostname: n.hostname,
      status,
      agentVersion: n.agentVersion,
      lastHeartbeatAt: n.lastHeartbeatAt,
      enrollmentUsed: n.enrollmentUsed,
      certificateCount: n._count.certificates,
      createdAt: n.createdAt,
      updateAvailable: n.enrollmentUsed && agentNeedsUpdate(n.agentVersion, latestAgentVersion),
    };
  });

  return NextResponse.json({ nodes: enriched, latestAgentVersion });
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  hostname: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const plainToken = generateToken(32);
  const node = await prisma.node.create({
    data: {
      name: parsed.data.name,
      hostname: parsed.data.hostname || null,
      tokenHash: hashToken(plainToken),
      status: "pending",
      enrollmentUsed: false,
    },
  });

  return NextResponse.json({
    node: {
      id: node.id,
      name: node.name,
      hostname: node.hostname,
      status: node.status,
    },
    enrollmentToken: plainToken,
  });
}
