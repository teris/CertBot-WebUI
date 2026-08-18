import { NextResponse } from "next/server";
import { runNotificationChecks } from "@/lib/notifications";
import { requireAdmin } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

async function runSafely() {
  try {
    await runNotificationChecks();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("notifications/check failed", e);
    return NextResponse.json({ ok: false, error: "check failed" }, { status: 500 });
  }
}

export async function POST() {
  const { error } = await requireAdmin();
  if (error) return error;
  return runSafely();
}

/** Allow cron with CRON_SECRET header for unattended runs */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("x-cron-secret");
  if (!secret || header !== secret) {
    const { error } = await requireAdmin();
    if (error) return error;
  }
  return runSafely();
}
