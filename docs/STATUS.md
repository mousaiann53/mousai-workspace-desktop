# Mousai Workspace Desktop status

Updated: 2026-08-29  
Active branch: `feature/v1-s2-planning-foundation`

## Milestones

| Milestone                       | Status                   | Evidence                                                                                                                                                                     |
| ------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1-S1 M1 Desktop baseline       | PASS                     | Official Hermes Desktop build, Remote Gateway, Sessions, Bots, chat, Tool Calling, preview, and restart baseline accepted.                                                   |
| V1-S1 M2-A Persona + i18n       | PASS                     | 乙木, 司木 Moss, 溯光菌, and official `zh` baseline accepted.                                                                                                                |
| V1-S1 M2-B Workspace shell      | PASS                     | Mousai identity, Editorial Blue shell, plugin seam, and Windows branding accepted.                                                                                           |
| V1-S1 M3 Project module         | PASS                     | Project Gallery, detail, task center/mutations, canonical production review, and stable deep links accepted by GPT/PM.                                                       |
| V1-S1 M4–M10 content production | NOT CLAIMED              | Desktop product surfaces are implemented; real course/work deliverables remain subject to their own production and Mousai acceptance.                                        |
| V1-S2 Planning foundation       | COMPLETE / CONTRACT HOLD | Todo, Agenda, timeline, capacity, deterministic preview, review, night safety, history, and small-window surfaces are built. Live schedule writes await canonical contracts. |

This repository records Desktop engineering status only. It does not promote a course artifact or a WorkBuddy run to PASS.

## Canonical contract

- Authority: WorkBridge through the Hermes plugin API.
- Contract: OpenAPI 1.6, canonical `ProductionReadModel[]` included in the Workspace snapshot.
- Renderer transport: official `ctx.rest`; credentials remain in the Hermes host.
- Local deliverable access: official `ctx.os.revealPath`, restricted by the typed adapter to `H:\\MousaiWork\\outbox\\<WORK-ID>`.
- Mutation result: canonical server result followed by snapshot refetch; no optimistic production fact.

## Available Desktop capability

- Real-data Dashboard: today, upcoming DDL, waiting review, missing material, decision required, waiting-local, active production, recent delivery/completion.
- Project Gallery and Project Detail with task inspection and bounded task mutations.
- Deliverable / Production Center with true gate, scope, revision, manifest, delivery, acceptance, producer/provenance, and Skill-candidate evidence.
- Explicit production actions: prepare, human scope approval, separate start, revision request, and final acceptance, all gate-driven.
- Append-only scope/revision/acceptance history from canonical events.
- Metadata comparison model for changed, unchanged, added, and removed artifact files.
- Resource and Archive views built only from the canonical snapshot.
- Stable project/task/deliverable/history/skill deep links with honest not-found states.
- Six-view Todo Center, Shanghai-time Agenda, Daily Timeline, deterministic capacity/scheduling preview, after-work brief, Night Safety, and Planning History.

## Current blocker

Planning is read-only where canonical contracts are absent. Live schedule acceptance requires schedule blocks, fixed events, dependencies, planning history, night-safety evidence, and typed schedule mutations. Previous-revision artifact comparison still requires historical Manifest metadata. Desktop intentionally shows these facts as unavailable and does not infer them.

## Post-V1 candidates

- Office-body semantic diff after an approved data-access design.
- A separate “搁置” schema state; V1 continues to use the accepted `已归档` semantics.
- Richer Skill lifecycle automation after enough accepted real runs exist.
- Production-grade Remote Gateway authentication/tunnel packaging beyond the M1 workaround.
