"""V1-S4 canonical usage ingestion transport (HTTP loopback).

Emits exactly one usage event per model response that carries BOTH
trustworthy usage metadata AND a stable response identity, to the WorkBridge
API's authenticated internal ingestion endpoint
(``POST /workspace/usage/ingest``). Control / WorkBridge remains the SOLE
owner of canonical ledger mutation: this module knows the transport contract
only — never the store internals, never a store path, never a Control Python
module location.

Credential discipline: the emitter sends whatever credential the process
already legitimately holds, in this order —

1. ``WORKBRIDGE_INGEST_TOKEN``  — a future ingest-scoped credential
   (NEW_SCOPED_INGEST_CREDENTIAL_REQUIRED: not yet provisioned; until Mousai
   authorizes it this emitter stays DORMANT on hosts that hold neither).
2. ``WORKBRIDGE_TOKEN`` — the existing broad WorkBridge bearer, used only
   when the process environment already carries it (loopback only).

No token → no emission, no error, no fallback to direct file access. The
credential value is never logged, never sent anywhere but the Authorization
header of the local loopback POST.

Exactly-once identity: ``usage_id`` is a deterministic hash of the provider
response identity plus token buckets. A delivery retry of the same event
carries the SAME usage_id; the server rejects it with 409, which counts as
success. A response WITHOUT a stable identity is never emitted — unknown
usage is preferable to duplicate authoritative usage. No prompt hash, no
response-body hash, no random UUID as canonical identity.

Delivery semantics: MODEL execution failure never triggers emission, and
usage emission never fails the model response. Transport errors and 5xx get
ONE bounded retry; 409 duplicate_usage_id after a retry is success; other
4xx contract errors are logged safely (no body contents, no credential) and
never retried.

Security boundary (hard): only the contract fields travel — token counts and
routing metadata. Prompts, response bodies, headers, API keys and provider
account identifiers are never read, stored or transmitted. Work/project
attribution uses ONLY the explicit execution context (``WORKBRIDGE_WORK_ID``
/ ``WORKBRIDGE_PROJECT_ID``), never prompt text; absent → null.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)

# The canonical gateway source for model executions routed through Hermes.
LEDGER_SOURCE = "hermes-gateway"
DEFAULT_INGEST_URL = "http://127.0.0.1:8766/workspace/usage/ingest"
DEFAULT_TIMEOUT_SECONDS = 5.0
# Exactly one bounded retry for transport/5xx delivery problems.
MAX_DELIVERY_ATTEMPTS = 2

INGEST_FIELD_ORDER = (
    "usage_id", "occurred_at", "provider", "model", "agent", "project_id",
    "work_id", "requests", "input_tokens", "output_tokens", "total_tokens", "source",
)


class _DeliveryFailure(Exception):
    """Transport-level or 5xx failure: eligible for the bounded retry."""


def _response_id(response: Any) -> Optional[str]:
    """The provider's own stable response identifier, when exposed."""
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
    response_id: str,
    *,
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int = 0,
    cache_write_tokens: int = 0,
    reasoning_tokens: int = 0,
) -> str:
    """Deterministic per-response usage identity: identical across delivery
    retries, unique per genuine provider response."""
    identity = "|".join(
        str(part)
        for part in (
            provider, model, response_id,
            input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens,
        )
    )
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()[:32]


def _credential() -> Optional[str]:
    scoped = os.environ.get("WORKBRIDGE_INGEST_TOKEN", "").strip()
    if scoped:
        return scoped
    # Option 2 of the auth audit: reuse the broad bearer ONLY when this
    # process already legitimately holds it. Never read files to obtain one.
    return os.environ.get("WORKBRIDGE_TOKEN", "").strip() or None


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


def post_usage_json(url: str, payload: dict[str, Any], token: str, timeout: float) -> int:
    """One HTTP delivery. Returns the HTTP status. Raises _DeliveryFailure on
    transport problems and 5xx. Never logs the token or the payload."""
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "Content-Length": str(len(data)),
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return int(response.status)
    except urllib.error.HTTPError as exc:
        if 500 <= exc.code <= 599:
            raise _DeliveryFailure(f"ingest 5xx: {exc.code}") from exc
        return int(exc.code)  # 4xx: contract-level answer, caller decides
    except (OSError, urllib.error.URLError) as exc:
        raise _DeliveryFailure(f"ingest transport failure: {type(exc).__name__}") from exc


def emit_model_usage(
    *,
    provider: Optional[str],
    model: Optional[str],
    usage: Any,
    response: Any = None,
    agent: Optional[str] = None,
) -> None:
    """Record one model response's usage. Never raises; the model response is
    never affected by accounting failures (or by accounting being dormant)."""
    try:
        if usage is None or not provider or not model:
            return
        input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
        output_tokens = int(getattr(usage, "output_tokens", 0) or 0)
        cache_read_tokens = int(getattr(usage, "cache_read_tokens", 0) or 0)
        cache_write_tokens = int(getattr(usage, "cache_write_tokens", 0) or 0)
        reasoning_tokens = int(getattr(usage, "reasoning_tokens", 0) or 0)
        if not (input_tokens or output_tokens or cache_read_tokens or cache_write_tokens or reasoning_tokens):
            return
        # Exactly-once identity: no stable provider response id → no
        # canonical entry. Unknown usage is preferable to duplicate
        # authoritative usage; there is no UUID fallback.
        response_id = _response_id(response) if response is not None else None
        if not response_id:
            logger.debug("usage emission skipped: no stable response identity")
            return
        token = _credential()
        if not token:
            # Dormant until a credential is authorized (see module docstring).
            logger.debug("usage emission skipped: no ingestion credential configured")
            return

        # Ledger convention (provider-native): input includes cache reads and
        # writes; total = input + output (server-side invariant).
        ledger_input = input_tokens + cache_read_tokens + cache_write_tokens
        usage_id = model_usage_id(
            str(provider), str(model), response_id,
            input_tokens=ledger_input, output_tokens=output_tokens,
        )
        # Attribution: ONLY the explicit execution context, never prompt text.
        payload = {
            "usage_id": usage_id,
            "occurred_at": datetime.now(timezone.utc).isoformat(),
            "provider": str(provider),
            "model": str(model),
            "agent": _canonical_agent_identity(agent),
            "project_id": os.environ.get("WORKBRIDGE_PROJECT_ID") or None,
            "work_id": os.environ.get("WORKBRIDGE_WORK_ID") or None,
            "requests": max(1, int(getattr(usage, "request_count", 1) or 1)),
            "input_tokens": ledger_input,
            "output_tokens": output_tokens,
            "total_tokens": ledger_input + output_tokens,
            "source": LEDGER_SOURCE,
        }
        url = os.environ.get("WORKBRIDGE_INGEST_URL", DEFAULT_INGEST_URL)
        timeout = float(os.environ.get("WORKBRIDGE_INGEST_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS)))

        for attempt in range(MAX_DELIVERY_ATTEMPTS):
            try:
                status = post_usage_json(url, {"entries": [payload]}, token, timeout)
            except _DeliveryFailure as exc:
                if attempt + 1 < MAX_DELIVERY_ATTEMPTS:
                    continue
                logger.debug("usage delivery failed after retry: %s", exc)
                return
            if status == 200 or status == 409:
                # 200 = recorded; 409 duplicate_usage_id = a lost
                # acknowledgement after a recorded delivery — success.
                return
            # Other 4xx: contract-level problem, never retried, logged
            # without body contents or credential material.
            logger.debug("usage delivery rejected with status %s", status)
            return
    except Exception:
        logger.debug("workbridge usage emission failed (non-fatal)", exc_info=True)
