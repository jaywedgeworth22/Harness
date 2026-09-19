# Decision 0001 — Bridges stay Python

**Date:** 2026-09-19
**Status:** Accepted
**Author:** [HARNESS]

## Context

When the Harness repo was created, the question was whether the stdio
JSON-RPC bridges (`bridges/dsh/dsh-acp.py`, `bridges/mmh/mmh-acp.py`) should
be Python (matching the prior `~/apps/dsh-runtime/dsh-acp.py` lineage) or
TypeScript (matching the rest of the new repo's source).

The DSH bridge is the production-battle-tested one.  It predates this repo
and carries fixes that took real failures to land:

- **DEVNULL stdin** — `dsh` headless prints nothing until the final answer,
  so ACP stdin must not leak into the child (the `subprocess.Popen` call
  uses `stdin=subprocess.DEVNULL`).
- **Process-group kill** — a timeout or cancel must kill the whole process
  group (`os.killpg(pid, signal.SIGTERM)` then SIGKILL fallback), not just
  the parent PID; the prior 900s Thinking hang was a parent-killed child.
- **Heartbeats** — Shellular leaves Thinking only on streamed bytes, so the
  bridge synthesizes `[working… Ns]` frames at a fixed cadence to keep the
  spinner alive.

Porting to TypeScript is a coin-flip on whether every fix comes across
correctly.  Even with side-by-side comparison, subtle behaviors (signal
masking, fd inheritance across `start_new_session=True`, race between
stdout thread and timeout) need real-world failure to surface — and the
DSH bridge's history is exactly that.

The MMH bridge is greenfield but is still a stdio JSON-RPC shim around a
child process, which Python's stdlib does without a build dep.

## Decision

Bridges stay Python.  stdlib-only.  No `pip install`, no `node_modules`
for the bridge half, no `tsx` runtime for a 200-line shim.

The repo's TypeScript lives in `src/` for everything harness-shaped
(drivers, web scripts, profile sync, contracts).  The Python lives in
`bridges/` for the wire adapters.

If a future harness needs a TypeScript bridge — say, a Rust harness where
calling the binary requires typed bindings — the pattern is one bridge
per language, each in its own directory, not a wholesale rewrite.

## Consequences

- The Harness repo has two languages in two trees (`src/` TS, `bridges/`
  Python).  New contributors need to know the split.
- BotFleet cannot `import` a Python bridge directly.  Bridges are spawned
  as subprocesses by Shellular (the actual consumer); this is the same
  shape they had before this repo existed.
- The ACP runtime for the TypeScript side (`src/dsh/acp/`) stays in
  BotFleet for now (see Decision 0002).  Future move: lift the ACP core
  into Harness too, so BotFleet becomes a consumer rather than the
  runtime.  That is independent of this decision and not blocked by it.
