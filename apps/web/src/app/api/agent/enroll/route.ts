import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolvePublicBaseUrl } from "@/lib/base-url";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/tokens";

const bodySchema = z.object({
  enrollmentToken: z.string().min(16),
  hostname: z.string().optional(),
  agentVersion: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const tokenHash = hashToken(parsed.data.enrollmentToken);
  const node = await prisma.node.findFirst({ where: { tokenHash } });
  if (!node) {
    return NextResponse.json({ error: "Invalid enrollment token" }, { status: 401 });
  }
  if (node.enrollmentUsed) {
    return NextResponse.json({ error: "Enrollment token already used" }, { status: 409 });
  }

  const updated = await prisma.node.update({
    where: { id: node.id },
    data: {
      enrollmentUsed: true,
      status: "online",
      hostname: parsed.data.hostname || node.hostname,
      agentVersion: parsed.data.agentVersion,
      lastHeartbeatAt: new Date(),
    },
  });

  const apiUrl = await resolvePublicBaseUrl(req);
  return NextResponse.json({
    nodeId: updated.id,
    name: updated.name,
    apiUrl,
    message: "Enrolled successfully. Keep using the same token as Bearer auth.",
  });
}
