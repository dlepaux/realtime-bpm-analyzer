// The logic behind the pages the browser extension opens (RBA-38): /extension/welcome,
// /extension/whats-new and /extension/goodbye. The extension builds their URLs with
// `v=<version>` and, for what's new, `from=<previous version>`. Anyone can edit a
// query string, so a value is used only once it parses as a version, and only in
// its normalised form, never the raw text. Pure and import-free so `npm test` runs
// it with node --test.

// Chrome's extension version format, which the extension itself parses
// (rba-pro extension/src/lib/lifecycle.ts): 1 to 4 dot-separated integers from 0
// to 65535, without leading zeros. Strict semver would reject "1.1", a valid
// extension version, and every semver release (1.2.3) is in this format anyway.
const VERSION = /^(0|[1-9]\d{0,4})(\.(0|[1-9]\d{0,4})){0,3}$/

type VersionParts = readonly [number, number, number, number]

function versionParts(version: string): VersionParts | null {
  if (!VERSION.test(version)) return null
  const parts = version.split('.').map(Number)
  if (parts.some((part) => part > 65535)) return null
  const [major = 0, minor = 0, patch = 0, build = 0] = parts
  return [major, minor, patch, build]
}

/** The version as `major.minor.patch` (plus the build number when there is one), or null. */
export function parseVersion(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const parts = versionParts(raw.trim())
  if (!parts) return null
  const [major, minor, patch, build] = parts
  return build > 0 ? `${major}.${minor}.${patch}.${build}` : `${major}.${minor}.${patch}`
}

/** Negative when `a` is older than `b`, 0 when equal, positive when newer. Both must be valid. */
export function compareVersions(a: string, b: string): number {
  const left = versionParts(a)
  const right = versionParts(b)
  if (!left || !right) throw new Error(`compareVersions needs two valid versions, got "${a}" and "${b}"`)
  for (let i = 0; i < 4; i++) {
    const diff = left[i]! - right[i]!
    if (diff !== 0) return diff
  }
  return 0
}

export type ExtensionQuery = {
  /** The installed version, or null when absent or invalid. */
  readonly version: string | null
  /** The version updated from (what's new only), or null when absent or invalid. */
  readonly from: string | null
}

/** Reads `v` and `from` from a query string such as `location.search`. */
export function readExtensionQuery(search: string): ExtensionQuery {
  const params = new URLSearchParams(search)
  return { version: parseVersion(params.get('v')), from: parseVersion(params.get('from')) }
}

// ── What's new ──────────────────────────────────────────────────────────────

export type ExtensionRelease = {
  readonly version: string
  readonly title: string
  readonly notes: readonly string[]
}

export type SplitReleases = {
  /** What arrived after `from`, newest first. Every shipped release when `from` is unknown. */
  readonly fresh: readonly ExtensionRelease[]
  /** Releases the user already had, newest first. */
  readonly earlier: readonly ExtensionRelease[]
}

// Releases above `current` are left out of both lists: the site deploys before the
// store finishes reviewing a release, so its notes can be live before the user has it.
export function splitReleases(
  releases: readonly ExtensionRelease[],
  query: ExtensionQuery,
): SplitReleases {
  const { version: current, from } = query
  const shipped = releases
    .filter((release) => current === null || compareVersions(release.version, current) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version))
  if (from === null) return { fresh: shipped, earlier: [] }
  return {
    fresh: shipped.filter((release) => compareVersions(release.version, from) > 0),
    earlier: shipped.filter((release) => compareVersions(release.version, from) <= 0),
  }
}

// ── Sitemap ─────────────────────────────────────────────────────────────────

/**
 * True for a sitemap URL under extension/ other than the two public pages there: the
 * privacy policy, which the Chrome Web Store listing and search both need to reach, and
 * the extension's own page. A new page under extension/ stays out by default.
 */
export function isUsersOnlyExtensionPage(url: string): boolean {
  return /^\/?extension\/(?!(privacy(\.html)?|(index\.html)?)$)/.test(url)
}

// ── Goodbye ─────────────────────────────────────────────────────────────────

// A fixed list, sent as the enum value only: there is no backend to receive free
// text, and analytics never carries what a user typed.
export const UNINSTALL_REASONS = [
  { value: 'no_detection', label: "It didn't detect my music" },
  { value: 'wrong_bpm', label: 'The BPM was wrong' },
  { value: 'no_audio', label: 'A site was protected or had no audio' },
  { value: 'too_distracting', label: 'It was too distracting' },
  { value: 'just_trying', label: 'I was just trying it' },
  { value: 'other', label: 'Something else' },
] as const

export type UninstallReason = (typeof UNINSTALL_REASONS)[number]['value']

export function isUninstallReason(value: unknown): value is UninstallReason {
  return UNINSTALL_REASONS.some((reason) => reason.value === value)
}
