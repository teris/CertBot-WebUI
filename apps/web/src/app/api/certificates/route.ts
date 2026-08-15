import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { certificateHealth, daysUntil, parseDomains } from "@/lib/certs";
import { getSettings } from "@/lib/notifications";

export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const nodeId = searchParams.get("nodeId") || undefined;
  const statusFilter = searchParams.get("status") || undefined;

  const settings = await getSettings();
  const certs = await prisma.certificate.findMany({
    where: nodeId ? { nodeId } : undefined,
    include: { node: { select: { id: true, name: true } } },
    orderBy: { notAfter: "asc" },
  });

  const mapped = certs.map((c) => {
    const health = certificateHealth(
      c.notAfter,
      settings.warnDaysBeforeExpiry,
      settings.overdueDays
    );
    return {
      id: c.id,
      nodeId: c.nodeId,
      nodeName: c.node.name,
      lineageName: c.lineageName,
      primaryDomain: c.primaryDomain,
      domains: parseDomains(c.domains),
      notBefore: c.notBefore,
      notAfter: c.notAfter,
      daysRemaining: daysUntil(c.notAfter),
      health,
      lastSeenAt: c.lastSeenAt,
    };
  });

  const filtered = statusFilter
    ? mapped.filter((c) => c.health === statusFilter)
    : mapped;

  return NextResponse.json({ certificates: filtered });
}
