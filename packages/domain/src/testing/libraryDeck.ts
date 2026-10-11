// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { LangTexts } from "../keywords";
import { librarySeriesUrlOf } from "../libraryLayout";

/**
 * What a library deck published only as release 1, at `url`, says about
 * its releases and classification: for tests that describe library
 * decks field by field.
 */
export function firstRelease(url: string) {
  return {
    seriesUrl: librarySeriesUrlOf(url),
    version: "1",
    releases: [{ url, version: "1" }],
    themes: [] as string[],
    keywords: {} as LangTexts,
  };
}
