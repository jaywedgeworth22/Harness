# Package Surface

Harness is an npm package BotFleet and ai-fleet-coordinator consume.  The
GitHub repo is `jaywedgeworth22/Harness`.  Pin it; do not `npx`.

## BotFleet

```json
"dependencies": {
  "harness": "github:jaywedgeworth22/Harness#main"
}
```

```ts
import { dshSupport, DSH_MINIMUM_ACP_VERSION } from "harness/dsh/acp";
import { writeDshMcpPatch } from "harness/dsh/mcp-patch";
import { createAcpDriver } from "./core.ts";
import { dshWrapSpawn } from "./dsh-mcp.ts";

export const DshAgentDriver = createAcpDriver({
  ...dshSupport,
  wrapSpawn: dshWrapSpawn,
});
```

ACP runtime (`createAcpDriver`, spawn, MCP mount assembly, the Node
`dsh-acp-bridge`) stays in BotFleet.  See
`docs/decisions/0002-acp-core-stays-in-botfleet.md`.  Never pass Harness
`dshSupport` to `createAcpDriver` without composing `wrapSpawn` — stock
`dsh` rejects a non-empty `session/new.mcpServers` list.

Edit engine shape here (`src/dsh/acp/`, `src/mmh/acp/`).  Do not edit
it in BotFleet.

## ai-fleet-coordinator

AFC does not npm-install Harness.  It registers the app in
`fleet-apps.json` (acronym `HR`), points pm2 `harness-web` at
`~/apps/harness-runtime/scripts/start-web.sh` (symlink to this repo),
and keeps `scripts/dsh-runtime/` as a fallback copy of the live-install
scripts.  Canonical scripts live here.

## Exports

| Specifier | File |
|---|---|
| `harness` | `src/index.ts` |
| `harness/dsh/acp` | `src/dsh/acp/driver.ts` |
| `harness/dsh/acp/driver` | same |
| `harness/dsh/mcp-patch` | `src/dsh/acp/mcp-patch.ts` |
| `harness/mmh/acp` | `src/mmh/acp/driver.ts` |
| `harness/mmh/http-client` | `src/mmh/http-client/index.ts` |
| `harness/shared/contracts` | `src/shared/contracts.ts` |
| `harness/shared/acp-core` | `src/shared/acp-core.ts` |

Python bridges are not TypeScript exports.  Invoke them through
`dsh-acp.sh` / `mmh-acp.sh`.
