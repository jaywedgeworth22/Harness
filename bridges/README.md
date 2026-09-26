# Bridges

The stdio JSON-RPC bridges that let Shellular, ACP callers, and other agents
spawn a harness session over a single child process.  Each bridge is a thin
Python script: read JSON-RPC frames from stdin, fork-and-exec the harness
binary (or, for MMH, call the HTTP API directly), write ACP-shaped frames to
stdout.

## Why Python

The DSH bridge (`dsh/dsh-acp.py`) predates this repo and carries production
fixes (DEVNULL stdin, process-group kill, heartbeats) earned through real
failures documented in
`ai-fleet-coordinator/docs/rollouts/2026-08-23-shellular-deepseek-thinking-fix.md`
and follow-ups.  Porting it to TypeScript is a coin-flip on whether every fix
comes across correctly.  The MMH bridge (`mmh/mmh-acp.py`) is greenfield but
still a stdio JSON-RPC shim, which Python's stdlib does without a build dep.

If you need a new bridge: write it in Python, stdlib-only, and put it in
`bridges/<name>/`.  The `bin` entry in `package.json` does not list bridge
binaries — they are invoked by name (`dsh-acp.sh`, `mmh-acp.sh`) from the
shell wrappers, not via `npm exec`.

## Layout

```
bridges/
├── README.md
├── dsh/
│   └── dsh-acp.py        # DeepSeek Harness → ACP
├── mmh/
│   └── mmh-acp.py        # MiniMax Harness → ACP (HTTP adapter)
└── grok/
    └── grok-acp.py       # Grok Build leader-stdio → ACP (strip authMethods)
```

The `dsh-acp.sh`, `mmh-acp.sh`, and `grok-acp.sh` shell wrappers live in
`scripts/` and as root shims at the repo root (the live-install paths
Shellular uses).  They set the env vars each bridge reads and `exec` the
Python under `/opt/homebrew/bin/python3`.

## Auth

Bridges never read agent credentials.  Auth comes from:

- The process environment (`DEEPSEEK_API_KEY` for DSH, `MINIMAX_API_KEY` for MMH).
- `~/.dsh/.credentials.yaml` for DSH (the harness's own credential store).
- `~/.secrets/global-api-keys` for MMH (the names-only fleet file, looked
  up by `MMH_API_KEY_NAME`).

The Shellular `agents.json` entry for each harness sets the env vars via the
`env` block; the agent-facing config never holds a secret value.
