# V1-S2 Planning live integration

Date: 2026-08-30

Mousai Workspace Desktop now consumes the Control-owned Planning Core through the existing authenticated Hermes plugin boundary.

## Canonical read model

- Task `estimated_duration_minutes`
- `scheduleBlocks`
- `fixedEvents`
- `planningProposals`
- append-only `planningEvents`

Accepted blocks appear in Agenda and the daily timeline. Missing facts remain unset.

## Explicit actions

- Submit a deterministic preview as a pending proposal
- Accept a pending proposal
- Adjust time with a required reason
- Ignore with a required reason

Registering a proposal never accepts it. Every command carries a durable client request ID, uses the server revision, returns a canonical DTO, and triggers a full snapshot refetch. The Renderer contains no WorkBridge bearer and no parallel planning store.

## Remaining boundaries

- Task dependencies remain a read-contract gap; Desktop does not infer them.
- No external Calendar provider is connected in this package.
- No generic patch, shell, IPC, or local file access was added.
