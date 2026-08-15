import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAgent } from "@/lib/agent-auth";
import { resolvePublicBaseUrl } from "@/lib/base-url";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  hostname: z.string().optional(),
  agentVersion: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const node = await authenticateAgent(req.headers.get("authorization"));
  if (!node) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);

  const updated = await prisma.node.update({
    where: { id: node.id },
    data: {
      status: "online",
      lastHeartbeatAt: new Date(),
      hostname: parsed.success ? parsed.data.hostname || node.hostname : node.hostname,
      agentVersion: parsed.success
        ? parsed.data.agentVersion || node.agentVersion
        : node.agentVersion,
    },
  });

  const apiUrl = await resolvePublicBaseUrl(req);
  return NextResponse.json({
    ok: true,
    nodeId: updated.id,
    status: updated.status,
    apiUrl,
  });
}
