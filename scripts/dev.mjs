#!/usr/bin/env node
// `npm run dev` — start the proxy (API, :8787) and the UI (:5173) together.
// Ctrl-C stops both. The UI defaults to the local proxy; no keys needed (OSM).
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const uiDir = resolve(root, "apps/ui");

// The UI isn't an npm workspace, so it carries its own deps — install on first run.
if (!existsSync(resolve(uiDir, "node_modules"))) {
  spawnSync("npm", ["install"], { cwd: uiDir, stdio: "inherit", shell: true });
}

const procs = [
  spawn("npm", ["run", "dev:proxy"], { cwd: root, stdio: "inherit", shell: true }),
  spawn("npm", ["run", "dev"], { cwd: uiDir, stdio: "inherit", shell: true }),
];

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const p of procs) p.kill("SIGTERM");
  process.exit(code);
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
for (const p of procs) p.on("exit", (c) => stop(c ?? 0));
