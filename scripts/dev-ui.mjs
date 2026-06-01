#!/usr/bin/env node
// One-command local dev: start the proxy (the API) + the demo UI together,
// wire the UI at the local API, and print the URLs. No extra dependencies.
//
//   npm run dev:ui
//
// Env: PROXY_PORT (default 8787), UI_PORT (default 5173), VITE_PROXY_URL.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const demoDir = resolve(root, "apps/demo");
const PROXY_PORT = process.env.PROXY_PORT ?? "8787";
const UI_PORT = process.env.UI_PORT ?? "5173";
const PROXY_URL = process.env.VITE_PROXY_URL ?? `http://localhost:${PROXY_PORT}`;

// The demo is not an npm workspace — install its deps on first run.
if (!existsSync(resolve(demoDir, "node_modules"))) {
  console.log("[dev:ui] installing demo dependencies (first run only)…");
  const installed = spawnSync("npm", ["install"], { cwd: demoDir, stdio: "inherit", shell: true });
  if (installed.status !== 0) process.exit(installed.status ?? 1);
}

const children = [];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
  process.exit(code);
}

function start(name, command, args, env) {
  const child = spawn(command, args, { cwd: env.cwd, env: env.env, stdio: "inherit", shell: true });
  child.on("exit", (exitCode) => {
    console.log(`[dev:ui] ${name} exited (${exitCode}); shutting down.`);
    shutdown(exitCode ?? 0);
  });
  children.push(child);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

start("proxy", "npm", ["run", "dev:proxy"], {
  cwd: root,
  env: { ...process.env, PROXY_PORT },
});
start("ui", "npm", ["run", "dev", "--", "--port", UI_PORT], {
  cwd: demoDir,
  env: { ...process.env, VITE_PROXY_URL: PROXY_URL },
});

console.log(`
  UniMap is starting:

    API (proxy):  ${PROXY_URL}
    UI  (demo):   http://localhost:${UI_PORT}   <-- open this

  The UI is wired to the API above (override with VITE_PROXY_URL).
  Press Ctrl-C to stop both.
`);
