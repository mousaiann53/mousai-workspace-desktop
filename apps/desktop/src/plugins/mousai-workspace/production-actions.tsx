import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea
} from '@hermes/plugin-sdk'
import { useEffect, useMemo, useState } from 'react'

import type { ProductionBundleMeta, ProductionGateState, ProductionJsonValue } from './domain'
import {
  issueProductionScope,
  type ProductionAction,
  productionActionCapability,
  ProductionActionError,
  type WorkspaceProductionActionTransport
} from './service-production-actions'
import type { ProductionReviewItem } from './service-production-review'

const ACTION_LABELS: Readonly<Record<ProductionAction, string>> = {
  prepare: '提交待人工审批',
  scope: '批准范围',
  start: '开始生产',
  revision: '要求修订',
  accept: '最终通过'
}

const ACTION_IMPACTS: Readonly<Record<ProductionAction, string>> = {
  prepare: '保存受控生产元数据并重新计算前置 Gate；不会批准 Scope，也不会启动生产。',
  scope: '批准下方完整 Scope items；批准完成后仍需另行点击“开始生产”。',
  start: '按当前已批准 Scope 启动生产；不会扩大或改写批准范围。',
  revision: '把当前待验收交付退回修订，并保存 Revision reason 与 Mousai 审阅意见。',
  accept: '保存本次人工验收 metadata，并把当前交付推进到最终通过。'
}

const GATE_GUIDANCE: Readonly<Record<ProductionGateState, string>> = {
  INPUT_REQUIRED: '需要先补齐受控生产输入；当前仅可提交更新后的前置 metadata。',
  MATERIAL_MISSING: '资料缺失阻塞生产；当前仅可补充缺失资料并重新提交，不能批准范围或启动生产。',
  DECISION_REQUIRED: '等待 Mousai 明确决策；当前仅可提交澄清后的前置 metadata，不能推进生产。',
  WAITING_HUMAN_APPROVAL: '等待 Mousai 审批完整 Scope；批准范围不会自动开始生产。',
  APPROVED_SCOPE: 'Scope 已由人工批准；如确认进入生产，需要单独执行“开始生产”。',
  READY_FOR_PRODUCTION: '生产已启动或正在等待执行；此处不重复审批或启动。',
  REVISION_REQUIRED: '已要求修订；当前 canonical read model 未开放新的 Desktop 推进动作。',
  DELIVERED: '交付已登记；等待 canonical gate 进入人工验收。',
  WAITING_ACCEPTANCE: '等待 Mousai 人工验收；可要求修订或最终通过。',
  ACCEPTED: '已最终验收，记录为只读。'
}

const ERROR_GUIDANCE: Readonly<Record<number, string>> = {
  400: '请求内容无效，请检查必填项。',
  401: '当前 Desktop 会话未通过认证，请重新连接 Gateway。',
  404: '权威生产记录不存在，请刷新 Workspace。',
  409: 'Gate 已变化或动作不再合法，请刷新后按最新状态重试。',
  502: 'Gateway 暂时无法连接 WorkBridge。',
  503: '生产服务暂时不可用，请稍后重试。'
}

function lines(value: string): readonly string[] {
  return value
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean)
}

function displayJsonItem(value: ProductionJsonValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function dateInput(value: string | null): string {
  return value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? ''
}

export function productionActionErrorMessage(error: unknown): string {
  if (error instanceof ProductionActionError) {
    const status = error.statusCode === null ? '' : `${error.statusCode} `
    const guidance = error.statusCode === null ? '' : ERROR_GUIDANCE[error.statusCode]

    return [guidance, `${status}${error.code}: ${error.message}`].filter(Boolean).join(' ')
  }

  return error instanceof Error ? error.message : 'Production action failed.'
}

function SummaryFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.6875rem] text-(--ui-text-quaternary)">{label}</dt>
      <dd className="mt-1 break-words text-xs text-(--ui-text-secondary)">{value}</dd>
    </div>
  )
}

export function ProductionActionPanel({
  item,
  onRefresh,
  transport
}: {
  item: ProductionReviewItem
  onRefresh: () => Promise<unknown>
  transport: WorkspaceProductionActionTransport
}) {
  const { review, task } = item
  const capability = productionActionCapability(review)
  const [action, setAction] = useState<ProductionAction | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [missingInformation, setMissingInformation] = useState('')
  const [decisionRequired, setDecisionRequired] = useState(false)
  const [inputSources, setInputSources] = useState('')
  const [outputFormats, setOutputFormats] = useState('')
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [scopeItems, setScopeItems] = useState('')
  const [scopeVersion, setScopeVersion] = useState(1)
  const [revision, setRevision] = useState(2)
  const [revisionReason, setRevisionReason] = useState('')
  const [reviewerComment, setReviewerComment] = useState('')
  const [acceptanceVerdict, setAcceptanceVerdict] = useState('PASS')
  const [acceptanceComment, setAcceptanceComment] = useState('')

  useEffect(() => {
    const meta = review?.bundleMeta

    setMissingInformation((meta?.missingInformation ?? []).join('\n'))
    setDecisionRequired(meta?.decisionRequired ?? false)
    setInputSources((meta?.inputSources ?? []).map(displayJsonItem).join('\n'))
    setOutputFormats(
      Array.isArray(meta?.outputRequirements.formats)
        ? meta.outputRequirements.formats.map(displayJsonItem).join('\n')
        : ''
    )
    setAcceptanceCriteria((meta?.acceptanceCriteria ?? []).map(displayJsonItem).join('\n'))
    setDueDate(meta?.dueDate ?? dateInput(task.deadline))
    setScopeItems((review?.approvedScope?.items ?? []).join('\n'))
    setScopeVersion((review?.approvedScope?.version ?? 0) + 1)
    setRevision(Math.max((review?.revision ?? meta?.revision ?? 1) + 1, 2))
    setRevisionReason(meta?.revisionReason ?? '')
    setReviewerComment('')
    setAcceptanceVerdict(review?.acceptance?.verdict ?? 'PASS')
    setAcceptanceComment(review?.acceptance?.reviewerComment ?? '')
    setError(null)
    setSuccess(null)
  }, [review, task.deadline, task.id])

  const prepareMeta = useMemo<ProductionBundleMeta>(
    () => ({
      missingInformation: lines(missingInformation),
      decisionRequired,
      inputSources: lines(inputSources),
      outputRequirements: { formats: lines(outputFormats) },
      acceptanceCriteria: lines(acceptanceCriteria),
      deliverables: null,
      decisionNote: null,
      dueDate: dueDate || null,
      revision: review?.bundleMeta?.revision ?? 1,
      revisionReason: revisionReason.trim() || null
    }),
    [
      acceptanceCriteria,
      decisionRequired,
      dueDate,
      inputSources,
      missingInformation,
      outputFormats,
      review?.bundleMeta?.revision,
      revisionReason
    ]
  )

  const actionScopeItems = lines(scopeItems)
  const currentGate = review?.gateState ?? '未设置 / 等待输入'
  const currentScopeVersion = review?.approvedScope ? `v${review.approvedScope.version}` : '未设置 / 等待输入'
  const displayedScopeItems = action === 'scope' ? actionScopeItems : (review?.approvedScope?.items ?? [])
  const displayedRevisionReason = action === 'revision' ? revisionReason.trim() : review?.bundleMeta?.revisionReason

  const displayedAcceptance =
    action === 'accept'
      ? [acceptanceVerdict.trim(), acceptanceComment.trim()].filter(Boolean).join('；')
      : review?.acceptance
        ? [review.acceptance.verdict, review.acceptance.reviewerComment].filter(Boolean).join('；')
        : ''

  const canSubmit =
    action === 'prepare' ||
    action === 'start' ||
    (action === 'scope' && Boolean(review?.bundleMeta) && scopeVersion >= 1 && actionScopeItems.length > 0) ||
    (action === 'revision' && revision >= 2 && Boolean(revisionReason.trim()) && Boolean(reviewerComment.trim())) ||
    (action === 'accept' && Boolean(acceptanceVerdict.trim()) && Boolean(acceptanceComment.trim()))

  function openAction(next: ProductionAction) {
    setError(null)
    setSuccess(null)
    setAction(next)
  }

  async function submit() {
    if (!action || !canSubmit || pending) {
      return
    }

    setPending(true)
    setError(null)
    setSuccess(null)

    try {
      let result

      if (action === 'prepare') {
        result = await transport.prepareProduction(task.id, { actor: 'Mousai', bundleMeta: prepareMeta })
      } else if (action === 'scope') {
        if (!review?.bundleMeta) {
          throw new ProductionActionError('Prepared bundle metadata is unavailable.', null, 'bundle_meta_missing')
        }

        const approvedScope = await issueProductionScope({
          workId: task.id,
          version: scopeVersion,
          items: actionScopeItems,
          approvedBy: 'Mousai',
          approvedAt: new Date().toISOString(),
          existingScopeId: review.approvedScope?.scopeId ?? null
        })

        result = await transport.approveProductionScope(task.id, {
          actor: 'Mousai',
          approvedScope,
          bundleMeta: review.bundleMeta
        })
      } else if (action === 'start') {
        result = await transport.startProduction(task.id, { actor: 'Mousai' })
      } else if (action === 'revision') {
        result = await transport.requestProductionRevision(task.id, {
          actor: 'Mousai',
          revision,
          reason: revisionReason.trim(),
          reviewerComment: reviewerComment.trim()
        })
      } else {
        result = await transport.acceptProduction(task.id, {
          actor: 'Mousai',
          verdict: acceptanceVerdict.trim(),
          comment: acceptanceComment.trim() || null
        })
      }

      setSuccess(`服务端已返回 ${result.production.gateState}；正在刷新 snapshot。`)

      try {
        await onRefresh()
      } catch (refreshError) {
        setError(`服务端动作已完成，但 snapshot 刷新失败：${productionActionErrorMessage(refreshError)}`)

        return
      }

      setSuccess(`服务端已返回 ${result.production.gateState}；snapshot 已刷新。`)
      setAction(null)
    } catch (actionError) {
      setError(productionActionErrorMessage(actionError))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mt-4 border-t border-(--ui-stroke-quaternary) pt-3">
      <div className="mb-2 text-[0.6875rem] text-(--ui-text-quaternary)">Production Actions（显式操作）</div>
      <p className="mb-3 break-words text-xs text-(--ui-text-secondary)" role="status">
        {review ? GATE_GUIDANCE[review.gateState] : '尚无 production record；可提交前置 metadata，不会伪造生产状态。'}
      </p>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(ACTION_LABELS) as ProductionAction[]).map(candidate => {
          const enabled = capability[candidate] && (candidate !== 'scope' || Boolean(review?.bundleMeta))

          return (
            <Button
              disabled={!enabled || pending}
              key={candidate}
              onClick={() => openAction(candidate)}
              size="sm"
              type="button"
              variant="outline"
            >
              {ACTION_LABELS[candidate]}
            </Button>
          )
        })}
      </div>
      {success && (
        <p className="mt-2 text-xs text-(--ui-text-secondary)" role="status">
          {success}
        </p>
      )}
      {error && (
        <p className="mt-2 break-words text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      <Dialog onOpenChange={open => !open && !pending && setAction(null)} open={action !== null}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <DialogHeader>
            <DialogTitle>{action ? ACTION_LABELS[action] : 'Production Action'}</DialogTitle>
            <DialogDescription>
              {action ? ACTION_IMPACTS[action] : '只提交当前明确动作。'}不会乐观改写 Gate；最终状态以刷新后的 canonical
              snapshot 为准。
            </DialogDescription>
          </DialogHeader>

          {action === 'prepare' && (
            <div className="space-y-3">
              <label className="block text-xs">
                <span className="mb-1 block text-(--ui-text-tertiary)">缺失资料（每行一项）</span>
                <Textarea onChange={event => setMissingInformation(event.target.value)} value={missingInformation} />
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  checked={decisionRequired}
                  onChange={event => setDecisionRequired(event.target.checked)}
                  type="checkbox"
                />
                需要 Mousai 决策
              </label>
              <label className="block text-xs">
                <span className="mb-1 block text-(--ui-text-tertiary)">输入来源（每行一项）</span>
                <Textarea onChange={event => setInputSources(event.target.value)} value={inputSources} />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block text-(--ui-text-tertiary)">输出格式（每行一项）</span>
                <Textarea onChange={event => setOutputFormats(event.target.value)} value={outputFormats} />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block text-(--ui-text-tertiary)">验收条件（每行一项）</span>
                <Textarea onChange={event => setAcceptanceCriteria(event.target.value)} value={acceptanceCriteria} />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block text-(--ui-text-tertiary)">DDL</span>
                <Input onChange={event => setDueDate(event.target.value)} type="date" value={dueDate} />
              </label>
            </div>
          )}

          {action === 'scope' && (
            <div className="space-y-3">
              <label className="block text-xs">
                <span className="mb-1 block text-(--ui-text-tertiary)">本次 Scope items（每行一项）</span>
                <Textarea onChange={event => setScopeItems(event.target.value)} value={scopeItems} />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block text-(--ui-text-tertiary)">Scope version</span>
                <Input
                  min={1}
                  onChange={event => setScopeVersion(Number(event.target.value))}
                  type="number"
                  value={scopeVersion}
                />
              </label>
            </div>
          )}

          {action === 'revision' && (
            <div className="space-y-3">
              <label className="block text-xs">
                <span className="mb-1 block text-(--ui-text-tertiary)">Revision</span>
                <Input
                  min={2}
                  onChange={event => setRevision(Number(event.target.value))}
                  type="number"
                  value={revision}
                />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block text-(--ui-text-tertiary)">Revision reason</span>
                <Textarea onChange={event => setRevisionReason(event.target.value)} value={revisionReason} />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block text-(--ui-text-tertiary)">Mousai 验收意见</span>
                <Textarea onChange={event => setReviewerComment(event.target.value)} value={reviewerComment} />
              </label>
            </div>
          )}

          {action === 'accept' && (
            <div className="space-y-3">
              <label className="block text-xs">
                <span className="mb-1 block text-(--ui-text-tertiary)">Acceptance verdict</span>
                <Input onChange={event => setAcceptanceVerdict(event.target.value)} value={acceptanceVerdict} />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block text-(--ui-text-tertiary)">Acceptance comment（必填）</span>
                <Textarea onChange={event => setAcceptanceComment(event.target.value)} value={acceptanceComment} />
              </label>
            </div>
          )}

          <dl className="grid gap-3 rounded-md bg-foreground/4 p-3 sm:grid-cols-2">
            <SummaryFact label="WORK-ID" value={task.id} />
            <SummaryFact label="当前 Gate" value={currentGate} />
            <SummaryFact label="当前 Scope version" value={currentScopeVersion} />
            <SummaryFact
              label="本次 Scope items"
              value={displayedScopeItems.length ? displayedScopeItems.join('；') : '未设置 / 等待输入'}
            />
            <SummaryFact label="Revision reason" value={displayedRevisionReason || '未设置 / 等待输入'} />
            <SummaryFact label="Acceptance" value={displayedAcceptance || '未设置 / 等待输入'} />
          </dl>

          <DialogFooter>
            <Button disabled={pending} onClick={() => setAction(null)} type="button" variant="ghost">
              取消
            </Button>
            <Button disabled={!canSubmit || pending} onClick={() => void submit()} type="button">
              {pending ? '提交中…' : `确认${action ? ACTION_LABELS[action] : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
