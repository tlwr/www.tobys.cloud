#!/usr/bin/env node
/**
 * Query catalog.json: site names, paths, CI scripts, git-affected set.
 *
 *   node tools/catalog.mjs list
 *   node tools/catalog.mjs resolve [name...]
 *   node tools/catalog.mjs path <name>
 *   node tools/catalog.mjs get <name> <field>
 *   node tools/catalog.mjs ci-scripts <name>
 *   node tools/catalog.mjs table
 *   node tools/catalog.mjs affected [base]
 *   node tools/catalog.mjs affected-json [base]
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "catalog.json"), "utf8"),
);

const GLOBAL_PATHS = [
  "catalog.json",
  "justfile",
  "tools/catalog.mjs",
  ".github/workflows/ci.yml",
];

function sites() {
  return catalog.sites;
}

function find(name) {
  const aliased = catalog.aliases[name] ?? name;
  const site = sites().find((s) => s.name === aliased || s.path === aliased);
  if (!site) {
    console.error(`unknown site: ${name}`);
    console.error(`known: ${sites().map((s) => s.name).join(", ")}`);
    console.error(
      `aliases: ${Object.entries(catalog.aliases)
        .map(([k, v]) => `${k}→${v}`)
        .join(", ")}`,
    );
    process.exit(1);
  }
  return site;
}

function resolveNames(names) {
  if (names.length === 0) {
    return sites().map((s) => s.name);
  }
  return names.map((n) => find(n).name);
}

function printLines(items) {
  for (const item of items) {
    console.log(item);
  }
}

function gitNames(args) {
  try {
    const out = execFileSync("git", args, { cwd: root, encoding: "utf8" });
    return out.split("\n").map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function changedFiles(base) {
  if (!base || /^0+$/.test(base)) {
    return null;
  }
  const files = new Set([
    ...gitNames(["diff", "--name-only", `${base}...HEAD`]),
    ...gitNames(["diff", "--name-only", base]),
    ...gitNames(["diff", "--name-only", "--cached", base]),
    ...gitNames(["ls-files", "--others", "--exclude-standard"]),
  ]);
  return [...files];
}

function defaultBase() {
  try {
    execFileSync("git", ["rev-parse", "--verify", "origin/main"], {
      cwd: root,
      stdio: "ignore",
    });
    return "origin/main";
  } catch {
    return "main";
  }
}

function affected(base) {
  const files = changedFiles(base ?? defaultBase());
  if (files === null) {
    return sites().map((s) => s.name);
  }
  if (
    files.some((f) =>
      GLOBAL_PATHS.some((g) => f === g || f.startsWith(`${g}/`)),
    )
  ) {
    return sites().map((s) => s.name);
  }
  const names = new Set();
  const pkgTouched = new Set();
  for (const pkg of catalog.packages ?? []) {
    if (files.some((f) => f === pkg.path || f.startsWith(`${pkg.path}/`))) {
      pkgTouched.add(pkg.name);
    }
  }
  for (const site of sites()) {
    if (files.some((f) => f === site.path || f.startsWith(`${site.path}/`))) {
      names.add(site.name);
    }
    if (site.depends?.some((d) => pkgTouched.has(d))) {
      names.add(site.name);
    }
  }
  return [...names];
}

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case "list":
    printLines(sites().map((s) => s.name));
    break;
  case "resolve":
    printLines(resolveNames(args));
    break;
  case "path":
    console.log(find(args[0] ?? "").path);
    break;
  case "get": {
    const site = find(args[0] ?? "");
    const field = args[1];
    const value = site[field];
    if (value === undefined) {
      console.error(`no field ${field} on ${site.name}`);
      process.exit(1);
    }
    console.log(Array.isArray(value) ? value.join("\n") : String(value));
    break;
  }
  case "ci-scripts":
    printLines(find(args[0] ?? "").ci ?? []);
    break;
  case "table": {
    const cols = [
      ["name", "path", "depends", "ci"],
      ...sites().map((s) => [
        s.name,
        s.path,
        (s.depends ?? []).join(",") || "-",
        (s.ci ?? []).join(","),
      ]),
    ];
    const widths = cols[0].map((_, i) =>
      Math.max(...cols.map((row) => row[i].length)),
    );
    const rows = cols.map((row) =>
      row.map((cell, i) => cell.padEnd(widths[i])).join("  "),
    );
    if (Object.keys(catalog.aliases).length) {
      rows.push("");
      rows.push("aliases:");
      for (const [k, v] of Object.entries(catalog.aliases)) {
        rows.push(`  ${k} → ${v}`);
      }
    }
    console.log(rows.join("\n"));
    break;
  }
  case "affected":
    printLines(affected(args[0]));
    break;
  case "affected-json":
    console.log(JSON.stringify(affected(args[0])));
    break;
  default:
    console.error(`usage: catalog.mjs list|resolve|path|get|ci-scripts|table|affected|affected-json`);
    process.exit(1);
}
