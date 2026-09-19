import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { existsSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("package exports", () => {
  it("point at files that exist and never type Python as TypeScript", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      exports: Record<string, string>;
    };
    expect(pkg.exports["./dsh/acp"]).toBe("./src/dsh/acp/driver.ts");
    expect(pkg.exports["./dsh/acp/driver"]).toBe("./src/dsh/acp/driver.ts");
    expect(pkg.exports["./dsh/mcp-patch"]).toBe("./src/dsh/acp/mcp-patch.ts");
    expect(pkg.exports["./mmh/acp"]).toBe("./src/mmh/acp/driver.ts");
    expect(pkg.exports["./shared/cordis-patch"]).toBeUndefined();
    for (const [key, target] of Object.entries(pkg.exports)) {
      if (key === "./package.json") continue;
      expect(target.endsWith(".py"), `${key} exports Python`).toBe(false);
      expect(existsSync(join(ROOT, target)), `${key} -> ${target}`).toBe(true);
    }
  });
});

describe("httpStatusIsUp", () => {
  it("treats 401 as healthy so auth-walled :3080 is not reclaimed", async () => {
    const { httpStatusIsUp } = await import("../src/shared/http-up.ts");
    expect(httpStatusIsUp(200)).toBe(true);
    expect(httpStatusIsUp(401)).toBe(true);
    expect(httpStatusIsUp(403)).toBe(true);
    expect(httpStatusIsUp(0)).toBe(false);
    expect(httpStatusIsUp(500)).toBe(false);
  });
});
