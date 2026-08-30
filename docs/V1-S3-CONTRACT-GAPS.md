# V1-S3 multi-source intake contract gaps

Date: 2026-08-30
Desktop branch: `feature/v1-s3-intake-foundation`

This document records missing canonical contracts instead of inventing Desktop truth. Proposed DTOs belong in the existing batched Workspace snapshot or typed Hermes `ctx.rest` mutation surface. They are not a second API, database, credential path, or generic patch mechanism.

## 1. `sourceIdentity`

- Need: stable identity for each intake source.
- Why: the current adapter can map only exact compatible `Task.origin` and `Task.source` facts; sender and channel-specific IDs are otherwise unknown.
- Minimal DTO: `sourceIdentity: { source_type: 'workspace' | 'feishu' | 'qq' | 'wechat' | 'hermes_session' | 'manual'; source_id: string; channel: string | null; display_name: string | null; origin_reference: string; received_at: string }`.
- Read/Write: read, batched with each canonical task.
- Authority: Control / source adapter projected by WorkBridge.
- Security: opaque identifiers only; no provider token, raw message body, cookie, or Desktop credential.

## 2. `ingestEvents`

- Need: append-only intake and extraction history.
- Why: current facts cannot prove when extraction, normalization, project assignment, or merge occurred.
- Minimal DTO: `ingestEvents: Array<{ event_id; work_id; type: 'received' | 'extracted' | 'assigned' | 'merged'; occurred_at; actor; source_reference; revision }>`.
- Read/Write: read-only to Desktop; server appends.
- Authority: Control.
- Security: immutable client view; source payload remains outside the event DTO.

## 3. `duplicateEvidence`

- Need: server-supported duplicate classification and evidence.
- Why: V1-S3 safely identifies only identical WORK-ID or exact source references; title similarity is intentionally prohibited.
- Minimal DTO: `duplicateEvidence: { work_id; state: 'possible' | 'merged' | 'independent' | 'unknown'; related_work_ids: string[]; evidence: Array<{ kind: 'same_source_reference' | 'manual_review'; reference: string }>; revision }`.
- Read/Write: read.
- Authority: Control.
- Security: evidence uses canonical IDs/references, not message bodies or embeddings.

## 4. `mergeMutation`

- Need: explicit, idempotent duplicate merge.
- Why: Desktop cannot safely choose the survivor, move references, or preserve audit history through a generic patch.
- Minimal DTO: `POST /workspace/intake/merge { survivor_work_id; merged_work_id; expected_revisions; client_request_id; reason } -> { survivor; duplicateEvidence; ingestEvents }`.
- Read/Write: typed write followed by canonical snapshot refetch.
- Authority: Control.
- Security: server validates both WORK-IDs, legal state, authorization, and idempotency; Renderer receives no bearer.

## 5. `workScope`

- Need: authoritative per-source intake allowlist and scope state.
- Why: browser storage or Desktop preferences must not become work-admission policy.
- Minimal DTO: `workScope: Array<{ source_type; scope_id; state: 'enabled' | 'disabled' | 'approval_required'; label; updated_at; revision }>` plus typed mutation using `expected_revision` and `client_request_id`.
- Read/Write: read and privileged typed write.
- Authority: Control.
- Security: no source credentials in DTO; policy changes require explicit human authorization and server audit.

## 6. `notificationReadModel`

- Need: recent and pending notification facts.
- Why: task status cannot prove that a notification was queued, delivered, failed, or acknowledged.
- Minimal DTO: `notifications: Array<{ notification_id; work_id; channel; reason; approval_state; delivery_state; created_at; delivered_at; message_reference }>`.
- Read/Write: read, batched in the Workspace snapshot.
- Authority: Control / notification service.
- Security: message reference is opaque; no access token or complete private message text.

## 7. `notificationMutation`

- Need: explicit approve/cancel/retry actions if notification control is later released.
- Why: Desktop must not infer permission or send directly through Feishu, QQ, or WeChat.
- Minimal DTO: typed actions `{ notification_id; action: 'approve' | 'cancel' | 'retry'; expected_revision; client_request_id }`.
- Read/Write: typed write followed by canonical refetch.
- Authority: Control / notification service.
- Security: server enforces channel permission and rate limit; Desktop never receives bot credentials.

## 8. `sourceHealth`

- Need: canonical per-source connection health.
- Why: receiving an old task does not prove a channel is online; Desktop must not actively ping providers or inspect secrets.
- Minimal DTO: `sourceHealth: Array<{ source_type; state: 'connected' | 'unavailable' | 'unknown'; last_seen_at; error_code; scope_label; checked_at }>`.
- Read/Write: read.
- Authority: the owning source adapter projected through Control.
- Security: sanitized error codes only; no endpoint ticket, token, secret, cookie, or raw provider response.

## Existing task triage gaps

The current typed task transport supports create, edit (including project and next action), defer, and complete. Archive, material-missing, and decision-required mutations are intentionally disabled until named typed actions with revision checks, idempotency, canonical results, and snapshot refetch exist. A generic JSON editor or generic patch is not an acceptable substitute.
