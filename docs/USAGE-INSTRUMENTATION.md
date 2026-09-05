# V1-S4 Usage Instrumentation — capability matrix & boundary contract

Date: 2026-09-05
Branch: `feature/v1-s4-live-zcode` (agent instrumentation) + `feature/v1-s4-control-live-zcode` (ledger)
Standard: `contract` in `mousai-workspace/services/workbridge-api/openapi.json` (OpenAPI 2.2.0, `UsageEntry`).

## 1. The canonical boundary (one chokepoint per execution path)

Model usage is emitted at the point where the provider response's usage
object is NORMALIZED — never at individual call sites:

| Execution path | Chokepoint | Emits |
|---|---|---|
| Main conversation turn | `agent/conversation_loop.py` (`normalize_usage` on `response.usage`) | the response's own usage (pre-MoA-fold) |
| MoA advisor fan-out | `agent/moa_loop.py` (advisor `normalize_usage`) | each advisor at its OWN model/provider |
| Auxiliary tasks | `agent/aux_accounting.py::record_aux_usage` (single aux validation chokepoint) | aux response usage |

Ingestion authority (final): HTTP CANONICAL. The emitter POSTs the contract
payload to the local trusted endpoint — `http://127.0.0.1:8766/workspace/usage/ingest`
(`WORKBRIDGE_INGEST_URL` override) — and WorkBridge API validation +
`UsageStore` persistence remain the sole owner of canonical ledger mutation.
Hermes holds NO knowledge of store internals, store paths, or Control Python
module locations. No public Internet route is involved.

Failure semantics: emission is best-effort and non-fatal. Transport errors
and 5xx get exactly ONE bounded retry; `409 duplicate_usage_id` counts as
success (a delivery retry after a recorded event); other 4xx are logged
safely and never retried. When the endpoint or credential is unavailable
nothing is recorded — an absent fact, never a synthesised one.

Credential status: `NEW_SCOPED_INGEST_CREDENTIAL_REQUIRED`. Audit result:
`WORKBRIDGE_TOKEN` exists only in the WorkBridge service's own
`EnvironmentFile`; the Hermes gateway process does not legitimately hold it
(the mousai-workspace plugin explicitly never loads the bearer). Until Mousai
authorizes an ingest-scoped credential (`WORKBRIDGE_INGEST_TOKEN`), the
emitter stays DORMANT on hosts holding neither variable — the code path is
live, canonical mutation is not.

## 2. Attribution discipline (F)

- `work_id` / `project_id`: taken ONLY from the explicit execution-context
  environment (`WORKBRIDGE_WORK_ID`, `WORKBRIDGE_PROJECT_ID`) set by the
  execution harness. Never parsed from prompt text, never guessed from file
  paths. Absent → `null`.
- `agent`: canonical identity = active Hermes profile name
  (`hermes_cli.profiles.get_active_profile_name()`); MoA advisors are stamped
  `moa-advisor` (plus their own model attribution).
- `usage_id`: deterministic
  `sha256(provider|model|response_id|input|output)[:32]` over the LEDGER
  token convention (input includes cache). A delivery retry of the same
  response produces the same id → the server rejects the duplicate
  (`409 duplicate_usage_id`) → treated as success. No double counting.

  Stable-identity capability (audit of all three chokepoints — main
  conversation, MoA advisor, aux): provider response id is the ONLY stable
  identity that survives a delivery retry; no stable model-call/request id
  or execution trace id exists that would not change across retries.
  Therefore: response WITH a stable id → emitted; response WITHOUT one →
  NOT emitted (`PARTIAL / NO_STABLE_USAGE_ID` — unknown usage is preferable
  to duplicate authoritative usage). No prompt hash, no response-body hash,
  no random UUID as canonical idempotency identity.

## 3. Never transported (hard boundary)

prompt text, response body, `Authorization` header, API keys, provider
account ids, raw request bodies. The ledger contract's allowlist enforces
this server-side as well (unknown fields are rejected, not dropped).

## 4. Provider capability matrix (G)

Principle: ACTUAL structured usage only. No tokenizer reconstruction, no
estimated token fabrication. If a provider does not expose usage metadata,
no ledger event exists for it — tokens unknown ≠ tokens zero.

| Provider / path | usage metadata? | input/output split? | response id? | kind | instrumented? | reason if HOLD |
|---|---|---|---|---|---|---|
| OpenAI Chat-Completions compatible (incl. GLM/Zhipu, DeepSeek, OpenRouter, local compatible servers) | yes — `usage.prompt_tokens/completion_tokens` (+ `prompt_tokens_details.cached_tokens` where supported) | yes | yes (`response.id`) | actual | YES | — |
| Anthropic Messages | yes — `usage.input_tokens/output_tokens` + cache fields | yes | yes | actual | YES | — |
| Codex Responses backend | yes — `input_tokens` + `input_tokens_details.cached_tokens` | yes (cache separated by `normalize_usage`) | yes | actual | YES | — |
| Gemini via relay (gemini-proxy-cloudrun) | depends on relay passthrough | via adapter | yes | actual | PARTIAL | event emitted only when the relayed response still carries usage metadata; if a relay strips it, no event is fabricated — HOLD until relay passthrough is verified on a live call |
| Providers without usage metadata in response | no | — | — | — | NO | no fabrication; instrumentation waits for metadata |

`cache_read/cache_write` buckets fold into the ledger's simple contract
using the provider-native convention: `input_tokens` = prompt total INCLUDING
cache reads/writes, `total_tokens` = input_tokens + output_tokens (the
ledger's server-side invariant). The cache split remains in the session
accounting DB; the ledger carries the contract shape only.

## 5. Engineering probes (C)

`source = engineering_probe` is the ONE reserved engineering source:
deployment smoke entries stay in the append-only ledger as evidence but are
excluded from `providerUsage` rollups and anomaly baselines. No other source
filtering exists.
