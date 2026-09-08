#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const devVarsPath = path.join(root, ".dev.vars");

function secretFromDevVars() {
  if (!fs.existsSync(devVarsPath)) {
    return "";
  }
  return (
    fs.readFileSync(devVarsPath, "utf8").match(/^AUTH_JWT_SECRET=(\S+)/m)?.[1] ??
    ""
  );
}

function put(name, value) {
  console.log(`Setting remote ${name}…`);
  execFileSync("npx", ["wrangler", "secret", "put", name], {
    cwd: root,
    input: value,
    stdio: ["pipe", "inherit", "inherit"],
  });
}

let jwt = secretFromDevVars();
if (!jwt) {
  jwt = randomBytes(32).toString("base64url");
  const rest = fs.existsSync(devVarsPath)
    ? fs.readFileSync(devVarsPath, "utf8")
    : "";
  fs.writeFileSync(
    devVarsPath,
    `AUTH_JWT_SECRET=${jwt}\nAUTH_ISSUER=http://localhost:8788\n${rest}`,
    { mode: 0o600 },
  );
  console.log("Wrote AUTH_JWT_SECRET to .dev.vars (not printed).");
}

put("AUTH_JWT_SECRET", jwt);
console.log("AUTH_JWT_SECRET is set on auth.tobys.cloud (value not shown).");
console.log("Copy AUTH_JWT_SECRET from this site's .dev.vars onto each app:");
console.log("  cd ../www.toby.codes && npm run set-auth-jwt-secret");
console.log("  cd ../jasmijnvink.com && npm run set-auth-jwt-secret");
console.log("  cd ../utilityroom.club && npm run set-auth-jwt-secret");
console.log("Generating a new secret invalidates every session.");
