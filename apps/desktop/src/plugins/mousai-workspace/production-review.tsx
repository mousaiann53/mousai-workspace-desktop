import { Button } from '@hermes/plugin-sdk'

import type { ProductionGateState, Task } from './domain'
import type { ProductionReviewItem } from './service-production-review'

const GATE_LABELS: Readonly<Record<ProductionGateState, string>> = {
  blocked: '阻塞',
  in_production: '生产中',
  pending_review: '待人工验收',
  ready_for_production: '可进入生产',
  unknown: '未设置'
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
  onOpenLocal
}: {
  item: ProductionReviewItem
  onOpenLocal: (workId: string) => void
}) {
  const { deliverable, project, review, task } = item

  const scope =
    review?.scopeApproved === true
      ? value(review.approvedScopeVersion)
      : review?.scopeApproved === false
        ? '未批准'
        : '未设置 / 等待输入'

  const gate = review ? GATE_LABELS[review.gateState] : '等待 Control / WorkBridge'

  return (
    <article className="rounded-lg border border-(--ui-stroke-quaternary) p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium">{deliverable.filename}</h3>
          <p className="mt-1 text-[0.6875rem] text-(--ui-text-quaternary)">{deliverable.workId}</p>
        </div>
        <div className="flex flex-wrap gap-1 text-[0.6875rem] text-(--ui-text-tertiary)">
          <span className="rounded-full border border-(--ui-stroke-quaternary) px-2 py-1">已提交</span>
          <span className="rounded-full border border-(--ui-stroke-quaternary) px-2 py-1">
            {deliverable.deliveryState === 'delivered' ? '已交付' : '待交付'}
          </span>
          <span className="rounded-full border border-(--ui-stroke-quaternary) px-2 py-1">
            {deliverable.reviewState === 'pending'
              ? '待人工验收'
              : deliverable.reviewState === 'approved'
                ? '已验收'
                : '验收状态未设置'}
          </span>
        </div>
      </div>

      {!review && (
        <p className="mt-3 rounded-md bg-foreground/4 px-3 py-2 text-xs text-(--ui-text-tertiary)">
          尚无 Control / WorkBridge production record；权威生产字段保持等待输入。
        </p>
      )}

      <dl className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
        <ReviewFact label="所属项目">{project.name}</ReviewFact>
        <ReviewFact label="当前 Gate">{gate}</ReviewFact>
        <ReviewFact label="Gate 权威">
          {review ? (review.authority === 'control' ? 'Control' : 'WorkBridge') : '未设置 / 等待输入'}
        </ReviewFact>
        <ReviewFact label="Production 状态">{value(review?.productionStatus ?? null)}</ReviewFact>
        <ReviewFact label="DDL">{dateValue(task?.deadline ?? null)}</ReviewFact>
        <ReviewFact label="当前执行者">{value(review?.currentExecutor ?? task?.executor ?? null)}</ReviewFact>
        <ReviewFact label="下一步">{value(task?.nextAction ?? null)}</ReviewFact>
        <ReviewFact label="缺失资料">{listValue(review?.missingInformation ?? null)}</ReviewFact>
        <ReviewFact label="需要决策">{listValue(review?.decisionsRequired ?? null)}</ReviewFact>
        <ReviewFact label="WorkBridge 状态">
          {task ? WORKBRIDGE_LABELS[task.workBridgeState] : '未设置 / 等待输入'}
        </ReviewFact>
        <ReviewFact label="Approved Scope version">{scope}</ReviewFact>
        <ReviewFact label="Mousai 验收意见">{value(review?.mousaiReviewComment ?? null)}</ReviewFact>
        <ReviewFact label="Revision">{value(review?.revision ?? null)}</ReviewFact>
        <ReviewFact label="最终版本">{value(review?.finalVersion ?? null)}</ReviewFact>
        <ReviewFact label="Skill candidate 状态">{value(review?.skillCandidateStatus ?? null)}</ReviewFact>
      </dl>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-(--ui-stroke-quaternary) pt-3">
        <div className="min-w-0 text-[0.6875rem] text-(--ui-text-quaternary)">
          <div>
            Manifest：{deliverable.sizeBytes} bytes · {deliverable.extension}
          </div>
          <div className="mt-1 break-all">SHA256：{deliverable.sha256}</div>
        </div>
        <Button onClick={() => onOpenLocal(deliverable.workId)} size="sm" type="button" variant="outline">
          打开本地产物
        </Button>
      </div>
    </article>
  )
}
