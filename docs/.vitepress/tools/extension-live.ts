// The promotion's state for this build. Nothing here is a setting: the one value to
// change is EXTENSION_STORE_URL in extension-config.ts.
import { EXTENSION_STORE_URL } from './extension-config'
import { installTargets, resolveStoreUrl } from './extension-promo'

export const STORE_URL = resolveStoreUrl(EXTENSION_STORE_URL)
export const INSTALL_TARGETS = installTargets(STORE_URL)
