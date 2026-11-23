// The way from www's pages into the musician app, decided on 2026-11-23:
// www keeps the search landing pages, and each tool page and the home lead into the app's copy of
// the same page. The app mirrors www path for path (the app's own list of the pages
// and gives each its www canonical), so the route is the page's own path, gated by www's own tool
// list: there is no second map to keep in step.
//
// The link is the bare address. www and the app share one GA4 property and the parent domain's
// cookie, so the visit is already one visitor's; a UTM tag would only re-credit what they do in the
// app to a made-up campaign. The click event says where the entry was.
// Pure and import-light so node --test runs it.
import { freeTools } from './tool-list.ts'

export const APP_ORIGIN = 'https://app.realtime-bpm-analyzer.com'

/**
 * Where an entry sits: the nav bar on wider screens, the top of the phone menu, and a row under
 * the tool itself, which on a phone is the one in view without opening the menu.
 */
export const APP_PLACEMENTS = ['app_nav', 'app_menu', 'app_below_tool'] as const
export type AppPlacement = (typeof APP_PLACEMENTS)[number]

const TOOL_PATHS: ReadonlySet<string> = new Set(freeTools().map((tool) => tool.link))

/**
 * The app route for a www page, or null when the app has no copy of it. A tool path with a
 * trailing slash is not the page: www answers it with a 404, so it gets no entry either.
 */
export function appRouteOf(pathname: string): string | null {
  const path = pathname.replace(/\.html$/, '').replace(/(^|\/)index$/, '')
  if (path === '' || path === '/') return '/'
  return TOOL_PATHS.has(path) ? path : null
}

/** The app address a www page's entry opens, or null when the page has no entry. */
export function appUrlOf(pathname: string): string | null {
  const route = appRouteOf(pathname)
  return route === null ? null : `${APP_ORIGIN}${route}`
}
