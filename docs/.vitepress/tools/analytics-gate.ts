// What track() does to an event before it leaves (RBA-154): checks it against the catalogue and
// returns only what the catalogue declares, in the shape it declares. Types catch most mistakes at
// build time; this catches the rest at run time (a value computed from user input, a call the
// types can't see). In dev the problems throw, in production they are fixed and sent, so a drift
// shows in reports as `invalid` rather than as silence.
// Pure, so node --test runs it.

import { EVENTS, INVALID, PARAMS, type EventName, type EventSpec, type ParamName, type ParamSpec } from './analytics-events.ts'
import { scrubEventParams, type EventParams } from './analytics-params.ts'

export type GateResult = {
  /** Declared params only, each valid, URL-scrubbed. */
  readonly params: EventParams
  /** One line per contract violation found, empty when the event is clean. */
  readonly problems: readonly string[]
}

export function isEventName(name: string): name is EventName {
  return Object.hasOwn(EVENTS, name)
}

type Checked = { readonly value?: string | number | boolean; readonly problem?: string }

function checkValue(spec: ParamSpec, value: unknown): Checked {
  switch (spec.type) {
    case 'enum':
      return typeof value === 'string' && spec.values.includes(value)
        ? { value }
        : { value: INVALID, problem: `${JSON.stringify(value)} is not one of its values` }
    case 'int': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return { problem: `${JSON.stringify(value)} is not a number` }
      const clamped = Math.min(spec.max, Math.max(spec.min, Math.round(value)))
      return clamped === value ? { value } : { value: clamped, problem: `${value} is not an integer in ${spec.min}..${spec.max}` }
    }
    case 'bool':
      return typeof value === 'boolean' ? { value } : { problem: `${JSON.stringify(value)} is not a boolean` }
    case 'text': {
      if (typeof value !== 'string') return { problem: `${JSON.stringify(value)} is not a string` }
      if (spec.pattern && !spec.pattern.test(value)) return { value: INVALID, problem: `${JSON.stringify(value)} does not match its pattern` }
      // GA4 cuts at 100 characters anyway; cutting here keeps that visible and predictable.
      return { value: value.slice(0, spec.maxLength) }
    }
  }
}

/** The event's params as the catalogue allows them, and every problem found on the way. */
export function gateEvent(event: string, raw: Readonly<Record<string, unknown>> = {}): GateResult {
  if (!isEventName(event)) return { params: {}, problems: [`${event}: not in the catalogue`] }
  const declared: EventSpec['params'] = EVENTS[event].params
  const params: EventParams = {}
  const problems: string[] = []

  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue
    if (!Object.hasOwn(declared, key)) {
      problems.push(`${event}.${key}: not declared for this event, dropped`)
      continue
    }
    const checked = checkValue(PARAMS[key as ParamName], value)
    if (checked.problem) problems.push(`${event}.${key}: ${checked.problem}`)
    if (checked.value !== undefined) params[key] = checked.value
  }
  for (const [key, use] of Object.entries(declared)) {
    if (use === 'required' && !(key in params)) problems.push(`${event}.${key}: required, missing`)
  }
  // Defence in depth for the lane rule "analytics never send URLs" (RBA-35).
  return { params: scrubEventParams(params), problems }
}
