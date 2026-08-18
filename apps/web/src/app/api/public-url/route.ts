import { NextRequest, NextResponse } from "next/server";
import { agentInstallCommand, agentUpdateCommand, resolvePublicBaseUrl } from "@/lib/base-url";
import { requireSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const { error } = await requireSession();
  if (error) return error;
  const baseUrl = await resolvePublicBaseUrl(req);
  const token = req.nextUrl.searchParams.get("token") || "TOKEN";
  return NextResponse.json({
    baseUrl,
    installCommand: agentInstallCommand(baseUrl, token),
    updateCommand: agentUpdateCommand(baseUrl),
  });
}
