import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { certificateHealth, daysUntil, parseDomains } from "@/lib/certs";
import { getSettings } from "@/lib/notifications";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { error } = await requireSession();
  if (error) return error;
  const { id } = await context.params;

  const cert = await prisma.certificate.findUnique({
    where: { id },
    include: {
      node: { select: { id: true, name: true, hostname: true, status: true } },
    },
  });
  if (!cert) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const settings = await getSettings();
  const jobs = await prisma.job.findMany({
    where: {
      nodeId: cert.nodeId,
      OR: [
        { payload: { contains: cert.lineageName } },
        { payload: { contains: cert.primaryDomain } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({
    certificate: {
      id: cert.id,
      nodeId: cert.nodeId,
      node: cert.node,
      lineageName: cert.lineageName,
      primaryDomain: cert.primaryDomain,
      domains: parseDomains(cert.domains),
      notBefore: cert.notBefore,
      notAfter: cert.notAfter,
      daysRemaining: daysUntil(cert.notAfter),
      health: certificateHealth(
        cert.notAfter,
        settings.warnDaysBeforeExpiry,
        settings.overdueDays
      ),
      lastSeenAt: cert.lastSeenAt,
    },
    jobs,
  });
}
