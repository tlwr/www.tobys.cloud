#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const secret = randomBytes(32).toString("base64url");

console.log("Setting remote SESSION_SECRET (32 random bytes, base64url)…");

execFileSync("npx", ["wrangler", "secret", "put", "SESSION_SECRET"], {
  cwd: root,
  input: secret,
  stdio: ["pipe", "inherit", "inherit"],
});

console.log("SESSION_SECRET updated on the Worker.");
