import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAgent } from "@/lib/agent-auth";
import { resolvePublicBaseUrl } from "@/lib/base-url";
import { notifyNodeRecovered } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  hostname: z.string().optional(),
  agentVersion: z.string().optional(),
  log: z.string().max(16_000).optional(),
});

export async function POST(req: NextRequest) {
  const node = await authenticateAgent(req.headers.get("authorization"));
  if (!node) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  const wasOffline = node.status === "offline";

  const updated = await prisma.node.update({
    where: { id: node.id },
    data: {
      status: "online",
      lastHeartbeatAt: new Date(),
      hostname: parsed.success ? parsed.data.hostname || node.hostname : node.hostname,
      agentVersion: parsed.success
        ? parsed.data.agentVersion || node.agentVersion
        : node.agentVersion,
      ...(parsed.success && parsed.data.log != null ? { agentLog: parsed.data.log } : {}),
      ...(wasOffline ? { offlineAlertSent: false } : {}),
    },
  });

  if (wasOffline) {
    try {
      await notifyNodeRecovered({ id: updated.id, name: updated.name });
    } catch (e) {
      console.error("recovery notify failed", e);
    }
  }

  const apiUrl = await resolvePublicBaseUrl(req);
  return NextResponse.json({
    ok: true,
    nodeId: updated.id,
    status: updated.status,
    apiUrl,
  });
}
