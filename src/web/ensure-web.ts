#!/usr/bin/env node
/**
 * Idempotent recovery loop for Harness web on :PORT.
 *
 * If pm2 `harness-web` is not running, start it via `start-web.ts`.  Safe to
 * call from any agent seat's boot hooks, the seat-mcp watcher, or a
 * launchd-on-demand job.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const START_WEB = resolve(HERE, "start-web.ts");
const PORT = process.env.DSH_WEB_PORT ?? "3080";
const HOST = process.env.DSH_WEB_HOST ?? "127.0.0.1";
const LOG = process.env.HARNESS_ENSURE_LOG ?? "/tmp/harness-ensure.log";

async function up(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("/usr/sbin/lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN"], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

async function main(): Promise<void> {
  if (await up()) {
    process.stderr.write(`ensure-web: :${PORT} already bound, skipping\n`);
    return;
  }
  if (!existsSync(START_WEB)) {
    process.stderr.write(`ensure-web: missing ${START_WEB}\n`);
    process.exit(1);
  }
  process.stderr.write(`ensure-web: starting ${START_WEB} on :${PORT}\n`);
  const child = spawn("/opt/homebrew/bin/tsx", [START_WEB], {
    cwd: ROOT,
    stdio: "ignore",
    detached: true,
  });
  child.unref();
}

await main();
