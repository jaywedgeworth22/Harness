#!/usr/bin/env node
/**
 * Build the Harness Dock app at ~/Applications/Harness Web.app.
 *
 * The app is a WKWebView wrapper that points at the running web on
 * :DSH_WEB_PORT.  Full-bleed square icon (per AGENTS.md icon policy —
 * never a squircle).  Idempotent.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const ICON_SRC_CANDIDATES = [
  resolve(ROOT, "assets", "harness-icon-1024.png"),
  resolve(ROOT, "src", "web", "assets", "harness-icon-1024.png"),
];
const ICON_DST_NAME = "harness-icon-1024.png";
const SWIFT_SRC = resolve(HERE, "dock-app", "HarnessWindow.swift");

const APP_DIR = join(homedir(), "Applications", "Harness Web.app");
const APP_CONTENTS = join(APP_DIR, "Contents");
const APP_MACOS = join(APP_CONTENTS, "MacOS");
const APP_RESOURCES = join(APP_CONTENTS, "Resources");

async function run(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("error", () => resolve(-1));
    child.on("exit", (code) => resolve(code ?? -1));
  });
}

function writePlist(port: string): void {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Harness Web</string>
  <key>CFBundleDisplayName</key><string>Harness Web</string>
  <key>CFBundleIdentifier</key><string>app.harness.web</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>HarnessWeb</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
</dict>
</plist>
`;
  writeFileSync(join(APP_CONTENTS, "Info.plist"), plist, "utf8");
  void port;
}

function copyIcon(): boolean {
  for (const candidate of ICON_SRC_CANDIDATES) {
    if (existsSync(candidate)) {
      const child = spawn("/bin/cp", [candidate, join(APP_RESOURCES, ICON_DST_NAME)], { stdio: "inherit" });
      child.on("exit", () => {
        /* ok */
      });
      return true;
    }
  }
  return false;
}

async function main(): Promise<void> {
  const port = process.env.DSH_WEB_PORT ?? "3080";
  mkdirSync(APP_MACOS, { recursive: true });
  mkdirSync(APP_RESOURCES, { recursive: true });
  writePlist(port);
  if (existsSync(SWIFT_SRC)) {
    const code = await run("/usr/bin/swiftc", [SWIFT_SRC, "-O", "-o", join(APP_MACOS, "HarnessWeb")]);
    if (code !== 0) {
      process.stderr.write(`install-dock-app: swiftc failed with exit ${code} — falling back to a /usr/bin/open shell stub\n`);
      writeFileSync(
        join(APP_MACOS, "HarnessWeb"),
        `#!/usr/bin/env bash\nexec /usr/bin/open "http://127.0.0.1:${port}/"\n`,
        { mode: 0o755 },
      );
    }
  } else {
    process.stderr.write(`install-dock-app: Swift source not found at ${SWIFT_SRC} — building /usr/bin/open shell stub\n`);
    writeFileSync(
      join(APP_MACOS, "HarnessWeb"),
      `#!/usr/bin/env bash\nexec /usr/bin/open "http://127.0.0.1:${port}/"\n`,
      { mode: 0o755 },
    );
  }
  if (!copyIcon()) {
    process.stderr.write(`install-dock-app: icon not found in ${ICON_SRC_CANDIDATES.join(", ")} — app will use the default macOS web icon\n`);
  }
  process.stderr.write(`install-dock-app: built ${APP_DIR} (port ${port})\n`);
  // Touch the app so Launch Services refreshes the icon cache.
  await run("/usr/bin/touch", [APP_DIR]);
}

await main();
