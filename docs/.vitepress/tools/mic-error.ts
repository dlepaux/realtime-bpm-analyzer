// Why the microphone didn't start, as analytics can carry it (RBA-154): a fixed kind and the
// browser's error name from a known list, never the message, which is free text.
// Pure and import-free so `npm test` runs it with node --test.

export const MIC_ERROR_KINDS = ['denied', 'no_device', 'in_use', 'other'] as const
export type MicErrorKind = (typeof MIC_ERROR_KINDS)[number]

// The names getUserMedia and the audio setup after it throw, per the spec and the older
// Chrome and Firefox spellings. Anything else is sent as `other`.
const KIND_BY_NAME = {
  NotAllowedError: 'denied',
  PermissionDeniedError: 'denied',
  NotFoundError: 'no_device',
  DevicesNotFoundError: 'no_device',
  OverconstrainedError: 'no_device',
  NotReadableError: 'in_use',
  TrackStartError: 'in_use',
  SecurityError: 'other',
  AbortError: 'other',
  NotSupportedError: 'other',
  InvalidStateError: 'other',
  TypeError: 'other',
} as const satisfies Record<string, MicErrorKind>

export type MicErrorName = keyof typeof KIND_BY_NAME | 'other'
export const MIC_ERROR_NAMES = [...Object.keys(KIND_BY_NAME), 'other'] as readonly MicErrorName[]

export type MicError = { readonly error_kind: MicErrorKind; readonly error_name: MicErrorName }

export function classifyMicError(error: unknown): MicError {
  const name = error instanceof Error ? error.name : ''
  return Object.hasOwn(KIND_BY_NAME, name)
    ? { error_kind: KIND_BY_NAME[name as keyof typeof KIND_BY_NAME], error_name: name as MicErrorName }
    : { error_kind: 'other', error_name: 'other' }
}
