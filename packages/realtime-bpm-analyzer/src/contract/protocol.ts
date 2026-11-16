/**
 * The worklet protocol's semver rule, shared by the main thread and the processor: see `ProtocolVersion`.
 */
import {PROTOCOL, type ProtocolVersion} from './types';

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/**
 * The peer's protocol, when both sides can talk
 * @param value The `protocol` a message or the processor options carry
 * @param own This side's protocol
 * @returns The version when it is a pair of counts of this major, `null` otherwise: a fatal mismatch
 */
export function compatibleProtocol(value: unknown, own: ProtocolVersion = PROTOCOL): ProtocolVersion | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const {major, minor} = value as Record<string, unknown>;
  return isCount(major) && isCount(minor) && major === own.major ? {major, minor} : null;
}

/**
 * Whether a message type this side does not know may pass: only from a later minor, which may have added it.
 * From the same or an older minor it is a bug, a typo included.
 * @param peer The sender's protocol, already compatible
 * @param own This side's protocol
 * @returns True when the sender is newer
 */
export const mayAddTypes = (peer: ProtocolVersion, own: ProtocolVersion = PROTOCOL): boolean => peer.minor > own.minor;

/**
 * A protocol as an error message reads it
 * @param value What the message carried
 * @returns `major.minor`, or the raw value when it is not a version
 */
export function describeProtocol(value: unknown): string {
  const known = typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
  return known !== null && isCount(known.major) && isCount(known.minor) ? `${known.major}.${known.minor}` : JSON.stringify(value) ?? 'none';
}

/** This build's protocol, as error messages read it */
export const ownProtocol = `${PROTOCOL.major}.${PROTOCOL.minor}`;
