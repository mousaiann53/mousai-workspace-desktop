import { useMemo, useState } from 'react'

import {
  type ArtifactChangeState,
  type ArtifactRevisionSnapshot,
  compareArtifactRevisions,
  currentArtifactRevision
} from './service-artifact-comparison'
import type { ProductionReviewItem } from './service-production-review'

const CHANGE_LABELS: Readonly<Record<ArtifactChangeState, string>> = {
  added: 'added',
  changed: 'changed',
  removed: 'removed',
  unchanged: 'unchanged'
}

function display(value: null | number | string): string {
  return value === null || value === '' ? '未设置' : String(value)
}

function RevisionFacts({ label, value }: { label: string; value: ArtifactRevisionSnapshot }) {
  return (
    <div className="rounded-md border border-(--ui-stroke-quaternary) p-3 text-[0.6875rem]">
      <div className="font-medium">{label}</div>
      <div className="mt-1 text-(--ui-text-tertiary)">
        Revision {display(value.revision)} · Scope {display(value.scopeVersion)} · Manifest{' '}
        {display(value.manifestVersion)} · Producer {display(value.producer)}
      </div>
    </div>
  )
}

export function ArtifactComparison({
  item,
  historicalVersions = []
}: {
  item: ProductionReviewItem
  historicalVersions?: readonly ArtifactRevisionSnapshot[]
}) {
  const current = currentArtifactRevision(item)
  const [selectedId, setSelectedId] = useState(historicalVersions[0]?.id ?? '')
  const previous = historicalVersions.find(version => version.id === selectedId) ?? historicalVersions[0] ?? null

  const comparisons = useMemo(
    () => (current && previous ? compareArtifactRevisions(current, previous) : []),
    [current, previous]
  )

  if (!current) {
    return <p className="text-xs text-(--ui-text-tertiary)">尚无 canonical production record，无法建立版本比较。</p>
  }

  return (
    <div aria-label="Artifact metadata comparison" className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[0.6875rem] text-(--ui-text-tertiary)">
          比较基线
          <select
            className="mt-1 block h-8 rounded-md border border-(--ui-stroke-quaternary) bg-(--ui-sidebar-surface-background) px-2 text-xs"
            disabled={!historicalVersions.length}
            onChange={event => setSelectedId(event.target.value)}
            value={previous?.id ?? ''}
          >
            {!historicalVersions.length && <option value="">上一版 Manifest 未提供</option>}
            {historicalVersions.map(version => (
              <option key={version.id} value={version.id}>
                r{display(version.revision)} / {display(version.manifestVersion)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <RevisionFacts label="Current revision" value={current} />

      {!previous ? (
        <p className="rounded-md bg-foreground/4 px-3 py-2 text-xs text-(--ui-text-tertiary)">
          canonical snapshot 尚未提供 previous revision 的 Manifest 文件元数据；不会用 revision 事件伪造文件比较。
        </p>
      ) : (
        <>
          <RevisionFacts label="Previous revision" value={previous} />
          <ul className="space-y-2 sm:hidden">
            {comparisons.map(comparison => {
              const file = comparison.current ?? comparison.previous

              return (
                <li className="rounded-md border border-(--ui-stroke-quaternary) p-3" key={comparison.key}>
                  <div className="flex items-start justify-between gap-2 text-[0.6875rem]">
                    <span className="min-w-0 break-words font-medium">{file?.filename}</span>
                    <span className="shrink-0 text-(--ui-text-tertiary)">{CHANGE_LABELS[comparison.state]}</span>
                  </div>
                  <dl className="mt-2 space-y-1 text-[0.6875rem] text-(--ui-text-tertiary)">
                    <div>
                      <dt className="inline text-(--ui-text-quaternary)">SHA256 </dt>
                      <dd className="inline break-all">{file?.sha256}</dd>
                    </div>
                    <div>
                      <dt className="inline text-(--ui-text-quaternary)">大小 </dt>
                      <dd className="inline">{file?.sizeBytes}</dd>
                    </div>
                    <div>
                      <dt className="inline text-(--ui-text-quaternary)">修改时间 </dt>
                      <dd className="inline">{file?.modifiedAt}</dd>
                    </div>
                  </dl>
                </li>
              )
            })}
          </ul>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-[0.6875rem]">
              <thead className="text-(--ui-text-quaternary)">
                <tr>
                  <th className="pb-2 font-normal">状态</th>
                  <th className="pb-2 font-normal">文件名</th>
                  <th className="pb-2 font-normal">SHA256</th>
                  <th className="pb-2 font-normal">大小</th>
                  <th className="pb-2 font-normal">修改时间</th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map(comparison => {
                  const file = comparison.current ?? comparison.previous

                  return (
                    <tr className="border-t border-(--ui-stroke-quaternary)" key={comparison.key}>
                      <td className="py-2 pr-3">{CHANGE_LABELS[comparison.state]}</td>
                      <td className="py-2 pr-3">{file?.filename}</td>
                      <td className="max-w-44 truncate py-2 pr-3" title={file?.sha256}>
                        {file?.sha256}
                      </td>
                      <td className="py-2 pr-3">{file?.sizeBytes}</td>
                      <td className="py-2">{file?.modifiedAt}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
