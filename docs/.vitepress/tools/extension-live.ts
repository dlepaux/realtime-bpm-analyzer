// The promotion's state for this build. Nothing here is a setting: the values to change
// are EXTENSION_STORE_URL and EXTENSION_EDGE_URL in extension-config.ts.
import { EXTENSION_EDGE_URL, EXTENSION_STORE_URL } from './extension-config'
import { installTargets, resolveEdgeUrl, resolveStoreUrl } from './extension-promo'

export const STORE_URL = resolveStoreUrl(EXTENSION_STORE_URL)
export const EDGE_URL = resolveEdgeUrl(EXTENSION_EDGE_URL)
export const INSTALL_TARGETS = installTargets(STORE_URL, EDGE_URL)
