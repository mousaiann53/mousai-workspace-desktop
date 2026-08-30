# V1-S3 multi-source intake contract gaps

Date: 2026-08-30
Desktop branch: `feature/v1-s3-intake-live`

This document now lists only contracts that remain genuinely unavailable. Desktop uses the existing authenticated Hermes `ctx.rest` boundary; it has no WorkBridge bearer, source credential, generic patch, or second data store.

## Resolved in Intake Core + Live

- `sourceIdentity`: canonical, allowlisted source facts are attached to each task in the batched snapshot.
- `ingestEvents`: append-only server history is read-only in Desktop; missing historical events remain empty.
- `duplicateEvidence`: Desktop reads only server evidence (`same_source_reference` / `manual_review`) and does not infer duplicates from titles.
- `mergeMutation`: explicit survivor, two task revisions, reason, actor and durable request id; success is followed by snapshot refetch with no optimistic merge.
- `workScope`: canonical `enabled` / `disabled` / `approval_required` read/write with revision, request id, actor and server audit.
- Task triage: existing Control `archive` and `flag` actions (`material_missing` / `decision_required`) are exposed through the typed Hermes plugin route and followed by snapshot refetch.

## Remaining: notification read model

- Need: recent and pending notification facts.
- Minimal DTO: `notifications: Array<{ notification_id; work_id; channel; reason; approval_state; delivery_state; created_at; delivered_at; message_reference }>`.
- Authority: Control / notification service.
- Security: opaque message reference only; no private message body or channel credential.

## Remaining: notification mutation

- Need: explicit approve/cancel/retry actions if notification control is later released.
- Minimal DTO: typed `{ notification_id; action: 'approve' | 'cancel' | 'retry'; expected_revision; client_request_id }` followed by canonical refetch.
- Authority: Control / notification service. Desktop never sends directly through Feishu, QQ, or WeChat.

## Remaining: source health

- Need: canonical per-source connection health; old task receipt is not proof that a channel is online.
- Minimal DTO: `sourceHealth: Array<{ source_type; state; last_seen_at; error_code; scope_label; checked_at }>`.
- Authority: owning source adapter projected through Control.
- Security: sanitized error codes only; no endpoint ticket, token, secret, cookie, or raw provider response.

These three lower-priority contracts remain deferred to the Notification Router stage. Their UI continues to show honest unavailable/unknown states.
