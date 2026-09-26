#!/usr/bin/env python3
"""ACP stdio shim around `grok agent --always-approve --leader stdio`.

Strip authMethods (and defaultAuthMethodId) from initialize so Shellular
iOS 0.0.43 does not treat Grok like an unauthenticated agent and block
session/new.  Same pattern as cursor_acp_noauth_shim.py for cursor-local.

Grok already speaks ACP; this bridge only filters the initialize result
and forwards every other JSON-RPC frame.  Auth stays on the Mac via
~/.grok/auth.json (cached_token) — the phone never needs to sign in.

Stdout is JSON-RPC only.  Stderr passes through from the child.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import threading
from pathlib import Path
from typing import Any

JsonDict = dict[str, Any]

DEFAULT_ARGS = ["agent", "--always-approve", "--leader", "stdio"]


def locate_grok() -> str:
    env = os.environ.get("GROK_BIN", "").strip()
    if env:
        return env
    home = Path.home() / ".grok" / "bin" / "grok"
    if home.is_file() or home.is_symlink():
        return str(home)
    which = shutil.which("grok")
    if which:
        return which
    raise SystemExit("grok binary not found (set GROK_BIN or install ~/.grok/bin/grok)")


def strip_auth(result: JsonDict) -> JsonDict:
    """Remove fields that make Shellular iOS show an auth wall."""
    result.pop("authMethods", None)
    meta = result.get("_meta")
    if isinstance(meta, dict):
        meta.pop("defaultAuthMethodId", None)
        if not meta:
            result.pop("_meta", None)
        else:
            result["_meta"] = meta
    return result


class Shim:
    def __init__(self, proc: subprocess.Popen[str]) -> None:
        self.proc = proc
        self.lock = threading.Lock()
        self.stop = threading.Event()

    def write_child(self, payload: JsonDict) -> None:
        raw = json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
        assert self.proc.stdin is not None
        with self.lock:
            self.proc.stdin.write(raw + "\n")
            self.proc.stdin.flush()

    def write_parent(self, payload: JsonDict) -> None:
        raw = json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
        sys.stdout.write(raw + "\n")
        sys.stdout.flush()

    def parent_to_child(self) -> None:
        assert self.proc.stdin is not None
        for line in sys.stdin:
            if self.stop.is_set():
                break
            stripped = line.strip()
            if not stripped:
                continue
            try:
                message = json.loads(stripped)
            except json.JSONDecodeError:
                continue
            if isinstance(message, dict):
                self.write_child(message)
        self.stop.set()
        if self.proc.poll() is None:
            try:
                self.proc.stdin.close()
            except OSError:
                pass

    def child_to_parent(self) -> None:
        assert self.proc.stdout is not None
        for line in self.proc.stdout:
            stripped = line.strip()
            if not stripped:
                continue
            try:
                message = json.loads(stripped)
            except json.JSONDecodeError:
                sys.stdout.write(line if line.endswith("\n") else line + "\n")
                sys.stdout.flush()
                continue
            if not isinstance(message, dict):
                continue
            result = message.get("result")
            if isinstance(result, dict) and (
                "authMethods" in result
                or (isinstance(result.get("_meta"), dict) and "defaultAuthMethodId" in result["_meta"])
            ):
                message["result"] = strip_auth(dict(result))
            self.write_parent(message)
        self.stop.set()


def main() -> int:
    os.environ.setdefault("GROK_DISABLE_AUTOUPDATER", "1")
    binary = locate_grok()
    args = list(DEFAULT_ARGS)
    # Allow callers to append extra grok agent flags after the wrapper argv.
    # Keep stdout clean: never print banners.
    extra = [a for a in sys.argv[1:] if a not in ("--",)]
    if extra:
        # Insert extra flags before the stdio subcommand when present.
        if args[-1] == "stdio":
            args = args[:-1] + extra + ["stdio"]
        else:
            args = args + extra

    proc = subprocess.Popen(
        [binary, *args],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=sys.stderr,
        text=True,
        bufsize=1,
        env=os.environ.copy(),
    )
    shim = Shim(proc)
    up = threading.Thread(target=shim.parent_to_child, daemon=True)
    down = threading.Thread(target=shim.child_to_parent, daemon=True)
    up.start()
    down.start()
    up.join()
    down.join(timeout=2)
    if proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            proc.kill()
    return int(proc.returncode or 0)


if __name__ == "__main__":
    raise SystemExit(main())
