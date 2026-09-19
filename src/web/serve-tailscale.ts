#!/usr/bin/env node
/**
 * Re-assert the Tailscale Serve mapping for Harness web.
 *
 * Idempotent.  Does not enable Funnel (tailnet only).  Failure is non-fatal
 * (web still binds loopback).
 */
import { spawn } from "node:child_process";

const PORT = process.env.DSH_WEB_PORT ?? "3080";
const TAILNET_HOST = process.env.HARNESS_TAILNET_HOST ?? "macbook.boa-roygbiv.ts.net";

const TAILSCALE_PATHS = [
  "/Applications/Tailscale.app/Contents/MacOS/tailscale",
  "/usr/local/bin/tailscale",
  "/opt/homebrew/bin/tailscale",
];

function findTailscale(): string | null {
  for (const candidate of TAILSCALE_PATHS) {
    try {
      const child = spawn("/bin/test", ["-x", candidate], { stdio: "ignore" });
      child.on("exit", (code) => {
        if (code === 0) {
          // found
        }
      });
    } catch {
      /* keep looking */
    }
  }
  // Simpler synchronous probe; tailscale binary is always at one of these on macOS.
  for (const candidate of TAILSCALE_PATHS) {
    if (existsSyncSync(candidate)) return candidate;
  }
  return null;
}

// Cheap synchronous probe so the rest of the file stays async-only.
import { existsSync as existsSyncSync } from "node:fs";

async function run(bin: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: "inherit" });
    child.on("error", () => resolve(-1));
    child.on("exit", (code) => resolve(code ?? -1));
  });
}

async function main(): Promise<void> {
  const bin = findTailscale();
  if (bin === null) {
    process.stderr.write(`serve-tailscale: tailscale binary not found at ${TAILSCALE_PATHS.join(", ")}\n`);
    process.exit(0);
  }

  const url = `https://${TAILNET_HOST}:${PORT}`;
  const target = `http://127.0.0.1:${PORT}`;

  process.stderr.write(`serve-tailscale: mapping ${url} -> ${target}\n`);
  // --bg=false so we observe the result inline.  Idempotent: re-running
  // overwrites the existing mapping.
  const code = await run(bin, ["serve", "--bg=false", `--https=${PORT}`, "off"]);
  if (code !== 0 && code !== 1) {
    // off may fail when no mapping exists yet — not fatal.
    process.stderr.write(`serve-tailscale: clear-existing returned ${code}\n`);
  }
  const setCode = await run(bin, ["serve", "--bg=false", `--https=${PORT}`, "on", target]);
  if (setCode !== 0) {
    process.stderr.write(`serve-tailscale: set returned ${setCode}\n`);
    process.exit(setCode);
  }
  process.stderr.write(`serve-tailscale: ${url} -> ${target} (tailnet only)\n`);
}

await main();
