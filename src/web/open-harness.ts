#!/usr/bin/env node
/**
 * Activate the Harness Dock app window, or fall back to opening the URL.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const APP = join(homedir(), "Applications", "Harness Web.app");
const ENSURE = join(homedir(), "apps", "harness-runtime", "ensure-web.ts");
const URL = process.env.HARNESS_WEB_URL ?? `http://127.0.0.1:${process.env.DSH_WEB_PORT ?? "3080"}/`;

function log(line: string): void {
  process.stderr.write(`open-harness: ${line}\n`);
}

async function openApp(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("/usr/bin/open", ["-a", path], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

async function openUrl(url: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const child = spawn("/usr/bin/open", [url], { stdio: "ignore" });
    child.on("error", () => resolve());
    child.on("exit", () => resolve());
  });
}

async function main(): Promise<void> {
  if (existsSync(APP)) {
    const ok = await openApp(APP);
    if (ok) {
      log(`activated ${APP}`);
      return;
    }
  }
  if (existsSync(ENSURE)) {
    await new Promise<void>((resolve) => {
      const child = spawn("/opt/homebrew/bin/tsx", [ENSURE], { stdio: "ignore" });
      child.on("error", () => resolve());
      child.on("exit", () => resolve());
    });
  }
  log(`opening ${URL}`);
  await openUrl(URL);
}

await main();
