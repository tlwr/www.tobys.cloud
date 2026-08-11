#!/usr/bin/env node
/**
 * Ensure .dev.vars exists with a SESSION_SECRET for local wrangler dev.
 * Does not overwrite an existing .dev.vars.
 *
 * Usage:
 *   npm run ensure-dev-vars
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const devVarsPath = path.join(root, ".dev.vars");

if (fs.existsSync(devVarsPath)) {
  const existing = fs.readFileSync(devVarsPath, "utf8");
  if (/^SESSION_SECRET=\S+/m.test(existing)) {
    console.log(".dev.vars already has SESSION_SECRET — leaving unchanged.");
    process.exit(0);
  }
  console.error(
    ".dev.vars exists but SESSION_SECRET is missing or empty. Add it manually.",
  );
  process.exit(1);
}

const secret = randomBytes(32).toString("base64url");
fs.writeFileSync(devVarsPath, `SESSION_SECRET=${secret}\n`, { mode: 0o600 });
console.log("Created .dev.vars with a random SESSION_SECRET.");
console.log("Run: npm run seed-local && npm run push-posts -- --local");
