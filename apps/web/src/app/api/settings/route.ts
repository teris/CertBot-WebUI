import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSettings } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireSession } from "@/lib/session";
import { resolvePublicBaseUrl } from "@/lib/base-url";

export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;
  const settings = await getSettings();
  const detectedBaseUrl = await resolvePublicBaseUrl(req);
  return NextResponse.json({
    settings: {
      ...settings,
      smtpPass: settings.smtpPass ? "********" : null,
    },
    detectedBaseUrl,
  });
}

const patchSchema = z.object({
  publicBaseUrl: z
    .string()
    .nullable()
    .optional()
    .transform((v) => {
      if (v == null || v.trim() === "") return null;
      return v.trim().replace(/\/$/, "");
    }),
  smtpHost: z.string().nullable().optional(),
  smtpPort: z.number().int().nullable().optional(),
  smtpUser: z.string().nullable().optional(),
  smtpPass: z.string().nullable().optional(),
  smtpFrom: z.string().nullable().optional(),
  smtpTls: z.boolean().optional(),
  webhookUrl: z.string().nullable().optional(),
  warnDaysBeforeExpiry: z.number().int().min(1).max(90).optional(),
  overdueDays: z.number().int().min(0).max(30).optional(),
  notifyOnJobFailure: z.boolean().optional(),
  notifyOnNodeOffline: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const data = { ...parsed.data };
  if (data.smtpPass === "********") delete data.smtpPass;
  if (data.publicBaseUrl) {
    try {
      // eslint-disable-next-line no-new
      new URL(data.publicBaseUrl);
    } catch {
      return NextResponse.json(
        { error: "publicBaseUrl muss eine gültige URL sein (http://… oder https://…)" },
        { status: 400 }
      );
    }
  }

  const settings = await prisma.setting.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });

  return NextResponse.json({
    settings: { ...settings, smtpPass: settings.smtpPass ? "********" : null },
  });
}
