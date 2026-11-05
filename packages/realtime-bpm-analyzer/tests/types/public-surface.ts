// Checked by `npm run typecheck`, never run: each `@ts-expect-error` fails the check once its line compiles
import type * as entry from '../../src/index';
import type {BpmAnalyzer} from '../../src/index';

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
