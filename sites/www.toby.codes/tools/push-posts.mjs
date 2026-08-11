#!/usr/bin/env node
/**
 * Sync all posts/*.md from the repo into POSTS KV.
 *
 * Usage:
 *   npm run push-posts -- --local
 *   npm run push-posts -- --remote
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const postsDir = path.join(root, "posts");

const mode = parseMode(process.argv.slice(2));

const files = fs
  .readdirSync(postsDir)
  .filter((f) => f.endsWith(".md"))
  .sort();

if (files.length === 0) {
  console.error("No posts/*.md files found");
  process.exit(1);
}

console.log(`Pushing ${files.length} post(s) to POSTS KV (${mode})…`);

for (const file of files) {
  const slug = file.replace(/\.md$/, "");
  const body = fs.readFileSync(path.join(postsDir, file), "utf8");
  const args = [
    "wrangler",
    "kv",
    "key",
    "put",
    "--binding=POSTS",
    slug,
    body,
  ];
  if (mode === "local") {
    args.push("--local");
  } else {
    args.push("--remote");
  }

  execFileSync("npx", args, { stdio: "inherit", cwd: root });
  console.log(`  ✓ ${slug}`);
}

console.log(`Push complete (${mode}).`);

function parseMode(argv) {
  if (argv.includes("--local") && !argv.includes("--remote")) {
    return "local";
  }
  if (argv.includes("--remote") && !argv.includes("--local")) {
    return "remote";
  }
  console.error("Usage: npm run push-posts -- --local | --remote");
  process.exit(1);
}
