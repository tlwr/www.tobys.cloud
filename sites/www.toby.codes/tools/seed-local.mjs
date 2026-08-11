#!/usr/bin/env node
/**
 * Seed a user into local Wrangler KV (USERS).
 * Safe for integration tests / fresh local env.
 *
 * Usage:
 *   npm run seed-local -- [username] [password]
 *   npm run seed-local -- toby s3cret
 *
 * Defaults (handy for tests): username=toby password=secret
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildUserRecord } from "./user-record.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const username = process.argv[2] || process.env.SEED_USERNAME || "toby";
const password = process.argv[3] || process.env.SEED_PASSWORD || "secret";

const { recordJson } = buildUserRecord(username, password);

// --local writes to the Miniflare/local store (not the remote production id).
console.log(`Seeding local USERS KV: ${username}`);
execFileSync(
  "npx",
  [
    "wrangler",
    "kv",
    "key",
    "put",
    "--local",
    "--binding=USERS",
    username,
    recordJson,
  ],
  { stdio: "inherit", cwd: root },
);
console.log("Local seed complete.");
