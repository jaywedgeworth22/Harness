#!/usr/bin/env node
/**
 * Harness web UI — loopback bind + Tailscale Serve receiver.
 *
 * Equivalent of the prior `~/apps/dsh-runtime/start-web.sh`:
 *   1. reclaim :PORT if a stale harness process holds it (only when the
 *      holder is itself dsh and is unhealthy)
 *   2. re-assert Tailscale Serve mapping so a pm2 restart brings the
 *      `https://<mac>.ts.net:PORT` URL back without operator action
 *   3. exec the pinned `@deepseek-ai/dsh` web command
 *
 * Idempotent and safe to run under pm2 `harness-web`.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { hostname } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname, "..");
const DSH_BIN = join(ROOT, "node_modules", ".bin", "dsh");
const HOST = process.env.DSH_WEB_HOST ?? "127.0.0.1";
const PORT = process.env.DSH_WEB_PORT ?? "3080";
const TAILNET_HOST = process.env.HARNESS_TAILNET_HOST ?? "macbook.boa-roygbiv.ts.net";
const TAILNET_IPV4 = process.env.HARNESS_TAILNET_IPV4 ?? "100.113.106.39";
const SERVE_TAILSCALE = join(ROOT, "src", "web", "serve-tailscale.ts");

function log(line: string): void {
  process.stderr.write(`harness-web: ${line}\n`);
}

async function readCommand(pid: number): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("/bin/ps", ["-o", "command=", "-p", String(pid)], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.on("error", () => resolve(null));
    child.on("exit", () => {
      const trimmed = out.trim();
      resolve(trimmed.length > 0 ? trimmed : null);
    });
  });
}

async function holderOnPort(port: string): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn("/usr/sbin/lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.on("error", () => resolve(null));
    child.on("exit", () => {
      const trimmed = out.trim();
      resolve(trimmed.length > 0 ? Number(trimmed.split(/\s+/)[0]) : null);
    });
  });
}

async function probe(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("/usr/bin/curl", ["-sf", "-o", "/dev/null", "--max-time", "8", url], {
      stdio: "ignore",
    });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

async function reclaimPort(port: string): Promise<void> {
  const holder = await holderOnPort(port);
  if (holder === null) return;
  const cmd = await readCommand(holder);
  if (cmd === null || (!cmd.includes("dsh") && !cmd.includes("harness"))) {
    log(`:${port} held by pid ${holder} (${cmd ?? "unknown"}) — not harness, refusing to reclaim`);
    process.exit(3);
  }
  if (await probe(`http://${HOST}:${PORT}/`)) {
    log(`:${port} already healthy (pid ${holder}), skipping reclaim`);
    process.exit(0);
  }
  log(`reclaiming pid ${holder} on :${port}`);
  try {
    process.kill(holder, "SIGTERM");
  } catch {
    /* already gone */
  }
  for (let i = 0; i < 8; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    if ((await holderOnPort(port)) === null) return;
  }
  try {
    process.kill(holder, "SIGKILL");
  } catch {
    /* already gone */
  }
  await new Promise((r) => setTimeout(r, 500));
}

async function main(): Promise<void> {
  if (!existsSync(DSH_BIN)) {
    log(`missing ${DSH_BIN} — run \`npm ci\` in ${ROOT} (never \`npx\`)`);
    process.exit(127);
  }

  await reclaimPort(PORT);

  if (existsSync(SERVE_TAILSCALE)) {
    // Re-assert Tailscale Serve before exec so a pm2 restart brings the
    // tailnet URL back.  Failure is non-fatal (web still binds loopback).
    try {
      await new Promise<void>((resolve) => {
        const child = spawn("/opt/homebrew/bin/tsx", [SERVE_TAILSCALE], {
          stdio: "inherit",
          env: {
            ...process.env,
            DSH_WEB_PORT: PORT,
            HARNESS_TAILNET_HOST: TAILNET_HOST,
            HARNESS_TAILNET_IPV4: TAILNET_IPV4,
          },
        });
        child.on("exit", () => resolve());
        child.on("error", () => resolve());
      });
    } catch {
      /* non-fatal */
    }
  }

  const args = [
    "web",
    "--no-open",
    "--host",
    HOST,
    "--port",
    PORT,
    "--trusted-host",
    "127.0.0.1",
    "--trusted-host",
    `127.0.0.1:${PORT}`,
    "--trusted-host",
    "localhost",
    "--trusted-host",
    `localhost:${PORT}`,
    "--trusted-host",
    TAILNET_HOST,
    "--trusted-host",
    `${TAILNET_HOST}:${PORT}`,
    "--trusted-host",
    TAILNET_IPV4,
    "--trusted-host",
    `${TAILNET_IPV4}:${PORT}`,
  ];

  log(`exec dsh web on ${HOST}:${PORT}`);
  const child = spawn(DSH_BIN, args, { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
}

await main();
