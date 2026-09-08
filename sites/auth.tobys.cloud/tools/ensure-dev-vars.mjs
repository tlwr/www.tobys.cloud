#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const p = path.join(root, ".dev.vars");
if (fs.existsSync(p) && /AUTH_JWT_SECRET=\S+/.test(fs.readFileSync(p, "utf8"))) {
  console.log(".dev.vars already has AUTH_JWT_SECRET — leaving unchanged.");
  process.exit(0);
}
if (fs.existsSync(p)) {
  console.error(".dev.vars exists but AUTH_JWT_SECRET is missing. Add it manually.");
  process.exit(1);
}
const jwt = randomBytes(32).toString("base64url");
fs.writeFileSync(
  p,
  `AUTH_JWT_SECRET=${jwt}\nAUTH_ISSUER=http://localhost:8788\n`,
  { mode: 0o600 },
);
console.log("Created .dev.vars with AUTH_JWT_SECRET.");
console.log("Copy AUTH_JWT_SECRET into each app's .dev.vars (same value).");
console.log("Run: npm run seed-local");
