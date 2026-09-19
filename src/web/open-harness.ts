#!/usr/bin/env node
/**
 * Activate the Harness Dock app window, or fall back to opening the URL.
 * On-disk name is `Harness.app`; bundle id `services.jays.harness`.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { join } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = resolve(ROOT, "scripts", "open-harness.sh");
const APP = join(homedir(), "Applications", "Harness.app");

function log(line: string): void {
  process.stderr.write(`open-harness: ${line}\n`);
}

if (existsSync(SCRIPT)) {
  const child = spawn(SCRIPT, [], {
    stdio: "inherit",
    env: { ...process.env, HARNESS_RUNTIME_ROOT: ROOT },
  });
  child.on("exit", (code) => process.exit(code ?? 0));
} else if (existsSync(APP)) {
  const child = spawn("/usr/bin/open", ["-a", APP], { stdio: "ignore" });
  child.on("exit", (code) => {
    log(`activated ${APP}`);
    process.exit(code ?? 0);
  });
} else {
  const url = process.env.HARNESS_WEB_URL ?? `http://127.0.0.1:${process.env.DSH_WEB_PORT ?? "3080"}/`;
  spawn("/usr/bin/open", [url], { stdio: "ignore" }).on("exit", () => process.exit(0));
}
