# BotFleet imports the DSH driver from Harness

**Lane:** `grok/harness-package` (any seat; this doc is the contract)

**Status:** Ready once `jaywedgeworth22/Harness` is on GitHub and BotFleet
adds the git dependency.

## Goal

Make `jaywedgeworth22/BotFleet`'s `server/drivers/acp/dsh.ts` a thin
re-export of this package's `src/dsh/acp/driver.ts`.  BotFleet keeps the
ACP runtime (`acp/core.ts`, `acp/dsh-mcp.ts` glue, the Node stdio bridge
`server/drivers/dsh-acp-bridge.ts`) and composes the Harness support
shape into a per-engine driver.

## Why

`docs/decisions/0002-acp-core-stays-in-botfleet.md` lays out the
division of labor:

- BotFleet owns the ACP runtime (JSON-RPC client, spawn primitives,
  MCP mount assembler, Node stdio bridge).
- Harness owns the DSH-specific engine shape (catalog, error
  classifier, version gate, model-id round-trip, credential candidates,
  env contract, install instructions).

## Changes (BotFleet side)

1. `package.json`: add `"harness": "github:jaywedgeworth22/Harness#main"`.
2. `server/drivers/acp/dsh.ts`: re-export the pure functions from
   `harness/dsh/acp` and compose `wrapSpawn` locally:

   ```ts
   import {
     dshSupport as harnessDshSupport,
     dshSpawnArgs,
     classifyDshError,
   } from "harness/dsh/acp";
   import { createAcpDriver, type AcpSupport } from "./core.ts";
   import { dshWrapSpawn } from "./dsh-mcp.ts";

   export const dshSupport: AcpSupport = {
     ...harnessDshSupport,
     wrapSpawn: dshWrapSpawn,
     spawnArgs: dshSpawnArgs,
     classifyError: classifyDshError,
   };
   export const DshAgentDriver = createAcpDriver(dshSupport);
   ```

   Do **not** pass Harness `dshSupport` straight into `createAcpDriver`.
   Without `wrapSpawn`, stock `dsh` rejects BotFleet MCP mounts.

3. `server/drivers/acp/dsh-mcp.ts`: keep `dshWrapSpawn` (needs
   `SPAWNED_PROXIES.dshAcpBridge`).  Re-export YAML helpers from
   `harness/dsh/mcp-patch`.
4. Tests keep importing from `./dsh.ts` so the public BF surface does
   not change.  Pure-function assertions still pass because the shim
   re-exports them.
5. `pnpm typecheck && pnpm test`.
6. AGENTS.md: never edit DSH engine shape in BotFleet; edit Harness.

## Risk

- npm git deps fail in CI when the remote is private.  Harness is
  public Apache-2.0 so BotFleet CI can fetch it with the default token.
- Packaged BotFleet inlines bare specifiers (`scripts/bundle-server.mjs`);
  confirm the git dep is bundled, not left as `node_modules/harness`.
