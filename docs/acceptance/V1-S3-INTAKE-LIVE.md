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

- Workspace integration: 31 test files / 194 tests PASS.
- Desktop TypeScript checks (renderer, Electron and e2e configs): PASS.
- Intake-focused lint: PASS with zero errors; changed files are formatted and `git diff --check` is clean.
- Production Desktop build: PASS. Windows pack was intentionally not run.
- Hermes plugin tests in the production Python environment: 22 tests PASS.
- Live canonical snapshot: two isolated Intake probe records, two merged evidence records and one merged event were read through the deployed plugin; configured-secret and raw-message-field hits were 0.
- Live triage probe `WORK-20260830-006`: material-missing and archive actions both passed reentrant/idempotent checks; the record was archived after the test.
- The first triage probe exposed a `WrongTableId` integration defect. The final implementation now uses the plugin's already resolved canonical task table, explicit allowlisted fields and authoritative readback; the failed probe record was also archived.
- WorkBridge, Hermes Desktop backend, Hermes Gateway and Caddy remained active. WorkBridge and Desktop backend remain loopback-only.
- Available RAM was stable at 1147 MiB across two samples; swap stayed at 873 MiB with `si/so=0`; kernel OOM hits were 0.
- Production journal full-secret hits: 0. Tracked-file full-secret hits across both repositories: 0.
