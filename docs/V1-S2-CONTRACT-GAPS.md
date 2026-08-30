# V1-S2 Planning contract gaps

Date: 2026-08-30
Desktop branch: `feature/v1-s2-planning-live`

The V1-S2 Desktop foundation consumes the existing canonical Workspace snapshot through Hermes `ctx.rest`. It does not create a second database, use `localStorage` as truth, expose a bearer token to the Renderer, or add generic IPC/shell access.

Planning Core is now live through the canonical Workspace snapshot and typed Hermes plugin routes. The closed contracts are: `estimated_duration_minutes`, `scheduleBlocks`, `fixedEvents`, `planningProposals`, append-only `planningEvents`, and typed register/accept/adjust/ignore commands. Mutations return the canonical server result and are followed by a full snapshot refetch.

The remaining gaps below are intentionally recorded instead of being filled with inferred facts.

## Required read contracts

### Closed: estimated duration

- Need: an exact duration usable by capacity and scheduling rules.
- Why: the current `Task.estimate` is nullable free text. Desktop parses only explicit values such as `45m` or `1.5小时` and otherwise reports “未估算”.
- Minimal DTO: `estimated_duration_minutes: number | null` on the canonical task read model.
- Direction: read.
- Authority: WorkData / Control, projected in the Workspace snapshot.
- Security: scalar task fact only; no credential or local path.

### Closed: schedule blocks

- Need: occupied and accepted time blocks.
- Why: available capacity and collision-free proposals cannot be computed from DDL alone.
- Minimal DTO:

```ts
interface ScheduleBlockReadModel {
  block_id: string
  work_id: string | null
  starts_at: string
  ends_at: string
  executor: string | null
  kind: 'task' | 'fixed_event' | 'hold'
  revision: string
}
```

- Direction: read, batched in `workspace snapshot.scheduleBlocks`.
- Authority: Control / WorkBridge.
- Security: no per-task N+1 read; no Renderer bearer.

### Closed: fixed events

- Need: meetings, classes, appointments, and other immovable time facts.
- Why: the domain has `Event`, but the current transport does not supply or adapt a canonical event collection.
- Minimal DTO:

```ts
interface FixedEventReadModel {
  event_id: string
  title: string
  project_id: string | null
  starts_at: string
  ends_at: string
  source: string
  revision: string
}
```

- Direction: read, batched in the Workspace snapshot.
- Authority: the approved calendar/work source through Control.
- Security: no Calendar provider credential in Desktop; no broad calendar write permission.

### 4. Task dependencies

- Need: explicit predecessor relations and blocker state.
- Why: deterministic scheduling must not order dependent work from titles or model knowledge.
- Minimal DTO: `taskDependencies: Array<{ work_id: string; depends_on_work_id: string; type: 'finish_to_start'; revision: string }>`.
- Direction: read.
- Authority: WorkData / Control.
- Security: identifiers only; validate both WORK-IDs server-side.

### Closed: planning history

- Need: original DDL, accepted schedule revisions, reschedule count, decision actor/time, and actual completion time.
- Why: `Task.updatedAt` is not a completion timestamp and must not be presented as one. Production `ACCEPTED` events are used only where they exist.
- Minimal DTO:

```ts
interface PlanningEventReadModel {
  event_id: string
  work_id: string
  type:
    'deadline_set' | 'deadline_changed' | 'schedule_accepted' | 'schedule_adjusted' | 'schedule_ignored' | 'completed'
  occurred_at: string
  actor: string
  previous_value: string | null
  next_value: string | null
  revision: string
}
```

- Direction: read, append-only.
- Authority: Control / WorkBridge.
- Security: clients cannot edit history; server records mutation actor and idempotency key.

### 6. Night-safety evidence

- Need: explicit low-risk, reversible, prohibited-operation, approval, and expected-output evidence.
- Why: absence of evidence must classify a task as `HUMAN_REQUIRED`, never `AUTO_OK`.
- Minimal DTO: `night_safety: { low_risk: boolean | null; reversible: boolean | null; prohibited: boolean | null; requires_human_approval: boolean; assessed_by: string | null; assessed_at: string | null }`.
- Direction: read; assessment write is a separate future human-approved mutation.
- Authority: Control.
- Security: server-side policy remains authoritative; Desktop classification cannot bypass it.

### 7. Cost and completion-window facts

- Need: approved execution window and optional budget/cost ceiling for after-work plans.
- Why: Desktop currently shows both as “未设置” instead of estimating spend or completion time.
- Minimal DTO: `execution_plan: { earliest_start: string | null; latest_finish: string | null; cost_limit: number | null; cost_currency: string | null }`.
- Direction: read.
- Authority: Control / WorkBridge.
- Security: no provider billing credential or raw usage token in the snapshot.

### 8. Previous-revision manifests

- Need: file metadata for at least the immediately previous accepted revision.
- Why: metadata comparison exists, but the current snapshot exposes only the current Manifest.
- Minimal DTO: `artifactRevisions: Array<{ work_id; revision; scope_version; manifest_version; producer; acceptance; files[] }>` using the existing manifest file schema.
- Direction: read, batched.
- Authority: WorkBridge.
- Security: metadata only; no file body and no arbitrary local path.

## Required write contract

### Closed: typed schedule mutation

- Need: explicit accept, adjust, and ignore actions for a server-issued proposal.
- Why: the Desktop preview cannot become canonical through local state or a generic patch endpoint.
- Minimal commands:

```ts
acceptPlanningProposal({ proposal_id, expected_revision, client_request_id })
adjustPlanningProposal({ proposal_id, expected_revision, client_request_id, starts_at, ends_at, reason })
ignorePlanningProposal({ proposal_id, expected_revision, client_request_id, reason })
```

- Direction: write followed by canonical result and full snapshot refetch.
- Authority: Control / WorkBridge.
- Security: typed allowlist, authenticated Hermes host boundary, idempotency, optimistic-concurrency check, 409 on stale/illegal transition, no generic JSON editor.

## Optional post-V1 schema candidate

### 10. Independent shelved state

- Current rule: “搁置” UI maps only to the accepted `已归档` state.
- Candidate: add a distinct canonical task state only after product and schema approval.
- Direction: future read/write.
- Authority: WorkData / Control.
- Security: schema migration and state-transition audit required; Desktop must not create the enum first.

## Desktop behavior for remaining gaps

- Capacity and occupied time use canonical Planning Core blocks; no local calendar truth is stored.
- A deterministic preview must first be submitted as a pending canonical proposal. Accept remains a separate, explicit human action.
- Adjust and Ignore require a reason; stale or illegal transitions preserve the server's 409 error and never fake success.
- Night automation defaults to `HUMAN_REQUIRED` or `BLOCKED`; missing evidence never becomes approval.
- Original DDL, reschedule count, actual completion, execution window, and cost remain “未设置” unless canonical events provide them.
