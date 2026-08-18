import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { certificateHealth } from "@/lib/certs";
import { getSettings, offlineAfterMs } from "@/lib/notifications";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getSettings();
  const [nodeCount, certs, queuedJobs, failedJobs] = await Promise.all([
    prisma.node.count(),
    prisma.certificate.findMany({ select: { notAfter: true } }),
    prisma.job.count({ where: { status: { in: ["queued", "running"] } } }),
    prisma.job.count({
      where: {
        status: "failed",
        finishedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  let ok = 0;
  let expiring = 0;
  let overdue = 0;
  for (const c of certs) {
    const h = certificateHealth(c.notAfter, settings.warnDaysBeforeExpiry, settings.overdueDays);
    if (h === "ok") ok++;
    else if (h === "expiring") expiring++;
    else if (h === "overdue") overdue++;
  }

  const cutoff = new Date(Date.now() - offlineAfterMs(settings.offlineAfterMinutes));
  const onlineNodes = await prisma.node.count({
    where: { enrollmentUsed: true, lastHeartbeatAt: { gte: cutoff } },
  });

  return NextResponse.json({
    stats: {
      nodes: nodeCount,
      onlineNodes,
      certificates: certs.length,
      ok,
      expiring,
      overdue,
      activeJobs: queuedJobs,
      failedJobsWeek: failedJobs,
    },
  });
}
