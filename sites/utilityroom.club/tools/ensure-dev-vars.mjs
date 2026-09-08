#!/usr/bin/env node
/**
 * Ensure .dev.vars has AUTH_JWT_SECRET for local wrangler dev.
 * Reuses the auth.tobys.cloud secret when present so local SSO works.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const devVarsPath = path.join(root, ".dev.vars");
const authDevVars = path.resolve(root, "../auth.tobys.cloud/.dev.vars");

function readSecret(file) {
  if (!fs.existsSync(file)) {
    return null;
  }
  return (
    fs.readFileSync(file, "utf8").match(/^AUTH_JWT_SECRET=(\S+)/m)?.[1] ?? null
  );
}

if (fs.existsSync(devVarsPath)) {
  const existing = fs.readFileSync(devVarsPath, "utf8");
  if (/^AUTH_JWT_SECRET=\S+/m.test(existing)) {
    console.log(".dev.vars already has AUTH_JWT_SECRET — leaving unchanged.");
    process.exit(0);
  }
  console.error(
    ".dev.vars exists but AUTH_JWT_SECRET is missing. Add it manually (same value as auth.tobys.cloud).",
  );
  process.exit(1);
}

const fromAuth = readSecret(authDevVars);
const jwt = fromAuth || randomBytes(32).toString("base64url");
fs.writeFileSync(
  devVarsPath,
  `AUTH_JWT_SECRET=${jwt}\nAUTH_ISSUER=http://localhost:8788\n`,
  { mode: 0o600 },
);
if (fromAuth) {
  console.log("Created .dev.vars using AUTH_JWT_SECRET from auth.tobys.cloud.");
} else {
  console.log("Created .dev.vars with a new AUTH_JWT_SECRET.");
  console.log(
    "For local SSO, copy this AUTH_JWT_SECRET into sites/auth.tobys.cloud/.dev.vars",
  );
}
