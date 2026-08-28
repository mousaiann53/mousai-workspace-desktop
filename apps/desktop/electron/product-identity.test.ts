import assert from 'node:assert/strict'
import path from 'node:path'

import { describe, test } from 'vitest'

import {
  LEGACY_HERMES_USER_DATA_NAME,
  MOUSAI_APP_ID,
  MOUSAI_PRODUCT_NAME,
  resolveMousaiUserDataPath
} from './product-identity'

describe('Mousai Workspace product identity', () => {
  test('uses the approved display name and application id', () => {
    assert.equal(MOUSAI_PRODUCT_NAME, 'Mousai Workspace')
    assert.equal(MOUSAI_APP_ID, 'com.mousai.workspace')
  })

  test('keeps the M1 Hermes user-data directory when it is the only existing directory', () => {
    const appDataPath = path.join('C:', 'Users', 'Mousai', 'AppData', 'Roaming')
    const legacyPath = path.join(appDataPath, LEGACY_HERMES_USER_DATA_NAME)

    assert.equal(
      resolveMousaiUserDataPath({ appDataPath, exists: candidate => candidate === legacyPath, platform: 'win32' }),
      legacyPath
    )
  })

  test('prefers the branded directory once it exists', () => {
    const appDataPath = path.join('C:', 'Users', 'Mousai', 'AppData', 'Roaming')
    const brandedPath = path.join(appDataPath, MOUSAI_PRODUCT_NAME)

    assert.equal(resolveMousaiUserDataPath({ appDataPath, exists: () => true, platform: 'win32' }), brandedPath)
  })

  test('does not override the platform user-data path outside Windows', () => {
    assert.equal(
      resolveMousaiUserDataPath({ appDataPath: '/home/mousai/.config', exists: () => true, platform: 'linux' }),
      null
    )
  })
})
