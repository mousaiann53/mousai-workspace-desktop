const WORK_ID = /^[A-Z][A-Z0-9-]{5,63}$/
const OUTBOX_ROOT = 'H:\\MousaiWork\\outbox'

export interface LocalDeliverableAccess {
  revealOutbox(workId: string): Promise<boolean>
}

export function localOutboxPath(workId: string): string {
  if (!WORK_ID.test(workId)) {
    throw new Error('invalid_work_id')
  }

  return `${OUTBOX_ROOT}\\${workId}`
}

export function createLocalDeliverableAccess(revealPath: (path: string) => Promise<boolean>): LocalDeliverableAccess {
  return Object.freeze({
    revealOutbox(workId: string) {
      return revealPath(localOutboxPath(workId))
    }
  })
}
