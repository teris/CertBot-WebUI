import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.INITIAL_ADMIN_EMAIL || "admin@localhost").toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD || "admin123";
  const hash = await bcrypt.hash(password, 12);
  const publicBaseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, "") || null;

  await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: "Admin",
      passwordHash: hash,
      role: "admin",
      active: true,
    },
    update: {
      passwordHash: hash,
      role: "admin",
      active: true,
    },
  });

  const existing = await prisma.setting.findUnique({ where: { id: "default" } });
  await prisma.setting.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      publicBaseUrl: publicBaseUrl || undefined,
    },
    update: {
      // Nur setzen, wenn noch leer — manuelle Domain in den Einstellungen bleibt erhalten
      ...(existing?.publicBaseUrl || !publicBaseUrl ? {} : { publicBaseUrl }),
    },
  });

  console.log(`Admin ready: ${email}`);
  if (publicBaseUrl && !existing?.publicBaseUrl) {
    console.log(`publicBaseUrl gesetzt: ${publicBaseUrl}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
