import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "./auth";

export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { session: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session, error: null };
}

export async function requireAdmin() {
  const result = await requireSession();
  if (result.error) return result;
  if (result.session!.user.role !== "admin") {
    return {
      session: result.session,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return result;
}
