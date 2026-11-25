#!/usr/bin/env node
/**
 * Sync licensed webfonts between fonts/ and the R2 bucket tobys-cloud-fonts.
 * The font bytes are gitignored. fonts.manifest.json (names and hashes) is not.
 *
 *   node tools/fonts.mjs manifest   # rewrite the manifest from fonts/
 *   node tools/fonts.mjs push       # upload fonts/ and rewrite the manifest
 *   node tools/fonts.mjs pull       # download manifest keys that differ locally
 *
 * Remote R2 is the default. Pass --local for Wrangler's simulator.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fontDir = path.join(root, "fonts");
const manifestPath = path.join(root, "fonts.manifest.json");
const bucket = "tobys-cloud-fonts";
const wrangler = path.join(
  root,
  "sites/assets.tobys.cloud/node_modules/.bin/wrangler",
);

const CONTENT_TYPES = {
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function walk(dir, prefix = "") {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const abs = path.join(dir, name);
    const key = prefix ? `${prefix}/${name}` : name;
    const info = statSync(abs);
    if (info.isDirectory()) {
      out.push(...walk(abs, key));
      continue;
    }
    const ext = path.extname(name).toLowerCase();
    const contentType = CONTENT_TYPES[ext];
    if (!contentType) {
      throw new Error(`refusing non-font file fonts/${key}`);
    }
    out.push({ key, abs, bytes: info.size, contentType });
  }
  out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function manifestFrom(files) {
  return {
    bucket,
    files: files.map((file) => ({
      key: file.key,
      sha256: sha256(file.abs),
      bytes: file.bytes,
      contentType: file.contentType,
    })),
  };
}

function writeManifest(files) {
  const manifest = manifestFrom(files);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function runWrangler(args) {
  if (!existsSync(wrangler)) {
    console.error(`missing ${wrangler}. Run npm ci in sites/assets.tobys.cloud.`);
    process.exit(1);
  }
  const result = spawnSync(wrangler, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function storageFlag(remote) {
  return remote ? "--remote" : "--local";
}

function push(remote) {
  const files = walk(fontDir);
  if (files.length === 0) {
    console.error("fonts/ is empty. Refusing to push.");
    process.exit(1);
  }
  for (const file of files) {
    console.log(`push ${file.key}`);
    runWrangler([
      "r2",
      "object",
      "put",
      `${bucket}/${file.key}`,
      "--file",
      file.abs,
      "--content-type",
      file.contentType,
      "--cache-control",
      "public, max-age=86400",
      "-y",
      storageFlag(remote),
    ]);
  }
  writeManifest(files);
  console.log(`wrote ${files.length} entries to fonts.manifest.json`);
}

function pull(remote) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  mkdirSync(fontDir, { recursive: true });
  for (const file of manifest.files) {
    const dest = path.join(fontDir, file.key);
    if (existsSync(dest) && sha256(dest) === file.sha256) {
      console.log(`skip ${file.key}`);
      continue;
    }
    console.log(`pull ${file.key}`);
    mkdirSync(path.dirname(dest), { recursive: true });
    runWrangler([
      "r2",
      "object",
      "get",
      `${bucket}/${file.key}`,
      "--file",
      dest,
      "-y",
      storageFlag(remote),
    ]);
    const got = sha256(dest);
    if (got !== file.sha256) {
      console.error(
        `${file.key} hash ${got} does not match manifest ${file.sha256}`,
      );
      process.exit(1);
    }
  }
}

const remote = !process.argv.includes("--local");
const command = process.argv.find((arg) =>
  ["push", "pull", "manifest"].includes(arg),
);

if (command === "manifest") {
  const files = walk(fontDir);
  if (files.length === 0) {
    console.error("fonts/ is empty.");
    process.exit(1);
  }
  writeManifest(files);
  console.log(`wrote ${files.length} entries to fonts.manifest.json`);
} else if (command === "push") {
  push(remote);
} else if (command === "pull") {
  pull(remote);
} else {
  console.error("usage: node tools/fonts.mjs push|pull|manifest [--local]");
  process.exit(1);
}
