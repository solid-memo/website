// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { MigrationStep } from "../step";

/** As for a pod deck: a format-1 library deck is studied front→back. */
export const LIBRARY_DECK_1_TO_2: MigrationStep<"libraryDeck", 1, 2> = {
  shape: "libraryDeck",
  from: 1,
  to: 2,
  up: (data) => ({ ...data, direction: "front-to-back" }),
};
