import { LATEST_VERSION, type LatestRecord, type ShapeName, type VersionedRecord } from "@solid-memo/vocab/types.generated";
import { CARD_1_TO_2 } from "./card/1-to-2";
import { CARD_2_TO_3 } from "./card/2-to-3";
import { CARD_3_TO_4 } from "./card/3-to-4";
import { CARD_4_TO_5 } from "./card/4-to-5";
import { DECK_1_TO_2 } from "./deck/1-to-2";
import { DECK_2_TO_3 } from "./deck/2-to-3";
import { DECK_3_TO_4 } from "./deck/3-to-4";
import { DECK_4_TO_5 } from "./deck/4-to-5";
import { DECK_5_TO_6 } from "./deck/5-to-6";
import { INSTANCE_1_TO_2 } from "./instance/1-to-2";
import { LIBRARY_DECK_1_TO_2 } from "./libraryDeck/1-to-2";
import { LIBRARY_DECK_2_TO_3 } from "./libraryDeck/2-to-3";
import { LIBRARY_DECK_3_TO_4 } from "./libraryDeck/3-to-4";
import { LIBRARY_DECK_4_TO_5 } from "./libraryDeck/4-to-5";
import { LIBRARY_DECK_5_TO_6 } from "./libraryDeck/5-to-6";
import { LIBRARY_DECK_SERIES_1_TO_2 } from "./libraryDeckSeries/1-to-2";
import { LIBRARY_DECK_SERIES_2_TO_3 } from "./libraryDeckSeries/2-to-3";
import { PREFERENCES_1_TO_2 } from "./preferences/1-to-2";
import { PREFERENCES_2_TO_3 } from "./preferences/2-to-3";
import { PREFERENCES_3_TO_4 } from "./preferences/3-to-4";
import { REVIEW_STATE_1_TO_2 } from "./reviewState/1-to-2";
import type { AnyMigrationStep, MigrationContext } from "./step";

export type { MigrationContext };

/**
 * Every migration step, one per consecutive pair of versions of each
 * kind (see docs/migrations.md). Reading upgrades a record in memory by
 * walking the chain; nothing is written until the user asks.
 */
export const MIGRATIONS: readonly AnyMigrationStep[] = [
  CARD_1_TO_2,
  CARD_2_TO_3,
  CARD_3_TO_4,
  CARD_4_TO_5,
  DECK_1_TO_2,
  DECK_2_TO_3,
  DECK_3_TO_4,
  DECK_4_TO_5,
  DECK_5_TO_6,
  INSTANCE_1_TO_2,
  LIBRARY_DECK_1_TO_2,
  LIBRARY_DECK_2_TO_3,
  LIBRARY_DECK_3_TO_4,
  LIBRARY_DECK_4_TO_5,
  LIBRARY_DECK_5_TO_6,
  LIBRARY_DECK_SERIES_1_TO_2,
  LIBRARY_DECK_SERIES_2_TO_3,
  PREFERENCES_1_TO_2,
  PREFERENCES_2_TO_3,
  PREFERENCES_3_TO_4,
  REVIEW_STATE_1_TO_2,
];

/** The step from `from` to `from + 1`; a gap in the chain is a programming error. */
export function stepFor(shape: ShapeName, from: number): AnyMigrationStep {
  const step = MIGRATIONS.find((s) => s.shape === shape && s.from === from);
  if (step === undefined) {
    throw new Error(`No migration from ${shape} format ${from}.`);
  }
  return step;
}

/** The record of `context.subject` brought up to the latest version of its kind. */
export function migrate<S extends ShapeName>(
  shape: S,
  record: VersionedRecord[S],
  context: MigrationContext,
): LatestRecord[S] {
  let current: { version: number; data: unknown } = record;
  while (current.version < LATEST_VERSION[shape]) {
    const step = stepFor(shape, current.version);
    current = { version: step.to, data: step.up(current.data, context) };
  }
  return current.data as LatestRecord[S];
}
