#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import bcrypt from "bcryptjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const email = (process.argv[2] || "").trim().toLowerCase();
const password = process.argv[3] || "";
if (!email || !password) {
  console.error(
    "Usage: npm run seed-remote -- email@example.com 'password' [perm,perm]",
  );
  process.exit(1);
}
const permissions = (
  process.argv[4] ||
  "auth:admin,toby-codes:admin,jvnl:admin,utilityroom:admin"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const record = JSON.stringify({
  email,
  hashedPassword: bcrypt.hashSync(password, 10),
  permissions,
});

console.log(`Seeding remote USERS KV: ${email}`);
execFileSync(
  "npx",
  [
    "wrangler",
    "kv",
    "key",
    "put",
    "--remote",
    "--binding=USERS",
    email,
    record,
  ],
  { stdio: "inherit", cwd: root },
);
