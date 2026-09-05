# V1-S4 review / cost / safety / release contract gaps

Date: 2026-08-30
Desktop branch: `feature/v1-s4-review-cost-foundation`

These are minimum canonical contracts for the existing batched Workspace snapshot and typed Hermes `ctx.rest` surface. They are not permission to add a Desktop database, inspect provider secrets, scan logs, call billing providers directly, or create generic mutation endpoints.

## 1. `usageLedger`

- Need: canonical request and token usage entries.
- Why: Desktop cannot derive trusted usage from task counts, local logs, or Provider configuration.
- Minimal DTO: `usageLedger: Array<{ usage_id; occurred_at; provider; model; agent; project_id; work_id; requests; input_tokens; output_tokens; total_tokens; source; revision }>`.
- Read / Write: read, batched in the Workspace snapshot; server append-only.
- Authority: Control usage ledger populated by the approved model relay/provider adapter.
- Security boundary: no API key, raw prompt, response body, access token, or billing credential.

## 2. `providerUsage`

- Need: canonical rollups by Provider, model, agent, project, and WORK-ID.
- Why: client-side regrouping is useful only after authoritative ledger facts exist and cannot prove provider billing totals.
- Minimal DTO: `providerUsage: Array<{ period_start; period_end; provider; model; agent; project_id; work_id; requests; tokens; value; currency; value_kind: 'estimated' | 'actual'; generated_at }>`.
- Read / Write: read.
- Authority: Control / provider usage adapter.
- Security boundary: aggregated facts only; no direct Desktop provider request.

## 3. `providerCredit`

- Need: remaining credit, reset, expiry, and health.
- Why: promotional credit and billing-cycle facts change and must never be hard-coded in Desktop.
- Minimal DTO: `providerCredit: Array<{ provider; current_model; remaining_credit; currency; reset_at; expires_at; health: 'healthy' | 'degraded' | 'unavailable' | 'unknown'; value_kind: 'estimated' | 'actual'; checked_at }>`.
- Read / Write: read.
- Authority: approved provider billing adapter through Control.
- Security boundary: sanitized status only; billing credential remains server-side.

## 4. `costAttribution`

- Need: attributable actual/estimated cost per task and project.
- Why: token usage alone does not establish price, discounts, free credit, or charge ownership.
- Minimal DTO: `costAttribution: Array<{ attribution_id; work_id; project_id; provider; model; amount; currency; value_kind: 'estimated' | 'actual'; pricing_version; occurred_at }>`.
- Read / Write: read.
- Authority: Control cost ledger.
- Security boundary: no payment instrument, invoice document, or provider account identifier in Renderer.

## 5. `aiContribution`

- Need: explicit contribution classification evidence.
- Why: a task coming from an AI system or naming WorkBuddy does not prove AI produced the deliverable.
- Minimal DTO: `aiContribution: Array<{ work_id; state: 'HUMAN' | 'AI_ASSISTED' | 'AI_PRIMARY' | 'AI_AUTONOMOUS' | 'UNKNOWN'; evidence_refs: string[]; assessed_by; assessed_at; revision }>`.
- Read / Write: read; future human assessment uses a separate typed mutation.
- Authority: Control, based on production provenance and accepted review evidence.
- Security boundary: evidence references are opaque IDs, not artifact bodies or private prompts.

## 6. `reviewHistory`

- Need: completion, review, DDL, and reschedule history by period.
- Why: current task status and `updatedAt` cannot prove when work was completed or why a deadline moved.
- Minimal DTO: `reviewHistory: Array<{ event_id; work_id; project_id; type: 'completed' | 'deadline_changed' | 'reviewed' | 'accepted' | 'reopened'; occurred_at; actor; previous_value; next_value; revision }>`.
- Read / Write: read-only to Desktop; append-only server history.
- Authority: Control / WorkBridge.
- Security boundary: clients cannot rewrite history; no free-form internal log dump.

## 7. `actualDuration`

- Need: scheduled start/end and actual work duration.
- Why: estimated duration, DDL, acceptance time, and file timestamps do not prove labor or machine execution time.
- Minimal DTO: `executionTiming: Array<{ work_id; scheduled_start; scheduled_end; actual_start; actual_end; actual_duration_minutes; measured_by; revision }>`.
- Read / Write: read.
- Authority: Control / WorkBridge execution ledger.
- Security boundary: task timing only; no process list, keystroke monitoring, or user activity surveillance.

## 8. `securityAlerts`

- Need: canonical usage anomaly and Secret exposure alerts.
- Why: Desktop must not scan secrets/logs or independently revoke keys.
- Minimal DTO: `securityAlerts: Array<{ alert_id; type: 'usage_spike' | 'unknown_model' | 'rate_anomaly' | 'ledger_mismatch' | 'secret_exposure'; severity; state; detected_at; provider; work_id; safe_summary; revision }>`.
- Read / Write: read; acknowledge/resolve would require named privileged mutations.
- Authority: Control security monitor.
- Security boundary: safe summary only; never include a secret value, Authorization header, access ticket, or raw provider response.

## 9. `backupStatus`

- Need: latest backup, state, restore-test evidence, protected components, and safe error.
- Why: Desktop cannot prove recoverability by inspecting local files or copying databases.
- Minimal DTO: `backupStatus: { latest_backup_at; state: 'healthy' | 'failed' | 'running' | 'unknown'; last_restore_test_at; last_restore_test_state; protected_components: string[]; last_error_code; checked_at }`.
- Read / Write: read.
- Authority: the approved backup/recovery system through Control.
- Security boundary: no backup archive path, Secret content, storage credential, or unrestricted filesystem access.

## 10. `systemSettings`

- Need: canonical workday boundary, night budget, timezone, notification preference, work scope, and Provider display preferences.
- Why: localStorage and Desktop preferences must not become cross-device operating policy.
- Minimal DTO: `systemSettings: { workday_end; night_budget; budget_currency; timezone; notification_preferences; work_scope_revision; provider_display: string[]; revision }` plus named typed mutations using `expected_revision` and `client_request_id`.
- Read / Write: read; privileged typed writes after explicit human action.
- Authority: Control.
- Security boundary: no Provider key, bot credential, arbitrary JSON patch, or client-only policy truth.

## Existing WorkBridge task flags

WorkBridge OpenAPI already owns typed `flag` (`material_missing` / `decision_required`) and `archive` endpoints. V1-S4 does not list them as missing canonical backend contracts. Desktop controls remain disabled only because the current Hermes plugin `ctx.rest` boundary does not expose those existing commands; Renderer direct WorkBridge access remains prohibited.

## Reconciliation (2026-09-05, ZCode 48h build)

Every gap above was classified against the current Control repo in
`mousai-workspace/docs/V1-S4-CONTRACT-RECONCILIATION.md` (branch
`feature/v1-s4-control-live-zcode`). Canonical implementations now exist for
reviewHistory, aiContribution, executionTiming, artifactRevisions,
systemSettings (typed mutations), usageLedger ingestion + providerUsage
rollups, securityAlerts (ledger-derived), backupStatus (canonical UNKNOWN),
notifications and sourceHealth. costAttribution and providerCredit remain
empty by contract (NO_REAL_SOURCE). Previous-revision artifact file metadata
before the S4 manifest history cannot be reconstructed (overwritten in
WorkData) and stays unavailable.
