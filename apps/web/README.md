# Dashboard (`apps/web`)

Next.js-App der CertBot-WebUI-Zentrale. Dokumentation und Screenshots: siehe [Root-README](../../README.md).

## Lokal

```bash
cp .env.example .env
npm install
npm run db:setup
npm run dev
```

Demo-Daten: `npx tsx prisma/seed-demo.ts`
