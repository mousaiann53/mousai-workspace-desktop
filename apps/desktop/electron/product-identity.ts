import path from 'node:path'

export const MOUSAI_APP_ID = 'com.mousai.workspace'
export const MOUSAI_PRODUCT_NAME = 'Mousai Workspace'
export const LEGACY_HERMES_USER_DATA_NAME = 'Hermes'

interface UserDataPathInput {
  appDataPath: string
  exists: (candidate: string) => boolean
  platform: NodeJS.Platform
}

/**
 * Keep the M1 Windows baseline connected after the product rebrand.
 *
 * Existing M1 installations store the encrypted Remote Gateway token and
 * connection registry under `%APPDATA%/Hermes`. A branded build must not copy
 * those credential-bearing files or silently strand them. On Windows we keep
 * using that directory only while it already exists and the new branded
 * directory does not. Fresh installs use `%APPDATA%/Mousai Workspace`.
 */
export function resolveMousaiUserDataPath({ appDataPath, exists, platform }: UserDataPathInput): string | null {
  if (platform !== 'win32') {
    return null
  }

  const brandedPath = path.join(appDataPath, MOUSAI_PRODUCT_NAME)
  const legacyPath = path.join(appDataPath, LEGACY_HERMES_USER_DATA_NAME)

  if (exists(brandedPath)) {
    return brandedPath
  }

  return exists(legacyPath) ? legacyPath : brandedPath
}
