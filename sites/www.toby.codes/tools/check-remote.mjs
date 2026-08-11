#!/usr/bin/env node
/**
 * Verify remote Worker config matches what the app expects.
 *
 * Checks:
 *   - SESSION_SECRET secret is set
 *   - USERS KV binding id is configured and reachable
 *   - optional: at least one user key exists
 *
 * Usage:
 *   npm run check-remote
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(args, { allowFail = false } = {}) {
  try {
    return execFileSync("npx", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    if (allowFail) {
      return err.stdout?.toString?.() ?? "";
    }
    throw err;
  }
}

function parseTomlBindingId(toml, binding) {
  const re = new RegExp(
    `\\[\\[kv_namespaces\\]\\]\\s*binding\\s*=\\s*"${binding}"\\s*id\\s*=\\s*"([^"]+)"`,
  );
  return toml.match(re)?.[1] ?? null;
}

let failed = 0;

function ok(msg) {
  console.log(`✓ ${msg}`);
}

function bad(msg) {
  console.error(`✗ ${msg}`);
  failed += 1;
}

console.log("Checking remote setup for www-toby-codes…\n");

// --- SESSION_SECRET ---
let secrets = [];
try {
  const out = run(["wrangler", "secret", "list"]);
  secrets = JSON.parse(out || "[]");
} catch (err) {
  bad(`could not list secrets: ${err.message}`);
}

const secretNames = new Set(
  (Array.isArray(secrets) ? secrets : []).map((s) => s.name ?? s),
);
if (secretNames.has("SESSION_SECRET")) {
  ok("SESSION_SECRET is set (value not shown)");
} else {
  bad("SESSION_SECRET is missing — run: npm run set-session-secret");
}

// --- wrangler.toml KV ids ---
const tomlPath = path.join(root, "wrangler.toml");
const toml = fs.readFileSync(tomlPath, "utf8");
const usersId = parseTomlBindingId(toml, "USERS");
const postsId = parseTomlBindingId(toml, "POSTS");
if (usersId) {
  ok(`USERS kv id in wrangler.toml: ${usersId}`);
} else {
  bad('USERS kv id missing from wrangler.toml');
}
if (postsId) {
  ok(`POSTS kv id in wrangler.toml: ${postsId}`);
} else {
  bad('POSTS kv id missing from wrangler.toml');
}

// --- remote USERS KV ---
if (usersId) {
  try {
    const listOut = run([
      "wrangler",
      "kv",
      "key",
      "list",
      "--remote",
      "--binding=USERS",
    ]);
    let keys = [];
    try {
      keys = JSON.parse(listOut || "[]");
    } catch {
      keys = [];
    }
    const n = Array.isArray(keys) ? keys.length : 0;
    if (n > 0) {
      ok(`USERS KV reachable; ${n} key(s) present`);
    } else {
      bad(
        "USERS KV reachable but empty — run: npm run seed-remote -- <user> <pass>",
      );
    }
  } catch (err) {
    bad(`USERS KV not reachable remotely: ${err.stderr || err.message}`);
  }
}

// --- remote POSTS KV ---
if (postsId) {
  try {
    const listOut = run([
      "wrangler",
      "kv",
      "key",
      "list",
      "--remote",
      "--binding=POSTS",
    ]);
    let keys = [];
    try {
      keys = JSON.parse(listOut || "[]");
    } catch {
      keys = [];
    }
    const n = Array.isArray(keys) ? keys.length : 0;
    if (n > 0) {
      ok(`POSTS KV reachable; ${n} key(s) present`);
    } else {
      bad(
        "POSTS KV reachable but empty — run: npm run push-posts -- --remote",
      );
    }
  } catch (err) {
    bad(`POSTS KV not reachable remotely: ${err.stderr || err.message}`);
  }
}

// --- no preview_id (we intentionally use a single namespace) ---
if (/preview_id\s*=/.test(toml)) {
  bad("wrangler.toml still has preview_id; remove unused preview KV");
} else {
  ok("no preview_id in wrangler.toml");
}

console.log("");
if (failed > 0) {
  console.error(`check-remote: ${failed} issue(s) found`);
  process.exit(1);
}
console.log("check-remote: all good");
