#!/usr/bin/env node
/**
 * Import pictures, tags, and Active Storage blobs from a Rails dump.
 * Users now live on auth.tobys.cloud — this script does not import them.
 *
 * Prerequisites: `sqlite3` CLI on PATH.
 *
 *   kubectl -n jasmijn cp <pod>:/pvc/sqlite/production.sqlite3 ./import/production.sqlite3
 *   kubectl -n jasmijn cp <pod>:/pvc/storage ./import/storage
 *
 *   npm run import-from-rails -- --db ./import/production.sqlite3 --storage ./import/storage --local
 *   npm run import-from-rails -- --db ./import/production.sqlite3 --storage ./import/storage --remote
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) {
    return process.argv[i + 1];
  }
  return fallback;
}

const dbPath = arg("--db");
const storageRoot = arg("--storage");
const remote = process.argv.includes("--remote");
const local = !remote;

if (!dbPath || !storageRoot) {
  console.error(
    "Usage: import-from-rails --db production.sqlite3 --storage ./storage [--local|--remote]",
  );
  process.exit(1);
}

if (remote) {
  const toml = fs.readFileSync(path.join(root, "wrangler.toml"), "utf8");
  if (toml.includes("000000000000000000000000000000")) {
    console.error(
      "wrangler.toml still has placeholder KV ids (0000…). Create real namespaces first:\n" +
        "  npx wrangler kv namespace create jasmijnvink-com-pictures --binding PICTURES --update-config\n" +
        "  npx wrangler kv namespace create jasmijnvink-com-tags --binding TAGS --update-config\n" +
        "  npx wrangler r2 bucket create jasmijnvink-com-images",
    );
    process.exit(1);
  }
}

/** Wrangler 4 defaults to local; --remote is required for production KV/R2. */
const locationFlags = local ? ["--local"] : ["--remote"];

function sql(query) {
  const out = execFileSync(
    "sqlite3",
    ["-json", dbPath, query],
    { encoding: "utf8" },
  ).trim();
  if (!out) {
    return [];
  }
  return JSON.parse(out);
}

function wrangler(args) {
  execFileSync(
    "npx",
    ["wrangler", ...args.slice(0, 3), ...locationFlags, ...args.slice(3)],
    {
      stdio: "inherit",
      cwd: root,
    },
  );
}

function blobPath(key) {
  return path.join(storageRoot, key.slice(0, 2), key.slice(2, 4), key);
}

const pictures = sql(
  "SELECT id, title, description, visible, created_at FROM pictures",
);
const joins = sql("SELECT picture_id, tag_id FROM pictures_tags");
const tags = sql("SELECT id FROM tags");
const attachments = sql(`
  SELECT a.record_id AS picture_id, b.key, b.content_type, b.filename, b.byte_size
  FROM active_storage_attachments a
  JOIN active_storage_blobs b ON b.id = a.blob_id
  WHERE a.record_type = 'Picture' AND a.name = 'image'
  ORDER BY b.byte_size ASC
`);

const tagsByPicture = new Map();
for (const row of joins) {
  const id = String(row.picture_id);
  const list = tagsByPicture.get(id) ?? [];
  list.push(String(row.tag_id));
  tagsByPicture.set(id, list);
}

const blobByPicture = new Map();
for (const row of attachments) {
  blobByPicture.set(String(row.picture_id), row);
}

const tagMembers = new Map();
for (const t of tags) {
  tagMembers.set(String(t.id), []);
}
for (const [picId, list] of tagsByPicture) {
  for (const tag of list) {
    const members = tagMembers.get(tag) ?? [];
    members.push(picId);
    tagMembers.set(tag, members);
  }
}

console.log(
  `Importing ${pictures.length} pictures, ${tagMembers.size} tags (${local ? "local" : "remote"})`,
);

for (const [tag, ids] of tagMembers) {
  wrangler([
    "kv",
    "key",
    "put",
    "--binding=TAGS",
    tag,
    JSON.stringify(ids),
  ]);
}

for (const p of pictures) {
  const id = String(p.id);
  const blob = blobByPicture.get(id);
  if (!blob) {
    console.warn(`skip picture ${id}: no attached image`);
    continue;
  }
  const file = blobPath(blob.key);
  if (!fs.existsSync(file)) {
    console.warn(`skip picture ${id}: missing blob ${file}`);
    continue;
  }
  const r2Key = `pictures/${id}`;
  execFileSync(
    "npx",
    [
      "wrangler",
      "r2",
      "object",
      "put",
      `jasmijnvink-com-images/${r2Key}`,
      ...locationFlags,
      "--file",
      file,
      "--content-type",
      blob.content_type || "application/octet-stream",
    ],
    { stdio: "inherit", cwd: root },
  );

  const record = {
    id,
    title: p.title ?? "",
    description: p.description ?? "",
    visible: p.visible === 1 || p.visible === true,
    tags: tagsByPicture.get(id) ?? [],
    r2Key,
    contentType: blob.content_type || "application/octet-stream",
    createdAt: p.created_at
      ? new Date(p.created_at).toISOString()
      : new Date().toISOString(),
  };
  wrangler(["kv", "key", "put", "--binding=PICTURES", id, JSON.stringify(record)]);
}

console.log("Import complete.");
