// "Your tracks": the file results of this browser, kept on this device so a returning
// visitor finds the tracks they already checked, and a DJ or a runner can sort and filter them.
//
// Pure data and functions; the component reads and writes storage through local-store.ts.
// File names are personal data the visitor never meant to share: they stay in localStorage, and
// nothing here is ever passed to analytics (bpm_crate_loaded carries a row-count bucket only).
//
// Safari erases what a page stored after 7 days without a visit (ITP), so the copy says
// "in this browser", never "always", and points to the CSV for a copy that lasts.

export const CRATE_STORAGE_KEY = 'rba:crate:v1'
export const CRATE_VIEW_STORAGE_KEY = 'rba:crate-view:v1'
/** About 60 KB of JSON at the longest names, well inside any browser's storage quota. */
export const CRATE_MAX_ROWS = 500
const MAX_NAME_LENGTH = 200
const MIN_BPM = 20
const MAX_BPM = 400

export interface CrateRow {
  name: string
  /** With the name, tells two different files of the same name apart. */
  sizeBytes: number
  bpm: number
  durationS: number
  addedAt: number
}

export const CRATE_SORTS = ['recent', 'bpm', 'name'] as const
export type CrateSort = (typeof CRATE_SORTS)[number]

/** How the list was last viewed. A null bound is no limit on that side. */
export interface CrateView {
  sort: CrateSort
  low: number | null
  high: number | null
}

export const DEFAULT_CRATE_VIEW: CrateView = { sort: 'recent', low: null, high: null }

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

function isRow(value: unknown): value is CrateRow {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return typeof row.name === 'string'
    && row.name.length > 0
    && row.name.length <= MAX_NAME_LENGTH
    && Number.isSafeInteger(row.sizeBytes) && (row.sizeBytes as number) >= 0
    && isFiniteNumber(row.bpm) && row.bpm >= MIN_BPM && row.bpm <= MAX_BPM
    && isFiniteNumber(row.durationS) && row.durationS >= 0
    && isFiniteNumber(row.addedAt)
}

/** One row's identity: the same file analysed again replaces its row, a namesake doesn't. */
export const rowKey = (row: Pick<CrateRow, 'name' | 'sizeBytes'>): string => `${row.sizeBytes}:${row.name}`

/** Only the fields a row has, so nothing else that storage held is carried along. */
const cleanRow = (row: CrateRow): CrateRow => ({
  name: row.name, sizeBytes: row.sizeBytes, bpm: row.bpm, durationS: row.durationS, addedAt: row.addedAt,
})

/** Reads what storage held. Anything malformed is dropped, never trusted: storage is user-editable. */
export function parseCrate(raw: string | null): CrateRow[] {
  if (raw === null) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  const seen = new Set<string>()
  const rows: CrateRow[] = []
  for (const value of data.slice(0, CRATE_MAX_ROWS * 2)) {
    if (!isRow(value) || seen.has(rowKey(value))) continue
    seen.add(rowKey(value))
    rows.push(cleanRow(value))
    if (rows.length === CRATE_MAX_ROWS) break
  }
  return rows
}

export function serializeCrate(rows: readonly CrateRow[]): string {
  return JSON.stringify(rows.slice(0, CRATE_MAX_ROWS))
}

/** A name too long to keep is cut, never refused: the file was read, so it belongs in the list. */
function fitName(name: string): string {
  if (name.length <= MAX_NAME_LENGTH) return name
  const cut = name.slice(0, MAX_NAME_LENGTH - 1)
  // Never end on half of a character outside the BMP (an emoji, say).
  return `${/[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut}…`
}

/**
 * Adds a result at the top. The same file analysed again replaces its row, so re-dropping a
 * folder doesn't double it. The oldest rows fall off past the cap, which the copy states.
 */
export function addToCrate(rows: readonly CrateRow[], entry: CrateRow): CrateRow[] {
  const fitted = { ...entry, name: fitName(entry.name) }
  if (!isRow(fitted)) return [...rows]
  const key = rowKey(fitted)
  const others = rows.filter(row => rowKey(row) !== key)
  return [cleanRow(fitted), ...others].slice(0, CRATE_MAX_ROWS)
}

export function removeFromCrate(rows: readonly CrateRow[], key: string): CrateRow[] {
  return rows.filter(row => rowKey(row) !== key)
}

export function sortCrate(rows: readonly CrateRow[], sort: CrateSort): CrateRow[] {
  const copy = [...rows]
  if (sort === 'bpm') return copy.sort((a, b) => a.bpm - b.bpm || a.name.localeCompare(b.name))
  if (sort === 'name') return copy.sort((a, b) => a.name.localeCompare(b.name) || b.addedAt - a.addedAt)
  return copy.sort((a, b) => b.addedAt - a.addedAt)
}

/** A range filters only once one of its bounds is set. */
export const hasRange = (view: Pick<CrateView, 'low' | 'high'>): boolean => view.low !== null || view.high !== null

/**
 * The tempo of a track that falls in the range: its own, or, in a closed range, its double or
 * half, since a runner's 160–180 wants an 85 BPM track too. Null when none does. A missing bound
 * is no limit, and then only the track's own tempo counts: "from 150" with octaves would keep
 * every track that doubles past 150, nearly all of them. Bounds typed the wrong way round are
 * read as the range the visitor meant.
 */
export function matchInRange(bpm: number, low: number | null, high: number | null): number | null {
  const a = low ?? Number.NEGATIVE_INFINITY
  const b = high ?? Number.POSITIVE_INFINITY
  const [min, max] = a <= b ? [a, b] : [b, a]
  const inRange = (tempo: number) => tempo >= min && tempo <= max
  if (inRange(bpm)) return bpm
  if (low === null || high === null) return null
  if (inRange(bpm * 2)) return bpm * 2
  if (inRange(bpm / 2)) return bpm / 2
  return null
}

export function filterByRange(rows: readonly CrateRow[], low: number | null, high: number | null): CrateRow[] {
  return rows.filter(row => matchInRange(row.bpm, low, high) !== null)
}

/** A number field's value as a bound: empty, NaN or out of the tempo range is no bound. */
export function toBound(value: unknown): number | null {
  if (typeof value === 'string' && value.trim() === '') return null
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number >= MIN_BPM && number <= MAX_BPM ? number : null
}

/** Reads the remembered view, keeping each field that is valid on its own. */
export function parseCrateView(raw: string | null): CrateView {
  if (raw === null) return { ...DEFAULT_CRATE_VIEW }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { ...DEFAULT_CRATE_VIEW }
  }
  if (typeof data !== 'object' || data === null) return { ...DEFAULT_CRATE_VIEW }
  const view = data as Record<string, unknown>
  const sort = CRATE_SORTS.find(candidate => candidate === view.sort) ?? DEFAULT_CRATE_VIEW.sort
  return { sort, low: toBound(view.low ?? ''), high: toBound(view.high ?? '') }
}

export function serializeCrateView(view: CrateView): string {
  return JSON.stringify({ sort: view.sort, low: view.low, high: view.high })
}

/** The list's size for analytics, in buckets: the count itself says more than the event needs. */
export const CRATE_ROW_BUCKETS = ['1', '2-5', '6-20', '21-100', '101+'] as const
export type CrateRowBucket = (typeof CRATE_ROW_BUCKETS)[number]

export function crateRowBucket(count: number): CrateRowBucket {
  if (count <= 1) return '1'
  if (count <= 5) return '2-5'
  if (count <= 20) return '6-20'
  if (count <= 100) return '21-100'
  return '101+'
}

// A spreadsheet runs a cell starting with = + - @ (or a tab or return) as a formula, and a file
// name is visitor input, so such a cell gets a leading quote.
const defuseFormula = (value: string): string => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value)

// Always quoted: an Excel set to a semicolon list separator (French, German) splits an unquoted
// `a;=1+1` at the semicolon, and the leading-character guard never sees the formula after it.
const csvCell = (value: string): string => `"${defuseFormula(value).replace(/"/g, '""')}"`

/** RFC 4180: CRLF line ends, every name quoted, quotes doubled inside. */
export function crateToCsv(rows: readonly CrateRow[]): string {
  const lines = rows.map(row => `${csvCell(row.name)},${row.bpm},${Math.round(row.durationS)}`)
  return ['File,BPM,Duration (s)', ...lines].join('\r\n') + '\r\n'
}

/** Tab-separated, so a paste lands in two columns in a spreadsheet, and reads as a list anywhere else. */
export function crateToText(rows: readonly CrateRow[]): string {
  return rows.map(row => `${defuseFormula(row.name.replace(/[\t\r\n]+/g, ' '))}\t${row.bpm}`).join('\n')
}
