import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const py = path.join(root, "bridges/grok/grok-acp.py");

describe("grok-acp strip_auth", () => {
  it("removes authMethods and defaultAuthMethodId from initialize-shaped result", () => {
    const script = `
import importlib.util, os
path = os.environ["GROK_ACP_PY"]
spec = importlib.util.spec_from_file_location("grok_acp", path)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
raw = {
  "authMethods": [{"id": "cached_token"}],
  "_meta": {"defaultAuthMethodId": "cached_token", "keep": True},
  "protocolVersion": 1,
}
out = mod.strip_auth(dict(raw))
assert "authMethods" not in out, out
assert "defaultAuthMethodId" not in out.get("_meta", {})
assert out["_meta"]["keep"] is True
assert out["protocolVersion"] == 1
print("ok")
`;
    const r = spawnSync("python3", ["-c", script], {
      encoding: "utf8",
      env: { ...process.env, GROK_ACP_PY: py },
    });
    expect(r.status, r.stderr || r.stdout).toBe(0);
    expect((r.stdout || "").trim()).toBe("ok");
  });
});
