import { Button } from '@hermes/plugin-sdk'

import type { Deliverable, ProductionGateState, ProductionReview, Task } from './domain'
import { ProductionActionPanel } from './production-actions'
import { ProductionHistory } from './production-history'
import type { WorkspaceProductionActionTransport } from './service-production-actions'
import type { ProductionReviewItem } from './service-production-review'

const GATE_LABELS: Readonly<Record<ProductionGateState, string>> = {
  INPUT_REQUIRED: '需要输入（INPUT_REQUIRED）',
  MATERIAL_MISSING: '资料缺失（MATERIAL_MISSING）',
  DECISION_REQUIRED: '需要决策（DECISION_REQUIRED）',
  WAITING_HUMAN_APPROVAL: '等待人工批准（WAITING_HUMAN_APPROVAL）',
  APPROVED_SCOPE: 'Scope 已批准（APPROVED_SCOPE）',
  READY_FOR_PRODUCTION: '可进入生产（READY_FOR_PRODUCTION）',
  REVISION_REQUIRED: '需要修订（REVISION_REQUIRED）',
  DELIVERED: '已交付（DELIVERED）',
  WAITING_ACCEPTANCE: '等待验收（WAITING_ACCEPTANCE）',
  ACCEPTED: '已验收（ACCEPTED）'
}

const PRODUCTION_STATUS_LABELS: Readonly<Record<ProductionGateState, string>> = {
  INPUT_REQUIRED: '等待输入',
  MATERIAL_MISSING: 'Gate 阻塞',
  DECISION_REQUIRED: 'Gate 阻塞',
  WAITING_HUMAN_APPROVAL: '等待人工批准',
  APPROVED_SCOPE: 'Scope 已批准',
  READY_FOR_PRODUCTION: '已获准生产',
  REVISION_REQUIRED: '等待修订',
  DELIVERED: '已交付',
  WAITING_ACCEPTANCE: '待人工验收',
  ACCEPTED: '已验收'
}

const WORKBRIDGE_LABELS: Readonly<Record<Task['workBridgeState'], string>> = {
  archived: '已归档',
  claimed: '已领取',
  completed: '已完成',
  failed: '失败',
  not_applicable: '不适用',
  processing: '处理中',
  review: '待验收',
  unknown: '未知',
  waiting: '等待本机'
}

const DELIVERED_GATES = new Set<ProductionGateState>(['DELIVERED', 'WAITING_ACCEPTANCE', 'ACCEPTED'])

function value(text: null | string): string {
  return text ?? '未设置 / 等待输入'
}

function dateValue(text: null | string): string {
  if (!text) {
    return '未设置 / 等待输入'
  }

  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeZone: 'Asia/Shanghai' }).format(new Date(text))
}

function listValue(items: readonly string[] | null): string {
  if (items === null) {
    return '未设置 / 等待输入'
  }

  return items.length ? items.join('；') : '无'
}

function decisionValue(review: ProductionReview | null): string {
  if (review?.decisionRequired === true) {
    return '需要决策'
  }

  if (review?.decisionRequired === false) {
    return '无'
  }

  return '未设置 / 等待输入'
}

function latestReviewComment(review: ProductionReview | null): string | null {
  if (!review) {
    return null
  }

  return (
    [...review.events].reverse().find(event => event.reviewerComment)?.reviewerComment ??
    review.acceptance?.reviewerComment ??
    null
  )
}

function deliveryBadge(review: ProductionReview | null): string {
  return review && DELIVERED_GATES.has(review.gateState) ? '已交付' : '待交付'
}

function acceptanceBadge(review: ProductionReview | null): string {
  if (review?.gateState === 'ACCEPTED') {
    return '已验收'
  }

  if (review?.gateState === 'WAITING_ACCEPTANCE') {
    return '待人工验收'
  }

  if (review?.gateState === 'REVISION_REQUIRED') {
    return '需要修订'
  }

  return '验收状态未设置'
}

function fileState(deliverables: readonly Deliverable[], select: (deliverable: Deliverable) => string): string {
  if (!deliverables.length) {
    return '未设置 / 等待输入'
  }

  return [...new Set(deliverables.map(select))].join('、')
}

function ReviewFact({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <dt className="text-[0.6875rem] text-(--ui-text-quaternary)">{label}</dt>
      <dd className="mt-1 break-words text-xs text-(--ui-text-secondary)">{children}</dd>
    </div>
  )
}

export function ProductionReviewCard({
  item,
  onOpenLocal,
  onRefresh,
  transport
}: {
  item: ProductionReviewItem
  onOpenLocal: (workId: string) => void
  onRefresh: () => Promise<unknown>
  transport: WorkspaceProductionActionTransport
}) {
  const { deliverables, producer, project, provenance, review, task } = item
  const gate = review ? GATE_LABELS[review.gateState] : '未设置 / 等待输入'
  const scopeVersion = review?.approvedScope ? `v${review.approvedScope.version}` : '未设置 / 等待输入'
  const finalVersion = review?.gateState === 'ACCEPTED' ? review.manifestVersion : null

  return (
    <article className="rounded-lg border border-(--ui-stroke-quaternary) p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium">{task.title}</h3>
          <p className="mt-1 text-[0.6875rem] text-(--ui-text-quaternary)">{task.id}</p>
        </div>
        <div className="flex flex-wrap gap-1 text-[0.6875rem] text-(--ui-text-tertiary)">
          <span className="rounded-full border border-(--ui-stroke-quaternary) px-2 py-1">
            {deliverables.length ? '已提交' : '未提交'}
          </span>
          <span className="rounded-full border border-(--ui-stroke-quaternary) px-2 py-1">{deliveryBadge(review)}</span>
          <span className="rounded-full border border-(--ui-stroke-quaternary) px-2 py-1">
            {acceptanceBadge(review)}
          </span>
        </div>
      </div>

      {!review && (
        <p className="mt-3 rounded-md bg-foreground/4 px-3 py-2 text-xs text-(--ui-text-tertiary)">
          尚无 WorkBridge ProductionReadModel；权威生产字段保持未设置 / 等待输入。
        </p>
      )}

      <dl className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
        <ReviewFact label="所属项目">{project.name}</ReviewFact>
        <ReviewFact label="Deliverable title">{task.title}</ReviewFact>
        <ReviewFact label="Producer">{value(producer)}</ReviewFact>
        <ReviewFact label="Provenance">{value(provenance)}</ReviewFact>
        <ReviewFact label="当前 Gate">{gate}</ReviewFact>
        <ReviewFact label="Gate 权威">{review ? 'WorkBridge' : '未设置 / 等待输入'}</ReviewFact>
        <ReviewFact label="Production 状态">
          {review ? PRODUCTION_STATUS_LABELS[review.gateState] : '未设置 / 等待输入'}
        </ReviewFact>
        <ReviewFact label="Task 状态">{value(task.statusLabel)}</ReviewFact>
        <ReviewFact label="DDL">{dateValue(task.deadline)}</ReviewFact>
        <ReviewFact label="当前执行者">{value(task.executor)}</ReviewFact>
        <ReviewFact label="下一步">{value(task.nextAction)}</ReviewFact>
        <ReviewFact label="缺失资料">{listValue(review?.missingInformation ?? null)}</ReviewFact>
        <ReviewFact label="需要决策">{decisionValue(review)}</ReviewFact>
        <ReviewFact label="WorkBridge 状态">{WORKBRIDGE_LABELS[task.workBridgeState]}</ReviewFact>
        <ReviewFact label="Approved Scope version">{scopeVersion}</ReviewFact>
        <ReviewFact label="Approved Scope items">{listValue(review?.approvedScope?.items ?? null)}</ReviewFact>
        <ReviewFact label="Scope 历史">
          {review ? `${review.scopeHistory.length} 个版本` : '未设置 / 等待输入'}
        </ReviewFact>
        <ReviewFact label="Mousai 验收意见">{value(latestReviewComment(review))}</ReviewFact>
        <ReviewFact label="Revision">
          {review?.revision === null || !review ? '未设置 / 等待输入' : `r${review.revision}`}
        </ReviewFact>
        <ReviewFact label="最终版本">{value(finalVersion)}</ReviewFact>
        <ReviewFact label="Skill candidate 状态">未设置 / 等待输入</ReviewFact>
        <ReviewFact label="验收结果">{value(review?.acceptance?.verdict ?? null)}</ReviewFact>
        <ReviewFact label="Submission 状态">
          {fileState(deliverables, deliverable => deliverable.submissionState)}
        </ReviewFact>
        <ReviewFact label="Delivery 状态">
          {fileState(deliverables, deliverable => deliverable.deliveryState)}
        </ReviewFact>
        <ReviewFact label="Acceptance 状态">{acceptanceBadge(review)}</ReviewFact>
        <ReviewFact label="Gate 事件">{review ? `${review.events.length} 条` : '未设置 / 等待输入'}</ReviewFact>
      </dl>

      <div className="mt-4 border-t border-(--ui-stroke-quaternary) pt-3">
        {deliverables.length ? (
          <div className="space-y-2">
            {deliverables.map(deliverable => (
              <div className="text-[0.6875rem] text-(--ui-text-quaternary)" key={deliverable.id}>
                <div>
                  Manifest：{deliverable.filename} · {deliverable.sizeBytes} bytes · {deliverable.extension} · version{' '}
                  {value(review?.manifestVersion ?? null)}
                </div>
                <div className="mt-1 break-all">SHA256：{deliverable.sha256}</div>
              </div>
            ))}
            <Button onClick={() => onOpenLocal(task.id)} size="sm" type="button" variant="outline">
              打开本地产物
            </Button>
          </div>
        ) : (
          <p className="text-xs text-(--ui-text-tertiary)">Manifest 未设置 / 等待输入。</p>
        )}
      </div>

      <div className="mt-4 border-t border-(--ui-stroke-quaternary) pt-3">
        <div className="mb-2 text-[0.6875rem] text-(--ui-text-quaternary)">Revision / Acceptance History</div>
        <ProductionHistory review={review} />
      </div>

      <ProductionActionPanel item={item} onRefresh={onRefresh} transport={transport} />
    </article>
  )
}
