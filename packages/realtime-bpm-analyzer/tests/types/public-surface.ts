// Checked by `npm run typecheck`, never run: each `@ts-expect-error` fails the check once its line compiles
import type * as entry from '../../src/index';
import type {BpmAnalyzer} from '../../src/index';
import type {BpmAnalyzerContract, EngineOption, OfflineEngineOption} from '../../src/contract/types';
import type {engineKeys} from '../../src/core/engine';

/** Compiles only when `T` satisfies `U` */
type Satisfies<T extends U, U> = T;

/** What any caller may build with `new`, whatever the arguments */
type PublicConstructor = new (...args: never[]) => unknown;

// @ts-expect-error The constructor is private: only createRealtimeBpmAnalyzer builds an analyzer
export type BuiltWithNew = Satisfies<typeof BpmAnalyzer, PublicConstructor>;

// @ts-expect-error No caller can fail an analyzer
export type Fault = BpmAnalyzer['fault'];

// @ts-expect-error The entry does not export how the factory builds an analyzer
export type ConstructAnalyzer = typeof entry.constructAnalyzer;

// @ts-expect-error The entry does not export how an analyzer is failed
export type FailAnalyzer = typeof entry.failAnalyzer;

// The class keeps the surface its contract describes. It names no `implements` clause, since the contract type is
// internal and the clause would put an undocumented name on the API reference, so this line holds it instead
export type KeepsTheContract = Satisfies<BpmAnalyzer, BpmAnalyzerContract>;

/** True only when `A` and `B` are the same union */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type Keys = typeof engineKeys;
type RealtimeObject = Extract<EngineOption, object>;
type OfflineObject = Extract<OfflineEngineOption, object>;

// The resolvers refuse every key outside `engineKeys`, so these hold it equal to the public types (RBA-108's
// DECISION of 2026-11-16): a setting added to one and not the other fails this check
export type RealtimeEngineNames = Satisfies<Same<RealtimeObject['name'], keyof Keys['realtime']>, true>;
export type RealtimePeaksKeys = Satisfies<Same<keyof Extract<RealtimeObject, {name: 'peaks'}>, Keys['realtime']['peaks'][number]>, true>;
export type RealtimeTempogramKeys = Satisfies<Same<keyof Extract<RealtimeObject, {name: 'tempogram'}>, Keys['realtime']['tempogram'][number]>, true>;
export type OfflineEngineNames = Satisfies<Same<OfflineObject['name'], keyof Keys['offline']>, true>;
export type OfflinePeaksKeys = Satisfies<Same<keyof Extract<OfflineObject, {name: 'peaks'}>, Keys['offline']['peaks'][number]>, true>;
