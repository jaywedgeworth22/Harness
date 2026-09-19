# Decision 0002 — ACP core stays in BotFleet (for now)

**Date:** 2026-09-19
**Status:** Accepted (temporary)
**Author:** [HARNESS]

## Context

The DSH driver lives in `src/dsh/acp/driver.ts` (and its `mcp-patch.ts`
helper).  The driver uses two harness-runtime primitives that live in
BotFleet:

1. `wrapSpawn` — the stdio bridge that wraps stock `dsh` and routes
   BotFleet's MCP mounts through `dsh-mcp-client` rows in a `dsh --patch`
   overlay.
2. The ACP JSON-RPC `request()` function used inside `configureSession` to
   call `session/set_config_option`.

Both primitives live in BotFleet's `acp/core.ts` (the JSON-RPC client,
spawn primitives) and `acp/dsh-mcp.ts` (the MCP mount assembler +
`dsh-acp-bridge` invocation).  Lifting those into Harness would make
Harness the runtime, not just the engine — a much bigger move than the
Harness repo's first commit.

## Decision

For the first commit of Harness, the DSH driver ships the pure engine
logic only:

- Model catalog (which models DSH offers, default selection)
- Version gate (`DSH_MINIMUM_ACP_VERSION`)
- Error classification (`classifyDshError`)
- Model-id round-trip (`dshModelOptionValue` ↔ `dshModelIdFromOptionValue`)
- Credential candidates (`~/.dsh/.credentials.yaml`)
- Env contract (`credentialEnv`, `transformEnv`, `isAuthenticated`)
- Install instructions
- Build-prompt text composition
- The MCP patch YAML generator (`mcp-patch.ts`'s `dshMcpPatchYaml` +
  `writeDshMcpPatch` — pure YAML and temp-file write logic)

BotFleet's `server/drivers/acp/dsh.ts` becomes a thin re-export seam:

```ts
import { dshSupport, dshWrapSpawn, STATIC_DSH_MODELS } from "harness/dsh/acp/driver";
export { dshSupport, dshWrapSpawn, STATIC_DSH_MODELS };
// ... compose with createAcpDriver from local acp/core.ts
```

BotFleet owns `createAcpDriver` and the JSON-RPC client.

## Consequences

- Harness's `src/dsh/acp/driver.ts` has zero runtime coupling to BotFleet
  and typechecks in isolation.
- BotFleet's existing driver file becomes a 5-line re-export, with the
  ACP core (spawn, JSON-RPC, MCP mount assembly) staying where it is.
- Drift surfaces at compile time because both sides typecheck against
  `src/shared/acp-core.ts`'s `AcpSupport` interface.

## Future move

Lift the ACP core into Harness:

1. Move `acp/core.ts` and `acp/dsh-mcp.ts` from BotFleet into
   `src/shared/acp-core.ts` and `src/dsh/acp/spawn.ts`.
2. Have BotFleet `import { createAcpDriver } from "harness/dsh/acp/core"`.
3. Move the per-engine driver files (`acp/codex.ts`, `acp/grok.ts`,
   `acp/opencode-go.ts`, `acp/hermes.ts`, `acp/droid.ts`, `acp/pi.ts`,
   `acp/cursor.ts`) into Harness as `src/<engine>/acp/driver.ts`.

That move is large enough that it should be its own PR with its own
board row, not bundled into the first Harness commit.
