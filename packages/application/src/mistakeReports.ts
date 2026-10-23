// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ReportPlace } from "@solid-memo/domain/mistakeReport";
import type { DeckLibrary } from "./ports";

export interface MistakeReportUseCases {
  /**
   * Where a mistake in the release at `releaseUrl` is reported
   * (domain/mistakeReport.ts): the library's tracker when the library's
   * index lists the release, however it was reached (copied, or opened
   * from a link), else the contact the release names, if any. Writes
   * nothing.
   */
  reportPlace(releaseUrl: string): Promise<ReportPlace>;
}

/** Where a learner reports a mistake they find in a release. */
export function createMistakeReportUseCases({
  deckLibrary,
}: {
  deckLibrary: DeckLibrary;
}): MistakeReportUseCases {
  return {
    async reportPlace(releaseUrl) {
      const index = await deckLibrary.readLibraryIndex();
      if (index.releases.includes(releaseUrl)) return { library: true };
      const { contact } = await deckLibrary.fetchLibraryDeck(releaseUrl);
      return contact === undefined ? { library: false } : { library: false, contact };
    },
  };
}
