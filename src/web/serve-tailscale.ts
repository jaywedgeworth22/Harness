#!/usr/bin/env node
/**
 * Re-assert the Tailscale Serve mapping for Harness web.
 *
 * Same mapping as `scripts/serve-tailscale.sh`: `tailscale serve --bg --https PORT TARGET`.
 * Idempotent.  Does not enable Funnel (tailnet only).  Missing binary is non-fatal.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const PORT = process.env.DSH_WEB_PORT ?? "3080";
const TAILNET_HOST = process.env.HARNESS_TAILNET_HOST ?? "macbook.boa-roygbiv.ts.net";

const TAILSCALE_PATHS = [
  "/Applications/Tailscale.app/Contents/MacOS/tailscale",
  "/opt/homebrew/bin/tailscale",
  "/usr/local/bin/tailscale",
];

function findTailscale(): string | null {
  for (const candidate of TAILSCALE_PATHS) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

async function run(bin: string, args: string[]): Promise<number> {
  return new Promise((resolvePromise) => {
    const child = spawn(bin, args, { stdio: "inherit" });
    child.on("error", () => resolvePromise(-1));
    child.on("exit", (code) => resolvePromise(code ?? -1));
  });
}

async function main(): Promise<void> {
  const bin = findTailscale();
  if (bin === null) {
    process.stderr.write(`serve-tailscale: tailscale binary not found at ${TAILSCALE_PATHS.join(", ")}\n`);
    process.exit(0);
  }

  const target = `http://127.0.0.1:${PORT}`;
  const url = `https://${TAILNET_HOST}:${PORT}`;
  process.stderr.write(`serve-tailscale: mapping ${url} -> ${target}\n`);
  const code = await run(bin, ["serve", "--bg", "--https", PORT, target]);
  if (code !== 0) {
    process.stderr.write(`serve-tailscale: set returned ${code}\n`);
    process.exit(code);
  }
  process.stderr.write(`serve-tailscale: ${url} -> ${target} (tailnet only)\n`);
}

await main();
