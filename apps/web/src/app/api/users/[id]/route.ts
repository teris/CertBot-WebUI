import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";

const patchSchema = z.object({
  name: z.string().optional(),
  role: z.enum(["admin", "viewer"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdmin();
  if (error) return error;
  const { id } = await context.params;

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (parsed.data.active === false && session!.user.id === id) {
    return NextResponse.json({ error: "Cannot deactivate yourself" }, { status: 400 });
  }

  const data: {
    name?: string;
    role?: "admin" | "viewer";
    active?: boolean;
    passwordHash?: string;
  } = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.active !== undefined) data.active = parsed.data.active;
  if (parsed.data.password) data.passwordHash = await bcrypt.hash(parsed.data.password, 12);

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, email: true, name: true, role: true, active: true },
  });
  return NextResponse.json({ user });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAdmin();
  if (error) return error;
  const { id } = await context.params;
  if (session!.user.id === id) {
    return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
  }
  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
