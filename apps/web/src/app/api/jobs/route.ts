import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;

  const nodeId = new URL(req.url).searchParams.get("nodeId") || undefined;
  const jobs = await prisma.job.findMany({
    where: nodeId ? { nodeId } : undefined,
    include: { node: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ jobs });
}

const JOB_TYPES = ["renew", "delete", "add", "update", "restart"] as const;

const createSchema = z.object({
  nodeId: z.string().min(1),
  type: z.enum(JOB_TYPES),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(req: NextRequest) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const node = await prisma.node.findUnique({ where: { id: parsed.data.nodeId } });
  if (!node) return NextResponse.json({ error: "Node not found" }, { status: 404 });
  if (!node.enrollmentUsed) {
    return NextResponse.json({ error: "Node is not enrolled yet" }, { status: 400 });
  }

  if (parsed.data.type === "add") {
    const domains = parsed.data.payload.domains;
    if (!Array.isArray(domains) || domains.length === 0) {
      return NextResponse.json({ error: "add requires payload.domains" }, { status: 400 });
    }
  }
  if (parsed.data.type === "renew" || parsed.data.type === "delete") {
    if (!parsed.data.payload.lineageName && !parsed.data.payload.certName) {
      return NextResponse.json(
        { error: `${parsed.data.type} requires payload.lineageName` },
        { status: 400 }
      );
    }
  }

  if (parsed.data.type === "update" || parsed.data.type === "restart") {
    const existing = await prisma.job.findFirst({
      where: {
        nodeId: node.id,
        type: parsed.data.type,
        status: { in: ["queued", "running"] },
      },
    });
    if (existing) {
      return NextResponse.json({ job: existing, reused: true });
    }
  }

  const job = await prisma.job.create({
    data: {
      nodeId: parsed.data.nodeId,
      type: parsed.data.type,
      status: "queued",
      payload: JSON.stringify(parsed.data.payload),
      createdById: session!.user.id,
    },
  });

  return NextResponse.json({ job });
}
