// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { createUseCases } from "./useCases";
import { libraryDeck, libraryContent, makeDeps } from "./testing/fakePorts";

describe("mistake reports", () => {
  it("reportPlace reports a release the library's index lists to the library, any other to its contact", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    vi.mocked(deps.deckLibrary.readLibraryIndex).mockResolvedValue({
      url: "https://site.example/decks/index.ttl",
      publisher: null,
      releases: [libraryDeck.url],
    });
    await expect(useCases.reportPlace(libraryDeck.url)).resolves.toEqual({ library: true });
    expect(deps.deckLibrary.fetchLibraryDeck).not.toHaveBeenCalled();

    const linked = "https://bob.example/memo/releases/rivers/v1.ttl";
    await expect(useCases.reportPlace(linked)).resolves.toEqual({ library: false });
    expect(deps.deckLibrary.fetchLibraryDeck).toHaveBeenCalledWith(linked);
    vi.mocked(deps.deckLibrary.fetchLibraryDeck).mockResolvedValueOnce({
      ...libraryContent,
      contact: "https://bob.example/issues",
    });
    await expect(useCases.reportPlace(linked)).resolves.toEqual({
      library: false,
      contact: "https://bob.example/issues",
    });
  });
});
