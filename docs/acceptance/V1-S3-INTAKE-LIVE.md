# V1-S3 Intake Core + Desktop Live — engineering record

Status: engineering integration complete after production smoke; overall V1-S3 product acceptance remains with GPT/PM.

## Integration baseline

- Planning Live HEAD `a08b92d135727c1e083b0a9689e5cb9646d41dd6` already contains Intake Foundation HEAD `a0ebf0b98f76daa49c0feb9610faf95ff4ffd3d0` as an ancestor.
- `feature/v1-s3-intake-live` therefore starts at the accepted Planning Live HEAD without reset, main merge, or duplicate cherry-pick.
- Planning routes, adapters, UI and tests remain present.

## Live behavior

- The one authenticated plugin snapshot now carries source identity, ingest events, duplicate evidence and work scope alongside tasks, projects, manifests, production and planning.
- Source audit renders real append-only events and leaves absent history empty.
- Duplicate candidates appear only when canonical evidence says `possible`; the confirmation surface names survivor, merged task, reason and impact.
- Merge requires both canonical Intake revisions and always refetches after success. No optimistic task fact is written.
- Work scope is a live typed policy surface. No scope is stored in browser/localStorage.
- Archive, material-missing and decision-required reuse existing typed Control task actions through the Hermes plugin boundary.
- Notification read/write and source health remain intentionally deferred.

## Security boundary

- Renderer Secret / provider credential / WorkBridge bearer / raw private message body: zero.
- Generic JSON patch, generic IPC, generic shell, arbitrary file access and new listener: zero.
- Desktop REST routes remain named and typed under the existing authenticated plugin namespace.
- No title similarity, embeddings or model judgment is used for duplicate classification.

## Validation

Targeted Intake tests, Workspace integration, complete Desktop typecheck/lint/format, production build, secret/IPC scan and real production engineering probe are recorded in the final branch report.
