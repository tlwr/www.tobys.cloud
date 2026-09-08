#!/usr/bin/env node
import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await esbuild.build({
  entryPoints: [path.join(root, "src/index.tsx")],
  outfile: path.join(root, "dist/index.js"),
  bundle: true,
  format: "esm",
  platform: "node",
  nodePaths: [path.join(root, "node_modules")],
});
