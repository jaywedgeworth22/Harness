# BotFleet imports the DSH driver from Harness

**Lane:** `claude/dsh-driver-from-harness` (or any seat; suggested CLAUDE
because it owns the ACP runtime today)

**Status:** Draft — pending the repo push (`gh repo create Harness`)
and the BotFleet worktree branch.

## Goal

Make `jaywedgeworth22/BotFleet`'s `server/drivers/acp/dsh.ts` a thin
re-export of `jaywedgeworth22/Harness`'s `src/dsh/acp/driver.ts`.  BotFleet
keeps the ACP runtime (`acp/core.ts`, `acp/dsh-mcp.ts`, the stdio bridge
`server/drivers/dsh-acp-bridge.ts`) and composes the Harness support
shape into a per-engine driver.

## Why

`Harness/docs/decisions/0002-acp-core-stays-in-botfleet.md` lays out the
division of labor:

- BotFleet owns the ACP runtime (JSON-RPC client, spawn primitives,
  MCP mount assembler, stdio bridge).
- Harness owns the DSH-specific engine shape (catalog, error
  classifier, version gate, model-id round-trip, credential candidates,
  env contract, install instructions).

Before this PR, the DSH engine shape lived in two places at once: the
canonical home in `BotFleet/server/drivers/acp/dsh.ts` and the ported
copy in `Harness/src/dsh/acp/driver.ts`.  Drift between the two would
re-introduce the MCP-vs-HTTP-vs-CLI drift that the MM 11-PR series
spent weeks fighting.

## Changes (BotFleet side)

1. `package.json`: add `"harness": "github:jaywedgeworth22/Harness#main"`
   to `dependencies`.
2. `server/drivers/acp/dsh.ts`: replace the file contents with a
   re-export shim that pulls from `harness/dsh/acp/driver` and composes
   with BotFleet's `createAcpDriver`:
   ```ts
   export {
     dshSupport,
     dshSpawnArgs,
     dshModelOptionValue,
     dshModelIdFromOptionValue,
     dshCredentialCandidates,
     classifyDshError,
     DSH_MINIMUM_ACP_VERSION,
     dshVersionCompatibilityReason,
     STATIC_DSH_MODELS,
     isStockDshCli,
   } from "harness/dsh/acp/driver";
   export { dshWrapSpawn } from "./dsh-mcp.ts";
   import { dshSupport } from "harness/dsh/acp/driver";
   import { createAcpDriver } from "./core.ts";
   export const DshAgentDriver = createAcpDriver(dshSupport);
   ```
3. `server/drivers/acp/dsh-mcp.ts`: replace the `dshWrapSpawn` body
   with a re-export of `writeDshMcpPatch` from Harness + a thin
   glue layer that imports the patch YAML and routes through the
   BF-side `SPAWNED_PROXIES.dshAcpBridge`.
4. `server/drivers/acp/dsh.test.ts`: update imports to pull from
   `harness/dsh/acp/driver` for the pure functions; keep the
   BF-side tests of `createAcpDriver(dshSupport)` integration.
5. Verify `pnpm typecheck && pnpm test` is green.
6. Open a PR with a clear description, link to this doc + Harness
   Decision 0002, and `arm-auto-merge`.

## Risk

- npm git deps are flaky in CI when the remote is private.  If
  BotFleet's CI cannot fetch the Harness repo, the build breaks.  Mitigate
  by making Harness public at push time, or by vendoring a tarball in
  `vendor/harness/` and using a `file:` dep.
- Drift between Harness and BotFleet is still possible — both repos
  typecheck against the same `AcpSupport` interface (defined in
  `Harness/src/shared/acp-core.ts`), but a runtime call shape that
  drifts would only surface at test time.  Mitigate by adding a
  compatibility test in Harness's `tests/` that imports Harness's
  own driver through the same `createAcpDriver` shape BF uses (BF
  re-exports `createAcpDriver` from a stable path; Harness ships a
  test-only `createAcpDriverForTest` shim that mirrors it).

## Follow-ups

- Lift the ACP runtime into Harness too (see Decision 0002's "Future
  move").  When that lands, this import becomes `import {
  DshAgentDriver } from "harness/dsh/acp/core"` instead of the two-step
  import.
- Apply the same import pattern to `acp/codex.ts`, `acp/grok.ts`,
  `acp/opencode-go.ts`, `acp/hermes.ts`, `acp/droid.ts`, `acp/pi.ts`,
  `acp/cursor.ts`.  Each engine's pure shape moves to
  `Harness/src/<engine>/acp/driver.ts`; BF re-exports.
