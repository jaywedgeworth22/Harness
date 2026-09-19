# Harness

A friendly adaptation of the upstream DeepSeek Harness (`@deepseek-ai/dsh`) extended to support **DeepSeek Harness (DSH)** and **MiniMax Harness (MMH)** equally well.  Both harnesses run the same web UI shell; the difference is which upstream engine powers each turn.

## License

Apache 2.0.  See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).

## Acknowledgements

This repository includes work derived from, and operates as a friendly
adaptation of, the following upstream and adjacent projects.  The full
attribution record is in [`NOTICE`](./NOTICE); the summary is below.

- **DeepSeek Harness (DSH)** — the upstream `@deepseek-ai/dsh` npm package
  and its source repository at <https://github.com/deepseek-ai/deepseek-harness>.
  Harness is not affiliated with, endorsed by, or sponsored by DeepSeek AI.
  The relationship is one of in-repo derivation: code in this repository
  reads, extends, and configures the upstream binary as a pinned dependency.
  Specific files derived from prior work that wrapped DSH are listed in
  `NOTICE` § "Derived Work — DeepSeek Harness".
- **BotFleet** — the prior host of the DSH ACP driver work.  Files in
  `src/dsh/acp/` were ported from `jaywedgeworth22/BotFleet` on
  2026-09-19; the cross-repo relationship is canonicalization, not
  forking.
- **MiniMax** — the MMH half of Harness is original work; MiniMax ships
  the HTTP chat-completions API at <https://platform.minimax.io> that
  MMH talks directly.  No third-party MiniMax code is included.

Harness does not contact, submit to, or interact with the DeepSeek or
MiniMax upstream projects on the owner's behalf.  All upstream
relationships are read-only at the package level (npm install) and
attribution-only at the repository level.  See AGENTS.md § "Operating
Rules" for the standing rule.

## What you get

- **`dsh/`** — DSH harness: full `@deepseek-ai/dsh` CLI + ACP bridge + cordis patch layer.  Same surface as the prior `~/apps/dsh-runtime/` install, lifted into a versioned repo.
- **`mmh/`** — MMH harness: a thin Python ACP bridge that wraps the MiniMax HTTP API (`api.minimax.io`) and synthesizes ACP frames around streamed chat-completions responses.  No upstream MM CLI / sandbox / plugins exist yet, so MMH today is a wire-level adapter.
- **`web/`** — TypeScript web UI scripts (the `start-web.sh`, `serve-tailscale.sh`, `open-harness.sh`, `ensure-web.sh`, `install-dock-app.sh` set, ported from bash to TS).
- **`profiles/`** — Tracked cordis profile defaults.  Each profile is an independent cordis tree (bundles + empty entry list + patch layer).  Four canonical profiles ship in this repo: `dsh-headless`, `dsh-web`, `mmh-headless`, `mmh-web`.  Per-profile feature depth (plugins, tool allowlist, thinking effort, turn budgets, model selection) is the operator's lever.
- **`bridges/`** — Python stdio JSON-RPC bridges for Shellular, ACP callers, and other agents.  Bridges stay Python intentionally — see `docs/decisions/0001-bridges-stay-python.md`.

## Install

The repo ships two parallel install surfaces:

- **TypeScript (`src/web/*.ts`, `scripts/sync-profiles.ts`)** — the
  canonical home, typechecked, runnable under `tsx` or Node 22's
  built-in type-stripping.  Once `npm ci` lands, `npm run sync` copies
  the tracked profile defaults to `~/.dsh/profiles/` and `npm run web`
  starts harness-web on `:3080`.
- **Bash (`~/apps/harness-runtime/*.sh`)** — the live install on the
  owner's Mac today.  Carries the same semantics as the TS scripts
  (port reclaim, Tailscale Serve re-assert, exec pinned `dsh web`) and
  is what pm2 `harness-web` actually runs.

The first Harness release will deprecate the bash surface and migrate
pm2 to the TS entry.  Until then, the two surfaces live side-by-side so
the TS rewrite can ship without an always-on-stack regression.

```bash
# Local development (TypeScript)
git clone git@github.com:jaywedgeworth22/Harness.git ~/Code/Harness
cd ~/Code/Harness
npm ci            # pinned @deepseek-ai/dsh + tsx runtime
npm run sync      # copy profiles to ~/.dsh/profiles/
npm run web       # start harness-web on :3080
npm run typecheck # tsc --noEmit
npm run test      # vitest run

# Live install on the owner's Mac (bash, current)
~/apps/harness-runtime/scripts/start-web.sh        # pm2 harness-web
~/apps/harness-runtime/scripts/serve-tailscale.sh  # tailnet serve
~/apps/harness-runtime/scripts/ensure-web.sh       # recovery loop
~/apps/harness-runtime/dsh-acp.sh                  # Shellular id deepseek (root shim)
~/apps/harness-runtime/mmh-acp.sh                  # Shellular id minimax (root shim)
```

Root shims (`dsh-acp.sh`, `mmh-acp.sh`, `start-web.sh`, …) exec the copies
under `scripts/` so both the documented live-install paths and the pm2
`scripts/` path work.

## Icons

Two 1024×1024 masters live in [`assets/`](./assets), both full-bleed RGB
with no rounded corners and no alpha channel — the OS applies its own
squircle mask at display time (macOS for the Dock app, iOS / App Store
Connect for any TestFlight upload).

- `harness-icon-1024.png` — **MMH** (the canonical, used by
  `scripts/install-dock-app.sh` to build `~/Applications/Harness.app`).
  MiniMax logo on top, `HARNESS` wordmark below.  This is the local
  owner-facing brand for the framework.
- `harness-icon-dsh-whale-1024.png` — **DSH** (sibling asset for DSH
  upstream references — README callouts, profile docs, the
  `src/dsh/acp/` module).  DeepSeek whale silhouette on top, `HARNESS`
  wordmark below.  Use this whenever the doc is talking about the
  DeepSeek engine rather than the framework.

## Package

BotFleet and other TypeScript consumers install this repo as an npm git
dependency.  Full export table: [`docs/package.md`](./docs/package.md).

```json
"harness": "github:jaywedgeworth22/Harness#main"
```

```ts
import { dshSupport } from "harness/dsh/acp";
import { writeDshMcpPatch } from "harness/dsh/mcp-patch";
import { mmhSupport } from "harness/mmh/acp";
```

## Consumers

This repo is canonical for the DSH ACP driver and the MMH ACP bridge.  BotFleet
imports from `jaywedgeworth22/Harness` via the npm git dependency above.
ai-fleet-coordinator registers the app (`HR`) and points pm2 `harness-web`
at this live install.

**Never edit driver or bridge code in BotFleet.**  Edit it here, in
`src/dsh/acp/` or `src/mmh/acp/`.  BotFleet and AFC consume via PR.

## Why two harnesses

The DeepSeek Harness is a real product today: a CLI, a web UI, an ACP bridge, an MCP server, a cordis plugin system, a sandbox, a permission model.  The MiniMax harness is a real product too — it has a chat-completions HTTP API, rate limits, balance endpoints, and a documented model catalog — but it does not (yet) have a CLI, a sandbox, a permission model, or a plugin system.  MMH in this repo is the wire-level adapter that lets MM ride the same UI shell and the same agent-facing ACP surface as DSH.  When MM ships upstream pieces (CLI, sandbox, plugins), the MMH adapter grows to match; until then, the HTTP adapter is the full implementation.

## Why "Harness" and not "DSH-MMH" or similar

The repo is the framework.  DSH and MMH are sibling harnesses *inside* it.  The repo name stays neutral so a future MM CLI doesn't have to rename the repo; the npm namespace stays neutral so a future third harness ("Antigravity Harness", "Kimi Harness") slots in as `src/<name>/` without a repo rename.

## Why Python for the bridges

The DSH bridge predates this repo and carries production fixes (DEVNULL stdin, process-group kill, heartbeats) earned through real failures.  Porting it to TypeScript is a coin-flip on whether every fix comes across correctly.  The MMH bridge is greenfield but is still a stdio JSON-RPC shim, which Python's stdlib does without a build dep.  See `docs/decisions/0001-bridges-stay-python.md`.

## Per-profile feature depth

Each profile in `src/profiles/<name>/` is fully independent:

- `cordis.yml` — the empty entry list the cordis patch loader applies bundles and patches to
- `cordis.patch.yml` — the patch layer (plugin disables, config overrides, `!!js` expressions)
- `package.json` — the bundle set this profile pulls in (`dsh-base` always; `dsh-web-app` for web profiles; `dsh-headless` for headless profiles)
- `local.patch.yml.example` — a per-machine override template (the operator's lever)

Per-use-case feature depth is open-ended: any profile may independently disable plugins, set thinking effort, set turn budgets, set tool allowlists, override cordis config.  The Harness repo ships the framework and four canonical examples; the operator tunes the matrix on each machine.
