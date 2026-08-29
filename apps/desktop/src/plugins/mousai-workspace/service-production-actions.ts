import type { ProductionApprovedScope, ProductionBundleMeta, ProductionGateState, ProductionReview } from './domain'

export type ProductionAction = 'accept' | 'prepare' | 'revision' | 'scope' | 'start'

export interface ProductionActionCapability {
  readonly accept: boolean
  readonly prepare: boolean
  readonly revision: boolean
  readonly scope: boolean
  readonly start: boolean
}

export interface ProductionActionResult {
  readonly action: ProductionAction
  readonly production: ProductionReview
}

export interface WorkspaceProductionActionTransport {
  acceptProduction(
    workId: string,
    request: { readonly actor: string; readonly verdict: string; readonly comment: string | null }
  ): Promise<ProductionActionResult>
  approveProductionScope(
    workId: string,
    request: {
      readonly actor: string
      readonly approvedScope: ProductionApprovedScope
      readonly bundleMeta: ProductionBundleMeta
    }
  ): Promise<ProductionActionResult>
  prepareProduction(
    workId: string,
    request: { readonly actor: string; readonly bundleMeta: ProductionBundleMeta }
  ): Promise<ProductionActionResult>
  requestProductionRevision(
    workId: string,
    request: {
      readonly actor: string
      readonly revision: number
      readonly reason: string
      readonly reviewerComment: string
    }
  ): Promise<ProductionActionResult>
  startProduction(workId: string, request: { readonly actor: string }): Promise<ProductionActionResult>
}

export class ProductionActionError extends Error {
  constructor(
    message: string,
    readonly statusCode: number | null,
    readonly code: string
  ) {
    super(message)
    this.name = 'ProductionActionError'
  }
}

const PREPARE_GATES = new Set<ProductionGateState>([
  'INPUT_REQUIRED',
  'MATERIAL_MISSING',
  'DECISION_REQUIRED',
  'WAITING_HUMAN_APPROVAL'
])

export function productionActionCapability(review: ProductionReview | null): ProductionActionCapability {
  const gate = review?.gateState ?? null

  return {
    prepare: gate === null || PREPARE_GATES.has(gate),
    scope: gate === 'WAITING_HUMAN_APPROVAL' || gate === 'APPROVED_SCOPE' || gate === 'REVISION_REQUIRED',
    start: gate === 'APPROVED_SCOPE' || gate === 'REVISION_REQUIRED',
    revision: gate === 'WAITING_ACCEPTANCE',
    accept: gate === 'WAITING_ACCEPTANCE'
  }
}

function canonicalScopeJson(scope: Omit<ProductionApprovedScope, 'scopeHash'>): string {
  return JSON.stringify({
    approved_at: scope.approvedAt,
    approved_by: scope.approvedBy,
    items: scope.items,
    scope_id: scope.scopeId,
    version: scope.version
  })
}

export async function issueProductionScope(input: {
  readonly workId: string
  readonly version: number
  readonly items: readonly string[]
  readonly approvedBy: string
  readonly approvedAt: string
  readonly existingScopeId: string | null
}): Promise<ProductionApprovedScope> {
  const items = input.items.map(item => item.trim()).filter(Boolean)
  const scopeId = input.existingScopeId ?? `${input.workId}:scope`

  if (!scopeId || !Number.isInteger(input.version) || input.version < 1 || !items.length || !input.approvedBy.trim()) {
    throw new ProductionActionError('Approved scope fields are incomplete.', null, 'invalid_scope')
  }

  const scope = {
    scopeId,
    version: input.version,
    items,
    approvedBy: input.approvedBy.trim(),
    approvedAt: input.approvedAt
  }

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalScopeJson(scope)))
  const scopeHash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')

  return { ...scope, scopeHash }
}
