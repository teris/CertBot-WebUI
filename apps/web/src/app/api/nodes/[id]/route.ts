import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireSession } from "@/lib/session";
import { generateToken, hashToken } from "@/lib/tokens";
import { agentNeedsUpdate } from "@/lib/agent-version";
import { getBundledAgentVersion } from "@/lib/agent-version.server";
import { getSettings, offlineAfterMs } from "@/lib/notifications";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { error } = await requireSession();
  if (error) return error;
  const { id } = await context.params;

  const node = await prisma.node.findUnique({
    where: { id },
    include: {
      certificates: { orderBy: { primaryDomain: "asc" } },
      jobs: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!node) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const settings = await getSettings();
  const cutoff = new Date(Date.now() - offlineAfterMs(settings.offlineAfterMinutes));
  let status = node.status;
  if (node.enrollmentUsed && (!node.lastHeartbeatAt || node.lastHeartbeatAt < cutoff)) {
    status = "offline";
  }

  const latestAgentVersion = getBundledAgentVersion();
  return NextResponse.json({
    node: {
      ...node,
      status,
      tokenHash: undefined,
      updateAvailable: agentNeedsUpdate(node.agentVersion, latestAgentVersion),
    },
    latestAgentVersion,
  });
}

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  hostname: z.string().nullable().optional(),
  rotateToken: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await context.params;

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const existing = await prisma.node.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let plainToken: string | undefined;
  const data: {
    name?: string;
    hostname?: string | null;
    tokenHash?: string;
    enrollmentUsed?: boolean;
    status?: "pending";
    offlineAlertSent?: boolean;
  } = {};
  if (parsed.data.name) data.name = parsed.data.name;
  if (parsed.data.hostname !== undefined) data.hostname = parsed.data.hostname;
  if (parsed.data.rotateToken) {
    plainToken = generateToken(32);
    data.tokenHash = hashToken(plainToken);
    data.enrollmentUsed = false;
    data.status = "pending";
    data.offlineAlertSent = false;
  }

  const node = await prisma.node.update({ where: { id }, data });
  return NextResponse.json({
    node: { id: node.id, name: node.name, hostname: node.hostname, status: node.status },
    enrollmentToken: plainToken,
  });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await context.params;
  await prisma.node.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
