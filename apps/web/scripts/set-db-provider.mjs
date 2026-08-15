/**
 * Updates prisma/schema.prisma datasource provider based on DB_TYPE.
 * Usage: node scripts/set-db-provider.mjs sqlite|postgresql|mysql
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "..", "prisma", "schema.prisma");
const type = (process.argv[2] || process.env.DB_TYPE || "sqlite").toLowerCase();

const allowed = new Set(["sqlite", "postgresql", "mysql"]);
if (!allowed.has(type)) {
  console.error(`Unsupported DB_TYPE: ${type}. Use sqlite|postgresql|mysql`);
  process.exit(1);
}

let schema = fs.readFileSync(schemaPath, "utf8");
schema = schema.replace(
  /provider\s*=\s*"(sqlite|postgresql|mysql)"/,
  `provider = "${type}"`
);
fs.writeFileSync(schemaPath, schema);
console.log(`Prisma provider set to ${type}`);
