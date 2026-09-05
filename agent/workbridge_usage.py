"""V1-S4 canonical usage-ledger emission (WorkBridge engineering contract).

Emits exactly one usage event per model response that carries trustworthy
usage metadata, into the WorkBridge append-only usage ledger — the same
canonical store the Control API reads. Delivery is strictly best-effort: any
failure is logged at debug level and never affects the conversation.

Security boundary (hard): only token-count facts travel. Prompts, response
bodies, headers, API keys and provider account identifiers are never read,
never stored, never transmitted. Work/project attribution uses ONLY the
explicit execution context (``WORKBRIDGE_WORK_ID`` / ``WORKBRIDGE_PROJECT_ID``
set by the execution harness); it is never inferred from prompt text and
stays null when absent.

Idempotency: ``usage_id`` is a deterministic hash of the response identity
(provider, model, response id, token buckets). A delivery retry of the same
event produces the same id; the server rejects it as a duplicate, which this
emitter treats as success. A provider response without a usable id cannot be
made stable, so it gets a unique id — a rare late retry may double count
rather than be silently dropped; honest either way.

The shared ledger lives at ``WORKBRIDGE_USAGE_ROOT`` (default
``/var/lib/workagent/workbridge/usage``) and is written through the real
WorkBridge ``usage_store`` module (loaded from ``WORKBRIDGE_API_DIR``,
default ``/opt/workagent/workbridge-api``). When either is unavailable —
e.g. a local dev machine — emission is silently skipped: no ledger, no fake
facts.
"""

from __future__ import annotations

import hashlib
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)

# The canonical gateway source for model executions routed through Hermes.
# Reserved engineering probes use usage_store.ENGINEERING_PROBE_SOURCE.
LEDGER_SOURCE = "hermes-gateway"


def _response_id(response: Any) -> Optional[str]:
    """The provider's own response identifier, when the transport exposes it."""
    for candidate in ("id", "response_id"):
        value = getattr(response, candidate, None)
        if isinstance(value, str) and value.strip():
            return value.strip()
    try:
        value = response.get("id")
    except AttributeError:
        value = None
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def model_usage_id(
    provider: str,
    model: str,
    response_id: Optional[str],
    *,
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int = 0,
    cache_write_tokens: int = 0,
    reasoning_tokens: int = 0,
) -> str:
    """Stable per-response usage identity: a delivery retry yields the same
    id, so the append-only ledger can reject the duplicate."""
    identity = "|".join(
        str(part)
        for part in (
            provider, model, response_id or uuid.uuid4().hex,
            input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens,
        )
    )
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()[:32]


def _load_usage_store(root: str):
    api_dir = os.environ.get("WORKBRIDGE_API_DIR", "/opt/workagent/workbridge-api")
    if api_dir not in os.sys.path:
        os.sys.path.insert(0, api_dir)
    try:
        import usage_store  # noqa: PLC0415 — dynamic, boundary-local import
    except Exception:
        logger.debug("workbridge usage_store unavailable; usage not recorded")
        return None
    try:
        return usage_store.UsageStore(root)
    except Exception:
        logger.debug("workbridge usage store unusable at %s; usage not recorded", root)
        return None


def _canonical_agent_identity(explicit: Optional[str]) -> Optional[str]:
    """Canonical agent identity: the explicit caller value when given, else
    the active Hermes profile name. Never a made-up constant."""
    if explicit:
        return str(explicit)
    try:
        from hermes_cli.profiles import get_active_profile_name  # noqa: PLC0415

        name = get_active_profile_name()
        return str(name) if name else None
    except Exception:
        return None


def emit_model_usage(
    *,
    provider: Optional[str],
    model: Optional[str],
    usage: Any,
    response: Any = None,
    agent: Optional[str] = None,
) -> None:
    """Record one model response's usage. Never raises; never blocks longer
    than a local file write (the shared ledger is on the same host)."""
    try:
        if usage is None or not provider or not model:
            return
        input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
        output_tokens = int(getattr(usage, "output_tokens", 0) or 0)
        cache_read_tokens = int(getattr(usage, "cache_read_tokens", 0) or 0)
        cache_write_tokens = int(getattr(usage, "cache_write_tokens", 0) or 0)
        reasoning_tokens = int(getattr(usage, "reasoning_tokens", 0) or 0)
        requests = max(1, int(getattr(usage, "request_count", 1) or 1))
        if not (input_tokens or output_tokens or cache_read_tokens or cache_write_tokens or reasoning_tokens):
            return

        # Attribution: ONLY the explicit execution context, never prompt text.
        work_id = os.environ.get("WORKBRIDGE_WORK_ID") or None
        project_id = os.environ.get("WORKBRIDGE_PROJECT_ID") or None
        response_id = _response_id(response) if response is not None else None
        usage_id = model_usage_id(
            provider, model, response_id,
            input_tokens=input_tokens, output_tokens=output_tokens,
            cache_read_tokens=cache_read_tokens, cache_write_tokens=cache_write_tokens,
            reasoning_tokens=reasoning_tokens,
        )


        root = os.environ.get("WORKBRIDGE_USAGE_ROOT", "/var/lib/workagent/workbridge/usage")
        store = _load_usage_store(root)
        if store is None:
            return
        # Ledger convention (matches OpenAI/Anthropic prompt totals): input
        # includes cache reads/writes; total = input + output. The cache
        # split stays in the session accounting DB.
        ledger_input = input_tokens + cache_read_tokens + cache_write_tokens
        try:
            store.ingest([{
                "usage_id": usage_id,
                "occurred_at": datetime.now(timezone.utc).isoformat(),
                "provider": str(provider),
                "model": str(model),
                "agent": _canonical_agent_identity(agent),
                "project_id": project_id,
                "work_id": work_id,
                "requests": requests,
                "input_tokens": ledger_input,
                "output_tokens": output_tokens,
                "total_tokens": ledger_input + output_tokens,
                "source": LEDGER_SOURCE,
            }], now=datetime.now(timezone.utc).isoformat())
        except Exception as exc:
            # A duplicate (delivery retry) is success; anything else is a
            # skipped event — logged, never fatal.
            code = getattr(exc, "code", None)
            if code != "duplicate_usage_id":
                logger.debug("workbridge usage emission skipped: %s", type(exc).__name__)
    except Exception:
        logger.debug("workbridge usage emission failed (non-fatal)", exc_info=True)
