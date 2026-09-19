#!/usr/bin/env python3
"""ACP stdio bridge for the MiniMax harness (Shellular spawn).

Stdout is JSON-RPC only.  MiniMax has no upstream CLI / ACP / sandbox today,
so this bridge talks directly to the MM HTTP API
(`https://api.minimax.io/v1/chat/completions`) and synthesizes ACP frames
around the streamed response.  Model selection comes from MMH_MODEL env or
defaults to `MiniMax-M2.7-highspeed` (the harness's utility model — fast,
short, no 1M-context flagship needed for phone replies).

Auth comes from the process env (`MINIMAX_API_KEY`) or
~/.secrets/global-api-keys (the names-only fleet file the harness reads) —
never from agents.json.  The Shellular `minimax` id sets MMH_API_KEY_NAME
to a key name; this bridge reads only that name, never the value.

Phone clients cannot answer MM interactive approval prompts (the MM API
itself doesn't expose any — it has no permission model), so there is no
approval layer.  The bridge still (1) detaches the request loop from ACP
stdin, (2) streams heartbeats so Shellular leaves Thinking, and (3) bounds
the wall clock at MMH_ACP_TIMEOUT_SEC (default 900s).

Tracked copy: ai-fleet-coordinator/scripts/dsh-runtime/mmh-acp.py
Live install: ~/apps/harness-runtime/mmh-acp.py
"""

from __future__ import annotations

import datetime
import json
import os
import signal
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Any

DEFAULT_MODEL = os.environ.get("MMH_MODEL", "MiniMax-M2.7-highspeed")
DEFAULT_BASE_URL = os.environ.get("MMH_BASE_URL", "https://api.minimax.io/v1")
DEFAULT_TIMEOUT_SEC = int(os.environ.get("MMH_ACP_TIMEOUT_SEC", "900"))
DEFAULT_HEARTBEAT_SEC = float(os.environ.get("MMH_ACP_HEARTBEAT_SEC", "5"))
MMH_API_KEY_NAME = os.environ.get("MMH_API_KEY_NAME", "MINIMAX_API_KEY")
MMH_PROFILE = os.environ.get("MMH_PROFILE", "mmh-headless")

JsonDict = dict[str, Any]


def _load_key_from_global_secrets() -> None:
    """Read ~/.secrets/global-api-keys for the single MMH_API_KEY_NAME we were
    told to look up.  Never reads anything else from the file; the rest of
    that file is fleet-managed and out of scope for this bridge."""
    target = os.environ.get(MMH_API_KEY_NAME)
    if target:
        return
    secrets = Path.home() / ".secrets" / "global-api-keys"
    if not secrets.is_file():
        return
    try:
        text = secrets.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        name, _, val = line.partition("=")
        if name.strip() != MMH_API_KEY_NAME:
            continue
        val = val.strip().strip("'").strip('"')
        if val:
            os.environ[MMH_API_KEY_NAME] = val
            return


_load_key_from_global_secrets()

out_lock = threading.Lock()
sessions: dict[str, JsonDict] = {}
heartbeat_timers: dict[str, threading.Timer] = {}
heartbeat_lock = threading.Lock()


def emit(obj: JsonDict) -> None:
    line = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    with out_lock:
        sys.stdout.write(line + "\n")
        sys.stdout.flush()


def reply(req_id: Any, result: Any) -> None:
    emit({"jsonrpc": "2.0", "id": req_id, "result": result})


def reply_error(req_id: Any, code: int, message: str) -> None:
    emit({"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}})


def notify(method: str, params: JsonDict) -> None:
    emit({"jsonrpc": "2.0", "method": method, "params": params})


def start_heartbeat(session_id: str) -> None:
    """Shellular leaves Thinking only on streamed bytes.  MM is HTTP, so we
    synthesize `content.delta` frames at a fixed cadence until the real
    response starts."""
    def beat() -> None:
        with heartbeat_lock:
            if session_id not in heartbeat_timers:
                return
        elapsed = time.monotonic() - sessions.get(session_id, {}).get("started_at", time.monotonic())
        notify("content.delta", {
            "sessionId": session_id,
            "streamKind": "heartbeat",
            "delta": f"[working… {int(elapsed)}s]",
        })
        with heartbeat_lock:
            t = threading.Timer(DEFAULT_HEARTBEAT_SEC, beat)
            t.daemon = True
            heartbeat_timers[session_id] = t
            t.start()

    with heartbeat_lock:
        t = threading.Timer(DEFAULT_HEARTBEAT_SEC, beat)
        t.daemon = True
        heartbeat_timers[session_id] = t
        t.start()


def stop_heartbeat(session_id: str) -> None:
    with heartbeat_lock:
        t = heartbeat_timers.pop(session_id, None)
    if t is not None:
        t.cancel()


def handle_initialize(req_id: Any, _params: JsonDict) -> None:
    reply(req_id, {
        "protocolVersion": 1,
        "agentInfo": {
            "name": "minimax-harness",
            "version": "0.1.0",
            "profile": MMH_PROFILE,
            "model": DEFAULT_MODEL,
        },
        "agentCapabilities": {
            "loadSession": False,
            "mcpCapabilities": {"http": True, "sse": True},
        },
    })


def handle_session_new(req_id: Any, params: JsonDict) -> None:
    session_id = "session-" + uuid.uuid4().hex[:12]
    cwd = params.get("cwd") or os.getcwd()
    sessions[session_id] = {
        "cwd": cwd,
        "started_at": time.monotonic(),
        "history": [],
    }
    reply(req_id, {"sessionId": session_id})


def handle_session_prompt(req_id: Any, params: JsonDict) -> None:
    """Stream one MM HTTP chat-completions request, translating SSE frames
    into ACP `content.delta` notifications.  Blocks until the response ends
    or the wall-clock fires."""
    import urllib.error
    import urllib.request

    session_id = params.get("sessionId") or ""
    session = sessions.get(session_id)
    if session is None:
        reply_error(req_id, -32000, f"unknown session: {session_id}")
        return

    api_key = os.environ.get(MMH_API_KEY_NAME)
    if not api_key:
        reply_error(req_id, -32000, f"no {MMH_API_KEY_NAME} in env")
        return

    prompt_text = ""
    for block in params.get("prompt", []):
        if isinstance(block, dict) and block.get("type") == "text":
            prompt_text += block.get("text", "")

    session["history"].append({"role": "user", "content": prompt_text})
    body = {
        "model": DEFAULT_MODEL,
        "messages": session["history"],
        "stream": True,
        "stream_options": {"include_usage": True},
        "reasoning_split": True,
    }
    req = urllib.request.Request(
        f"{DEFAULT_BASE_URL}/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    notify("turn.started", {"sessionId": session_id, "model": DEFAULT_MODEL})
    start_heartbeat(session_id)
    full_text = ""
    full_reasoning = ""
    timed_out = False
    try:
        deadline = time.monotonic() + DEFAULT_TIMEOUT_SEC
        with urllib.request.urlopen(req, timeout=DEFAULT_TIMEOUT_SEC) as resp:
            for raw_line in resp:
                if time.monotonic() > deadline:
                    timed_out = True
                    break
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]" or not data:
                    continue
                try:
                    chunk = json.loads(data)
                except json.JSONDecodeError:
                    continue
                delta = (chunk.get("choices") or [{}])[0].get("delta") or {}
                content = delta.get("content")
                reasoning = delta.get("reasoning_content")
                if isinstance(reasoning, str) and reasoning:
                    full_reasoning += reasoning
                    notify("content.delta", {
                        "sessionId": session_id,
                        "streamKind": "reasoning_text",
                        "delta": reasoning,
                    })
                if isinstance(content, str) and content:
                    full_text += content
                    notify("content.delta", {
                        "sessionId": session_id,
                        "streamKind": "assistant_text",
                        "delta": content,
                    })
    except urllib.error.HTTPError as e:
        stop_heartbeat(session_id)
        notify("turn.completed", {
            "sessionId": session_id,
            "stopReason": "error",
            "error": f"HTTP {e.code}: {e.reason}",
        })
        reply(req_id, {"stopReason": "error"})
        return
    except (urllib.error.URLError, TimeoutError) as e:
        stop_heartbeat(session_id)
        notify("turn.completed", {
            "sessionId": session_id,
            "stopReason": "error",
            "error": str(e),
        })
        reply(req_id, {"stopReason": "error"})
        return
    finally:
        stop_heartbeat(session_id)

    final = full_text.strip() or full_reasoning
    session["history"].append({"role": "assistant", "content": final})
    notify("turn.completed", {
        "sessionId": session_id,
        "stopReason": "timeout" if timed_out else "end_turn",
    })
    reply(req_id, {"stopReason": "timeout" if timed_out else "end_turn"})


HANDLERS = {
    "initialize": handle_initialize,
    "session/new": handle_session_new,
    "session/prompt": handle_session_prompt,
}


def serve() -> None:
    for raw in sys.stdin:
        line = raw.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            continue
        method = req.get("method")
        req_id = req.get("id")
        params = req.get("params") or {}
        handler = HANDLERS.get(method)
        if handler is None:
            if req_id is not None:
                reply_error(req_id, -32601, f"method not found: {method}")
            continue
        try:
            handler(req_id, params)
        except Exception as e:  # noqa: BLE001
            if req_id is not None:
                reply_error(req_id, -32603, f"{type(e).__name__}: {e}")


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    serve()
