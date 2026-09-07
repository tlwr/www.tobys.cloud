#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildUserRecord } from "./user-record.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const username =
  process.argv[2] || process.env.SEED_USERNAME || "jasmijn@example.com";
const password = process.argv[3] || process.env.SEED_PASSWORD || "secret";

const { recordJson } = buildUserRecord(username, password);

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
