import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  const users = await prisma.user.findMany({
    orderBy: { email: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ users });
}

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  password: z.string().min(8),
  role: z.enum(["admin", "viewer"]).default("viewer"),
});

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  try {
    const user = await prisma.user.create({
      data: {
        email: parsed.data.email.toLowerCase(),
        name: parsed.data.name,
        passwordHash,
        role: parsed.data.role,
      },
      select: { id: true, email: true, name: true, role: true, active: true },
    });
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "Email already exists" }, { status: 409 });
  }
}
