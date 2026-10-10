import type { MigrationStep } from "../step";

/**
 * Library deck format 6 lets a release describe its series and its
 * publisher in its own document, beside the release. The release's own
 * properties are format 5's, so every format-5 release is a format-6
 * release already: nothing changes but the version the chain stamps. A
 * format-5 release's series and publisher are where they always were, in
 * the library index.
 */
export const LIBRARY_DECK_5_TO_6: MigrationStep<"libraryDeck", 5, 6> = {
  shape: "libraryDeck",
  from: 5,
  to: 6,
  up: (data) => data,
};
