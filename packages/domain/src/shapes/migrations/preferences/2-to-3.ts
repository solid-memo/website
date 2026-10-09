import { conceptOfPolicy } from "../../../concepts";
import { DEFAULT_INVALID_DATA_POLICY } from "../../../invalidDataPolicy";
import type { MigrationStep } from "../step";

/**
 * Preferences format 3 states what to do with invalid data; preferences
 * saved before there was a choice get the default, which sets a deck
 * with invalid data aside until it is repaired.
 */
export const PREFERENCES_2_TO_3: MigrationStep<"preferences", 2, 3> = {
  shape: "preferences",
  from: 2,
  to: 3,
  up: (data) => ({ ...data, invalidDataPolicy: conceptOfPolicy(DEFAULT_INVALID_DATA_POLICY) }),
};
