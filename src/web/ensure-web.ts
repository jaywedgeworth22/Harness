#!/usr/bin/env node
/**
 * Idempotent recovery loop for Harness web on :PORT.
 *
 * Delegates to `scripts/ensure-web.sh` (pm2 `harness-web`, 401 counts as up).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = resolve(ROOT, "scripts", "ensure-web.sh");

if (!existsSync(SCRIPT)) {
  process.stderr.write(`ensure-web: missing ${SCRIPT}\n`);
  process.exit(1);
}

const child = spawn(SCRIPT, [], {
  stdio: "inherit",
  env: { ...process.env, HARNESS_RUNTIME_ROOT: ROOT },
});
child.on("exit", (code) => process.exit(code ?? 0));
