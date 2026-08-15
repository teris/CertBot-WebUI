import { NextRequest, NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const node = await authenticateAgent(req.headers.get("authorization"));
  if (!node) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = await prisma.job.findMany({
    where: { nodeId: node.id, status: "queued" },
    orderBy: { createdAt: "asc" },
    take: 5,
  });

  return NextResponse.json({
    jobs: jobs.map((j) => ({
      id: j.id,
      type: j.type,
      payload: JSON.parse(j.payload || "{}"),
      createdAt: j.createdAt.toISOString(),
    })),
  });
}
