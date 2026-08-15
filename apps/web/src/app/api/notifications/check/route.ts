import { NextResponse } from "next/server";
import { runNotificationChecks } from "@/lib/notifications";
import { requireAdmin } from "@/lib/session";

export async function POST() {
  const { error } = await requireAdmin();
  if (error) return error;
  await runNotificationChecks();
  return NextResponse.json({ ok: true });
}

/** Allow cron with CRON_SECRET header for unattended runs */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("x-cron-secret");
  if (!secret || header !== secret) {
    const { error } = await requireAdmin();
    if (error) return error;
  }
  await runNotificationChecks();
  return NextResponse.json({ ok: true });
}
