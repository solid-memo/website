// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach } from "vitest";
import { guardLibraryReads, takeUnlistedReads } from "./libraryDecks";

// The unit tests read only the library's decks that LIBRARY_DECKS lists,
// and its index as of those decks alone (libraryDecks.ts), so that
// solid#test's inputs name those decks, not all of decks/.
guardLibraryReads();

// A reader may take a refused read for a missing file, so the test that
// made one fails here, whatever it went on to check.
afterEach(() => {
  const reads = takeUnlistedReads();
  if (reads.length > 0) {
    throw new Error(
      `The test read decks the unit tests don't list (src/testing/libraryDecks.ts): ${[...new Set(reads)].join(", ")}`,
    );
  }
});
