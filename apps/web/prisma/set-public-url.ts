import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const url = process.env.NEXTAUTH_URL?.replace(/\/$/, "");

async function main() {
  if (!url) {
    console.log("NEXTAUTH_URL fehlt — skip");
    return;
  }
  await prisma.setting.upsert({
    where: { id: "default" },
    create: { id: "default", publicBaseUrl: url },
    update: { publicBaseUrl: url },
  });
  console.log("publicBaseUrl:", url);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
