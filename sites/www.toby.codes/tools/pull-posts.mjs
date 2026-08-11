#!/usr/bin/env node
/**
 * Pull all posts from POSTS KV into posts/*.md (for git backup after browser edits).
 *
 * Usage:
 *   npm run pull-posts -- --local
 *   npm run pull-posts -- --remote
 *
 * Overwrites local files for keys present in KV. Does not delete local posts
 * that are absent from KV.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const postsDir = path.join(root, "posts");

const mode = parseMode(process.argv.slice(2));

const listArgs = ["wrangler", "kv", "key", "list", "--binding=POSTS"];
if (mode === "local") {
  listArgs.push("--local");
} else {
  listArgs.push("--remote");
}

const listOut = execFileSync("npx", listArgs, {
  cwd: root,
  encoding: "utf8",
});
const keys = JSON.parse(listOut || "[]");
const names = (Array.isArray(keys) ? keys : [])
  .map((k) => k.name)
  .filter((n) => typeof n === "string" && /^[-_a-zA-Z0-9]+$/.test(n))
  .sort();

if (names.length === 0) {
  console.error(`No keys in POSTS KV (${mode})`);
  process.exit(1);
}

fs.mkdirSync(postsDir, { recursive: true });
console.log(`Pulling ${names.length} post(s) from POSTS KV (${mode})…`);

for (const slug of names) {
  const getArgs = ["wrangler", "kv", "key", "get", "--binding=POSTS", slug];
  if (mode === "local") {
    getArgs.push("--local");
  } else {
    getArgs.push("--remote");
  }

  const body = execFileSync("npx", getArgs, {
    cwd: root,
    encoding: "utf8",
  });
  const outPath = path.join(postsDir, `${slug}.md`);
  fs.writeFileSync(outPath, body);
  console.log(`  ✓ ${slug}.md`);
}

console.log(`Pull complete (${mode}). Review diffs and commit when ready.`);

function parseMode(argv) {
  if (argv.includes("--local") && !argv.includes("--remote")) {
    return "local";
  }
  if (argv.includes("--remote") && !argv.includes("--local")) {
    return "remote";
  }
  console.error("Usage: npm run pull-posts -- --local | --remote");
  process.exit(1);
}
