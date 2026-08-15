import { createHash } from "crypto";
import { prisma } from "./prisma";

export async function authenticateAgent(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return prisma.node.findFirst({
    where: { tokenHash, enrollmentUsed: true },
  });
}
