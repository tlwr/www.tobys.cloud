#!/usr/bin/env node
/**
 * Generate a cryptographically random SESSION_SECRET and set it on the
 * remote Worker via `wrangler secret put`.
 *
 * Usage:
 *   npm run set-session-secret
 *
 * Does not print the secret after upload. For local dev, write your own
 * value to .dev.vars (see .dev.vars.example).
 */
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
console.log("Verify with: npm run check-remote");
