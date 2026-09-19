#!/usr/bin/env node
/**
 * Sync tracked profiles from src/profiles/ to ~/.dsh/profiles/.
 *
 * Idempotent.  Run via `npm run sync` after every `npm ci` and every
 * profile change.  Per-machine overrides (local.patch.yml) are preserved.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC_PROFILES = join(ROOT, "src", "profiles");
const DST_PROFILES = join(homedir(), ".dsh", "profiles");
const DST_SETTINGS = join(homedir(), ".dsh");

interface SyncResult {
  readonly profile: string;
  readonly filesCopied: readonly string[];
  readonly localOverride: boolean;
}

function log(line: string): void {
  process.stdout.write(`sync-profiles: ${line}\n`);
}

function listProfiles(): readonly string[] {
  if (!existsSync(SRC_PROFILES)) return [];
  return readdirSync(SRC_PROFILES).filter((entry) => {
    const full = join(SRC_PROFILES, entry);
    return statSync(full).isDirectory();
  });
}

function copyDir(srcDir: string, dstDir: string): string[] {
  mkdirSync(dstDir, { recursive: true });
  const copied: string[] = [];
  for (const entry of readdirSync(srcDir)) {
    const srcFile = join(srcDir, entry);
    const stat = statSync(srcFile);
    if (!stat.isFile()) continue;
    if (entry === "local.patch.yml") continue; // never overwrite a local override
    const dstFile = join(dstDir, entry);
    copyFileSync(srcFile, dstFile);
    copied.push(entry);
  }
  return copied;
}

function copySettingsFile(name: string): boolean {
  const src = join(SRC_PROFILES, name, `settings-${name}.yaml`);
  if (!existsSync(src)) return false;
  const dst = join(DST_SETTINGS, `settings-${name}.yaml`);
  copyFileSync(src, dst);
  return true;
}

function syncOne(name: string): SyncResult {
  const srcDir = join(SRC_PROFILES, name);
  const dstDir = join(DST_PROFILES, name);
  const localOverridePath = join(dstDir, "local.patch.yml");
  const localExists = existsSync(localOverridePath);

  // Remove tracked files (anything except local.patch.yml) before re-copying,
  // so a deleted tracked file actually disappears at the destination.
  if (existsSync(dstDir)) {
    for (const entry of readdirSync(dstDir)) {
      if (entry === "local.patch.yml") continue;
      rmSync(join(dstDir, entry), { force: true });
    }
  }

  const copied = copyDir(srcDir, dstDir);
  copySettingsFile(name);

  return {
    profile: name,
    filesCopied: copied,
    localOverride: localExists,
  };
}

async function main(): Promise<void> {
  const profiles = listProfiles();
  if (profiles.length === 0) {
    log(`no profiles in ${SRC_PROFILES}`);
    return;
  }
  mkdirSync(DST_PROFILES, { recursive: true });
  log(`syncing ${profiles.length} profile(s) to ${DST_PROFILES}`);
  for (const name of profiles) {
    const result = syncOne(name);
    const overrideNote = result.localOverride ? " (local.patch.yml preserved)" : "";
    log(`  ${name}: ${result.filesCopied.join(", ") || "(empty)"}${overrideNote}`);
  }
  log(`done. restart any pm2 job that uses a synced profile to pick up changes.`);
}

await main();
