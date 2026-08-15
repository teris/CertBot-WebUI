/**
 * Demo-Daten für Screenshots / lokale Vorschau.
 * Ausführen: npx tsx prisma/seed-demo.ts
 */
import { createHash, randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function main() {
  const now = new Date();
  const days = (n: number) => new Date(now.getTime() + n * 86400000);

  const web01 = await prisma.node.upsert({
    where: { id: "demo-node-web01" },
    create: {
      id: "demo-node-web01",
      name: "web-01",
      hostname: "web-01.example.com",
      status: "online",
      agentVersion: "1.2.0",
      lastHeartbeatAt: now,
      tokenHash: hashToken(randomBytes(24).toString("hex")),
      enrollmentUsed: true,
    },
    update: {
      name: "web-01",
      hostname: "web-01.example.com",
      status: "online",
      agentVersion: "1.2.0",
      lastHeartbeatAt: now,
      enrollmentUsed: true,
    },
  });

  const mail01 = await prisma.node.upsert({
    where: { id: "demo-node-mail01" },
    create: {
      id: "demo-node-mail01",
      name: "mail-01",
      hostname: "mail-01.example.com",
      status: "online",
      agentVersion: "1.2.0",
      lastHeartbeatAt: now,
      tokenHash: hashToken(randomBytes(24).toString("hex")),
      enrollmentUsed: true,
    },
    update: {
      name: "mail-01",
      hostname: "mail-01.example.com",
      status: "online",
      agentVersion: "1.2.0",
      lastHeartbeatAt: now,
      enrollmentUsed: true,
    },
  });

  await prisma.node.upsert({
    where: { id: "demo-node-pending" },
    create: {
      id: "demo-node-pending",
      name: "staging-01",
      hostname: null,
      status: "pending",
      agentVersion: null,
      lastHeartbeatAt: null,
      tokenHash: hashToken(randomBytes(24).toString("hex")),
      enrollmentUsed: false,
    },
    update: {
      name: "staging-01",
      status: "pending",
      enrollmentUsed: false,
    },
  });

  const certs = [
    {
      nodeId: web01.id,
      lineageName: "example.com",
      primaryDomain: "example.com",
      domains: JSON.stringify(["example.com", "www.example.com"]),
      notBefore: days(-60),
      notAfter: days(45),
    },
    {
      nodeId: web01.id,
      lineageName: "api.example.com",
      primaryDomain: "api.example.com",
      domains: JSON.stringify(["api.example.com"]),
      notBefore: days(-80),
      notAfter: days(8),
    },
    {
      nodeId: mail01.id,
      lineageName: "mail.example.com",
      primaryDomain: "mail.example.com",
      domains: JSON.stringify(["mail.example.com"]),
      notBefore: days(-100),
      notAfter: days(-3),
    },
  ];

  for (const c of certs) {
    await prisma.certificate.upsert({
      where: {
        nodeId_lineageName: { nodeId: c.nodeId, lineageName: c.lineageName },
      },
      create: c,
      update: {
        primaryDomain: c.primaryDomain,
        domains: c.domains,
        notBefore: c.notBefore,
        notAfter: c.notAfter,
        lastSeenAt: now,
      },
    });
  }

  await prisma.job.deleteMany({
    where: { id: { in: ["demo-job-renew", "demo-job-add"] } },
  });

  await prisma.job.createMany({
    data: [
      {
        id: "demo-job-renew",
        nodeId: web01.id,
        type: "renew",
        status: "succeeded",
        payload: JSON.stringify({ lineageName: "example.com" }),
        log: "Renewing certificate for example.com...\nSuccessfully received certificate.\n",
        createdAt: days(-1),
        updatedAt: days(-1),
        finishedAt: days(-1),
      },
      {
        id: "demo-job-add",
        nodeId: mail01.id,
        type: "add",
        status: "queued",
        payload: JSON.stringify({ domains: ["webmail.example.com"] }),
        log: "",
      },
    ],
  });

  console.log("Demo-Daten bereit (web-01, mail-01, staging-01 + Zertifikate/Jobs).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
