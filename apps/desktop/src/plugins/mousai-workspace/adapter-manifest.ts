import { asIsoDateTime, asNullableNumber, asTrimmedText, isRecord, issue } from './adapter-shared'
import type { AdapterIssue, AdapterResult, Deliverable } from './domain'

const SHA256 = /^[0-9a-f]{64}$/

export function adaptManifest(payload: unknown): AdapterResult<readonly Deliverable[]> {
  const issues: AdapterIssue[] = []

  if (!isRecord(payload)) {
    return {
      data: [],
      issues: [issue('manifest', 'invalid_record', 'Manifest is not an object.')]
    }
  }

  const workId = asTrimmedText(payload.work_id)
  const files = payload.files
  const declaredFileCount = asNullableNumber(payload.file_count)
  const declaredTotalSize = asNullableNumber(payload.total_size_bytes)
  const localOutputRoot = asTrimmedText(payload.local_output_root)

  if (!workId) {
    issues.push(issue('manifest', 'missing_id', 'Manifest has no work_id.'))

    return { data: [], issues }
  }

  if (!Array.isArray(files)) {
    issues.push(issue('manifest', 'invalid_field', 'Manifest files is not an array.', workId))

    return { data: [], issues }
  }

  if (
    declaredFileCount === null ||
    !Number.isInteger(declaredFileCount) ||
    declaredFileCount !== files.length ||
    declaredTotalSize === null ||
    !Number.isInteger(declaredTotalSize) ||
    declaredTotalSize < 0
  ) {
    issues.push(issue('manifest', 'invalid_field', 'Manifest count or total size is invalid.', workId))

    return { data: [], issues }
  }

  const seen = new Set<string>()
  const deliverables: Deliverable[] = []

  for (const candidate of files) {
    if (!isRecord(candidate)) {
      issues.push(issue('manifest', 'invalid_record', 'Manifest file is not an object.', workId))

      continue
    }

    const filename = asTrimmedText(candidate.filename)
    const relativePath = asTrimmedText(candidate.relative_path)
    const extension = asTrimmedText(candidate.extension)
    const sha256 = asTrimmedText(candidate.sha256)
    const modifiedAt = asIsoDateTime(candidate.modified_at)
    const sizeBytes = asNullableNumber(candidate.size_bytes)

    const validRelativePath =
      relativePath !== null &&
      !relativePath.startsWith('/') &&
      !relativePath.includes('\\') &&
      !relativePath.split('/').some(part => part === '' || part === '.' || part === '..')

    if (
      !filename ||
      filename.includes('/') ||
      filename.includes('\\') ||
      !relativePath ||
      !validRelativePath ||
      relativePath.split('/').at(-1) !== filename ||
      !extension ||
      !filename.toLocaleLowerCase().endsWith(extension.toLocaleLowerCase()) ||
      !sha256 ||
      !SHA256.test(sha256) ||
      modifiedAt === null ||
      sizeBytes === null ||
      sizeBytes < 0
    ) {
      issues.push(issue('manifest', 'invalid_field', 'Manifest file metadata is invalid.', workId))

      continue
    }

    const key = relativePath.toLocaleLowerCase()

    if (seen.has(key)) {
      issues.push(issue('manifest', 'duplicate_id', `Duplicate manifest path: ${relativePath}`, workId))

      continue
    }

    seen.add(key)
    deliverables.push({
      id: `${workId}:${sha256}:${relativePath}`,
      workId,
      taskId: workId,
      projectId: null,
      name: filename,
      filename,
      format: extension,
      relativePath,
      extension,
      sizeBytes,
      sha256,
      modifiedAt,
      updatedAt: modifiedAt,
      reviewState: 'unknown',
      localOutputRoot,
      source: { system: 'manifest', recordId: relativePath }
    })
  }

  if (deliverables.reduce((sum, deliverable) => sum + deliverable.sizeBytes, 0) !== declaredTotalSize) {
    return {
      data: [],
      issues: [...issues, issue('manifest', 'invalid_field', 'Manifest total size does not match its files.', workId)]
    }
  }

  return { data: deliverables, issues }
}
