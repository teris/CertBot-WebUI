import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAgent } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/notifications";

const bodySchema = z.object({
  status: z.enum(["running", "succeeded", "failed"]),
  logAppend: z.string().optional(),
  log: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const node = await authenticateAgent(req.headers.get("authorization"));
  if (!node) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const job = await prisma.job.findFirst({ where: { id, nodeId: node.id } });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  let log = job.log || "";
  if (parsed.data.log !== undefined) log = parsed.data.log;
  if (parsed.data.logAppend) log += parsed.data.logAppend;
  if (log.length > 200_000) log = log.slice(-200_000);

  const finished = parsed.data.status === "succeeded" || parsed.data.status === "failed";
  const updated = await prisma.job.update({
    where: { id: job.id },
    data: {
      status: parsed.data.status,
      log,
      startedAt: parsed.data.status === "running" && !job.startedAt ? new Date() : job.startedAt,
      finishedAt: finished ? new Date() : null,
    },
    include: { node: true },
  });

  if (parsed.data.status === "failed") {
    await notify({
      eventKey: `jobfail:${updated.id}`,
      subject: `[CertBot] Job fehlgeschlagen: ${updated.type} @ ${updated.node.name}`,
      message: `Job ${updated.type} auf ${updated.node.name} ist fehlgeschlagen.\n\n${updated.log.slice(-2000)}`,
      data: { node: updated.node.name, jobType: updated.type, jobId: updated.id },
    });
  }

  return NextResponse.json({ ok: true, id: updated.id, status: updated.status });
}
