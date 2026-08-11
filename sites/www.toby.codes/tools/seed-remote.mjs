#!/usr/bin/env node
/**
 * Seed a user into remote (production) Wrangler KV (USERS).
 * Requires explicit username + password (no defaults).
 *
 * Usage:
 *   npm run seed-remote -- <username> <password>
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildUserRecord } from "./user-record.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const [username, password] = process.argv.slice(2);

if (!username || !password) {
  console.error("Usage: npm run seed-remote -- <username> <password>");
  process.exit(1);
}

const { recordJson } = buildUserRecord(username, password);

console.log(`Seeding remote USERS KV: ${username}`);
execFileSync(
  "npx",
  [
    "wrangler",
    "kv",
    "key",
    "put",
    "--remote",
    "--binding=USERS",
    username,
    recordJson,
  ],
  { stdio: "inherit", cwd: root },
);
console.log("Remote seed complete.");
