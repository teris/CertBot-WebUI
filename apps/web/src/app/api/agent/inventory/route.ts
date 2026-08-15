import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAgent } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";
import { serializeDomains } from "@/lib/certs";

const certSchema = z.object({
  lineageName: z.string().min(1),
  primaryDomain: z.string().min(1),
  domains: z.array(z.string()).min(1),
  notBefore: z.string().datetime().nullable().optional(),
  notAfter: z.string().datetime().nullable().optional(),
});

const bodySchema = z.object({
  certificates: z.array(certSchema),
});

export async function POST(req: NextRequest) {
  const node = await authenticateAgent(req.headers.get("authorization"));
  if (!node) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const now = new Date();
  const seenLineages = new Set<string>();

  for (const cert of parsed.data.certificates) {
    seenLineages.add(cert.lineageName);
    await prisma.certificate.upsert({
      where: {
        nodeId_lineageName: { nodeId: node.id, lineageName: cert.lineageName },
      },
      create: {
        nodeId: node.id,
        lineageName: cert.lineageName,
        primaryDomain: cert.primaryDomain,
        domains: serializeDomains(cert.domains),
        notBefore: cert.notBefore ? new Date(cert.notBefore) : null,
        notAfter: cert.notAfter ? new Date(cert.notAfter) : null,
        lastSeenAt: now,
      },
      update: {
        primaryDomain: cert.primaryDomain,
        domains: serializeDomains(cert.domains),
        notBefore: cert.notBefore ? new Date(cert.notBefore) : null,
        notAfter: cert.notAfter ? new Date(cert.notAfter) : null,
        lastSeenAt: now,
      },
    });
  }

  const existing = await prisma.certificate.findMany({
    where: { nodeId: node.id },
    select: { id: true, lineageName: true },
  });
  const stale = existing.filter((c) => !seenLineages.has(c.lineageName));
  if (stale.length) {
    await prisma.certificate.deleteMany({
      where: { id: { in: stale.map((c) => c.id) } },
    });
  }

  await prisma.node.update({
    where: { id: node.id },
    data: { status: "online", lastHeartbeatAt: now },
  });

  return NextResponse.json({
    ok: true,
    upserted: parsed.data.certificates.length,
    removed: stale.length,
  });
}
