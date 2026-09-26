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

ACP wire contract (must match Shellular / @agentclientprotocol, same as
bridges/dsh/dsh-acp.py):
  - notifications: method `session/update` with
    `sessionUpdate: agent_message_chunk | agent_thought_chunk`
  - prompt result: `stopReason: end_turn` (snake_case ACP StopReason)
  - NEVER emit BotFleet-shaped `content.delta` / `turn.*` — Shellular
    ignores those, which produced empty successful end_turns after thinking.

Tracked copy: bridges/mmh/mmh-acp.py
Live install: ~/apps/harness-runtime/bridges/mmh/mmh-acp.py
"""

from __future__ import annotations

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
prompt_cancel: dict[str, threading.Event] = {}
prompt_lock = threading.Lock()


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


def emit_text(session_id: str, text: str) -> None:
    """Visible assistant bytes — Shellular only renders agent_message_chunk."""
    if not text:
        return
    notify(
        "session/update",
        {
            "sessionId": session_id,
            "update": {
                "sessionUpdate": "agent_message_chunk",
                "content": {"type": "text", "text": text},
            },
        },
    )


def emit_thought(session_id: str, text: str) -> None:
    """Thinking / heartbeat — Shellular renders agent_thought_chunk."""
    if not text:
        return
    notify(
        "session/update",
        {
            "sessionId": session_id,
            "update": {
                "sessionUpdate": "agent_thought_chunk",
                "content": {"type": "text", "text": text},
            },
        },
    )


def start_heartbeat(session_id: str) -> None:
    """Shellular leaves Thinking only on streamed ACP updates.  MM is HTTP,
    so we synthesize thought chunks at a fixed cadence until real tokens."""

    def beat() -> None:
        with heartbeat_lock:
            if session_id not in heartbeat_timers:
                return
        elapsed = time.monotonic() - sessions.get(session_id, {}).get(
            "started_at", time.monotonic()
        )
        emit_thought(session_id, f"[working… {int(elapsed)}s]\n")
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


def modes_block() -> JsonDict:
    return {
        "currentModeId": "agent",
        "availableModes": [
            {"id": "agent", "name": "Agent"},
        ],
    }


def handle_initialize(req_id: Any, params: JsonDict) -> None:
    version = params.get("protocolVersion", 1)
    reply(
        req_id,
        {
            "protocolVersion": version,
            "agentInfo": {
                "name": "minimax-harness",
                "version": "0.2.0",
                "profile": MMH_PROFILE,
                "model": DEFAULT_MODEL,
            },
            "agentCapabilities": {
                "loadSession": False,
                "promptCapabilities": {
                    "image": False,
                    "audio": False,
                    "embeddedContext": True,
                },
                "mcpCapabilities": {"http": False, "sse": False},
            },
            "authMethods": [],
        },
    )


def handle_authenticate(req_id: Any, _params: JsonDict) -> None:
    reply(req_id, {})


def handle_session_new(req_id: Any, params: JsonDict) -> None:
    session_id = "session-" + uuid.uuid4().hex[:12]
    cwd = params.get("cwd") or os.getcwd()
    sessions[session_id] = {
        "cwd": cwd,
        "started_at": time.monotonic(),
        "history": [],
    }
    reply(req_id, {"sessionId": session_id, "modes": modes_block()})


def handle_session_cancel(req_id: Any, params: JsonDict) -> None:
    session_id = str(params.get("sessionId") or "")
    with prompt_lock:
        ev = prompt_cancel.get(session_id)
    cancelled = False
    if ev is not None:
        ev.set()
        cancelled = True
    stop_heartbeat(session_id)
    if req_id is not None:
        reply(req_id, {"cancelled": cancelled})


def _run_prompt(req_id: Any, params: JsonDict) -> None:
    """Stream one MM HTTP chat-completions request into ACP session/update
    chunks.  Runs on a worker thread so stdin can still accept cancel."""
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
        elif isinstance(block, dict) and isinstance(block.get("text"), str):
            prompt_text += block["text"]
        elif isinstance(block, str):
            prompt_text += block

    if not prompt_text.strip():
        reply_error(req_id, -32000, "empty prompt")
        return

    cancel = threading.Event()
    with prompt_lock:
        prompt_cancel[session_id] = cancel

    session["history"].append({"role": "user", "content": prompt_text})
    session["started_at"] = time.monotonic()
    body = {
        "model": DEFAULT_MODEL,
        "messages": session["history"],
        "stream": True,
        "stream_options": {"include_usage": True},
        "reasoning_split": True,
    }
    req = urllib.request.Request(
        f"{DEFAULT_BASE_URL.rstrip('/')}/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    start_heartbeat(session_id)
    full_text = ""
    full_reasoning = ""
    timed_out = False
    cancelled = False
    http_error: str | None = None
    try:
        deadline = time.monotonic() + DEFAULT_TIMEOUT_SEC
        with urllib.request.urlopen(req, timeout=DEFAULT_TIMEOUT_SEC) as resp:
            for raw_line in resp:
                if cancel.is_set():
                    cancelled = True
                    break
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
                # MiniMax may put thinking in reasoning_content or thinking
                reasoning = delta.get("reasoning_content") or delta.get("thinking")
                content = delta.get("content")
                if isinstance(reasoning, str) and reasoning:
                    full_reasoning += reasoning
                    emit_thought(session_id, reasoning)
                if isinstance(content, str) and content:
                    full_text += content
                    emit_text(session_id, content)
    except urllib.error.HTTPError as e:
        http_error = f"HTTP {e.code}: {e.reason}"
        try:
            detail = e.read().decode("utf-8", errors="replace")[:500]
            if detail:
                http_error = f"{http_error} — {detail}"
        except Exception:  # noqa: BLE001
            pass
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        http_error = str(e)
    finally:
        stop_heartbeat(session_id)
        with prompt_lock:
            prompt_cancel.pop(session_id, None)

    if http_error is not None:
        emit_text(session_id, f"[mmh-acp] {http_error}\n")
        reply_error(req_id, -32000, http_error)
        return

    if cancelled:
        reply(req_id, {"stopReason": "cancelled"})
        return

    if timed_out:
        emit_text(
            session_id,
            f"\n[mmh-acp] Timed out after {DEFAULT_TIMEOUT_SEC}s.\n",
        )
        reply(req_id, {"stopReason": "max_tokens"})
        return

    # Harden: never treat a blank body as a normal successful end_turn.
    # Shellular renders only agent_message_chunk; an empty successful turn
    # looks like "thinking then blank reply".
    visible = full_text.strip()
    if not visible:
        if full_reasoning.strip():
            # Model returned only reasoning (reasoning_split quirk) — surface it.
            emit_text(session_id, full_reasoning)
            visible = full_reasoning.strip()
        else:
            msg = (
                "[mmh-acp] empty response from MiniMax API "
                "(no content or reasoning_content in stream)"
            )
            emit_text(session_id, msg + "\n")
            reply_error(req_id, -32000, msg)
            return

    session["history"].append({"role": "assistant", "content": visible})
    reply(req_id, {"stopReason": "end_turn"})


def handle_session_prompt(req_id: Any, params: JsonDict) -> None:
    thread = threading.Thread(
        target=_run_prompt,
        args=(req_id, params),
        daemon=True,
    )
    thread.start()


HANDLERS = {
    "initialize": handle_initialize,
    "authenticate": handle_authenticate,
    "session/new": handle_session_new,
    "session/prompt": handle_session_prompt,
    "session/cancel": handle_session_cancel,
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
                # ACP clients probe optional methods; empty result is fine.
                reply(req_id, {})
            continue
        try:
            handler(req_id, params)
        except Exception as e:  # noqa: BLE001
            if req_id is not None:
                reply_error(req_id, -32603, f"{type(e).__name__}: {e}")


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    serve()
