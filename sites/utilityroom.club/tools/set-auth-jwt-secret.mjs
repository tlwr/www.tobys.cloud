#!/usr/bin/env node
/**
 * Set AUTH_JWT_SECRET on this Worker. Must match auth.tobys.cloud.
 *
 * Usage:
 *   npm run set-auth-jwt-secret -- '<secret>'
 *   AUTH_JWT_SECRET=... npm run set-auth-jwt-secret
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function secretFromDevVars() {
  const p = path.join(root, ".dev.vars");
  if (!fs.existsSync(p)) {
    return "";
  }
  return fs.readFileSync(p, "utf8").match(/^AUTH_JWT_SECRET=(\S+)/m)?.[1] ?? "";
}

const secret =
  process.argv[2] || process.env.AUTH_JWT_SECRET || secretFromDevVars();

if (!secret) {
  console.error(
    "Usage: npm run set-auth-jwt-secret -- <same AUTH_JWT_SECRET as auth.tobys.cloud>",
  );
  process.exit(1);
}

console.log("Setting remote AUTH_JWT_SECRET…");
execFileSync("npx", ["wrangler", "secret", "put", "AUTH_JWT_SECRET"], {
  cwd: root,
  input: secret,
  stdio: ["pipe", "inherit", "inherit"],
});
console.log("AUTH_JWT_SECRET updated on the Worker.");
