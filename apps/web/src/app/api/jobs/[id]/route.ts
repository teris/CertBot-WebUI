import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { error } = await requireSession();
  if (error) return error;
  const { id } = await context.params;

  const job = await prisma.job.findUnique({
    where: { id },
    include: { node: { select: { id: true, name: true } } },
  });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ job });
}
