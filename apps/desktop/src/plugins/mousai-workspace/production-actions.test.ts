import { describe, expect, it } from 'vitest'

import { productionActionErrorMessage } from './production-actions'
import { ProductionActionError } from './service-production-actions'

describe('Production action error guidance', () => {
  it.each<[number, string]>([
    [400, '请求内容无效'],
    [401, 'Desktop 会话未通过认证'],
    [404, '权威生产记录不存在'],
    [409, 'Gate 已变化或动作不再合法'],
    [502, 'Gateway 暂时无法连接 WorkBridge'],
    [503, '生产服务暂时不可用']
  ])('keeps the authoritative %s error and adds actionable guidance', (statusCode, guidance) => {
    const message = productionActionErrorMessage(
      new ProductionActionError('canonical backend detail', statusCode, 'canonical_error')
    )

    expect(message).toContain(guidance)
    expect(message).toContain(`${statusCode} canonical_error: canonical backend detail`)
  })

  it('does not fabricate a status for a client-side validation error', () => {
    expect(productionActionErrorMessage(new ProductionActionError('Missing scope.', null, 'invalid_scope'))).toBe(
      'invalid_scope: Missing scope.'
    )
  })
})
