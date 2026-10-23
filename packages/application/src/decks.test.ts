// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "@solid-memo/domain/appError";
import { describe, expect, it, vi } from "vitest";
import { createUseCases } from "./useCases";
import { instance, deck, makeDeps } from "./testing/fakePorts";

describe("decks", () => {
  const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";
  const changed = () => new AppError("changedElsewhere", { url: "x" });

  it("describeDeck saves the deck's description in the languages given, topics and keywords, refusing an empty description", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await useCases.describeDeck(deck, {
      description: { en: " Kanji. " },
      topics: [],
      keywords: { en: ["kanji"] },
    });
    expect(deps.deckRepository.saveDeck).toHaveBeenCalledWith({
      ...deck,
      description: { en: "Kanji." },
      keywords: { en: ["kanji"] },
    });
    // Only the language the user stated: no English stands in for it.
    await useCases.describeDeck(deck, { description: { sv: "Kanji." }, topics: [], keywords: {} });
    expect(deps.deckRepository.saveDeck).toHaveBeenLastCalledWith({
      ...deck,
      description: { sv: "Kanji." },
    });
    await expect(
      useCases.describeDeck(deck, { description: { en: "" }, topics: [], keywords: {} }),
    ).rejects.toThrow("A deck needs a description.");
  });
  it("describeDeck saves keywords under the canonical form of each stated language, refusing a tag that names no language and new untagged keywords", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    const legacy = { ...deck, keywords: { "": ["kanji"] } };
    await useCases.describeDeck(legacy, {
      description: { en: "Kanji." },
      topics: [],
      keywords: { "": ["kanji"], "JA-jp": ["漢字"], iw: ["קאנג'י"], he: ["כתב"] },
    });
    expect(deps.deckRepository.saveDeck).toHaveBeenLastCalledWith({
      ...deck,
      description: { en: "Kanji." },
      keywords: { "": ["kanji"], "ja-jp": ["漢字"], he: ["קאנג'י", "כתב"] },
    });
    await expect(
      useCases.describeDeck(deck, {
        description: { en: "Kanji." },
        topics: [],
        keywords: { Swedish: ["kanji"] },
      }),
    ).rejects.toThrow("“Swedish” is not a language code.");
    await expect(
      useCases.describeDeck(legacy, {
        description: { en: "Kanji." },
        topics: [],
        keywords: { "": ["kanji", "N5"] },
      }),
    ).rejects.toThrow("Choose the language of the keywords.");
  });
  it("describeDeck keeps the keyword tags the deck already has as stored, checking only the ones the user states", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    // Tags another app wrote: ones the app would refuse ("und", "en-x-custom")
    // or re-tag ("iw") if the user chose them.
    const stored = { ...deck, keywords: { und: ["foo"], "en-x-custom": ["bar"], iw: ["קאנג'י"] } };
    await useCases.describeDeck(stored, {
      description: { en: "Only the description changed." },
      topics: [],
      keywords: { und: ["foo"], "EN-x-Custom": ["bar"], iw: ["קאנג'י"], he: ["כתב"] },
    });
    expect(deps.deckRepository.saveDeck).toHaveBeenLastCalledWith({
      ...deck,
      description: { en: "Only the description changed." },
      keywords: { und: ["foo"], "en-x-custom": ["bar"], iw: ["קאנג'י"], he: ["כתב"] },
    });
    // A tag the deck does not have is still checked.
    await expect(
      useCases.describeDeck(stored, {
        description: { en: "Kanji." },
        topics: [],
        keywords: { "fr-x-custom": ["baz"] },
      }),
    ).rejects.toThrow("“fr-x-custom” is not a language code.");
    expect(deps.deckRepository.saveDeck).toHaveBeenCalledTimes(1);
  });
  it("setDeckPace saves the deck's own daily limits, refusing one that is not a whole number", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await useCases.setDeckPace({ ...deck, maxReviewsPerDay: 50 }, { newCardsPerDay: 5 });
    expect(deps.deckRepository.saveDeck).toHaveBeenCalledWith({ ...deck, newCardsPerDay: 5 });
    await expect(useCases.setDeckPace(deck, { newCardsPerDay: 1.5 })).rejects.toThrow(
      "A daily limit is a whole number, 0 or more.",
    );
  });
  it("setDeckCardLanguage saves the deck's card language or clears it, refusing one that names no language", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await useCases.setDeckCardLanguage(deck, "SV");
    expect(deps.deckRepository.setCardLanguage).toHaveBeenLastCalledWith(deck, "sv");
    const swedish = { ...deck, cardLanguage: "sv" };
    await useCases.setDeckCardLanguage(swedish, null);
    expect(deps.deckRepository.setCardLanguage).toHaveBeenLastCalledWith(swedish, null);
    await expect(useCases.setDeckCardLanguage(deck, "Swedish")).rejects.toThrow(
      "“Swedish” is not a language code.",
    );
    expect(deps.deckRepository.setCardLanguage).toHaveBeenCalledTimes(2);
    // Edited on the entry as it is now, never by a save of the deck as read.
    expect(deps.deckRepository.saveDeck).not.toHaveBeenCalled();
  });
  it("sets several decks' direction or pace in one save, and removes several decks at once", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    const other = { ...deck, id: "deck-2", url: `${deck.url}-2`, newCardsPerDay: 9 };
    await expect(useCases.setDecksDirection([deck, other], "back-to-front")).resolves.toEqual([
      { ...deck, direction: "back-to-front" },
      { ...other, direction: "back-to-front" },
    ]);
    await useCases.setDecksPace([deck, other], { maxReviewsPerDay: 40 });
    expect(deps.deckRepository.saveDecks).toHaveBeenLastCalledWith([
      { ...deck, maxReviewsPerDay: 40 },
      { ...deck, id: "deck-2", url: `${deck.url}-2`, maxReviewsPerDay: 40 },
    ]);
    expect(deps.deckRepository.saveDecks).toHaveBeenCalledTimes(2);
    await expect(useCases.setDecksPace([deck], { newCardsPerDay: -1 })).rejects.toThrow(
      "A daily limit is a whole number, 0 or more.",
    );
    expect(deps.deckRepository.saveDecks).toHaveBeenCalledTimes(2);
    await useCases.removeDecks([deck, other]);
    expect(deps.deckRepository.removeDecks).toHaveBeenCalledWith([deck, other]);
  });
  it("deck tree use cases name a new group with a fresh id, and tidy a group's name", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);

    await expect(useCases.listDeckTree(instance.url)).resolves.toEqual({
      children: [{ kind: "deck", deck }],
      readOnly: false,
    });
    expect(deps.deckRepository.readDeckTree).toHaveBeenCalledWith(instance.url);

    const group = useCases.newDeckGroup(instance.url, { sv: " Språk " });
    expect(group).toEqual({ url: `${instance.url}catalog.ttl#group-0f3a`, title: { sv: "Språk" } });
    expect(() => useCases.newDeckGroup(instance.url, { en: " " })).toThrow(
      "A deck group needs a name",
    );

    const combine = { kind: "combine" as const, dragged: deck.url, target: `${deck.url}-2`, group };
    await expect(useCases.editDeckTree(instance.url, combine)).resolves.toEqual({
      children: [{ kind: "deck", deck }],
      readOnly: false,
    });
    expect(deps.deckRepository.editDeckTree).toHaveBeenLastCalledWith(instance.url, combine);
    await useCases.editDeckTree(instance.url, {
      kind: "rename",
      group: group.url,
      title: { en: " Languages ", sv: "" },
    });
    expect(deps.deckRepository.editDeckTree).toHaveBeenLastCalledWith(instance.url, {
      kind: "rename",
      group: group.url,
      title: { en: "Languages" },
    });
    await expect(
      useCases.editDeckTree(instance.url, { kind: "rename", group: group.url, title: {} }),
    ).rejects.toThrow("A deck group needs a name");
    expect(deps.deckRepository.editDeckTree).toHaveBeenCalledTimes(2);
  });
  it("deck use cases delegate to the deck repository", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);

    await expect(useCases.listDecks(instance.url)).resolves.toEqual([deck]);
    expect(deps.deckRepository.listDecks).toHaveBeenCalledWith(instance.url);

    await useCases.createDeck(instance.url, { en: " Kanji N5 " });
    expect(deps.deckRepository.createDeck).toHaveBeenCalledWith(instance.url, { en: "Kanji N5" });
    // A name in the language the user stated, and only in it: no English stands in for it.
    await useCases.createDeck(instance.url, { sv: "Huvudstäder", en: " " });
    expect(deps.deckRepository.createDeck).toHaveBeenLastCalledWith(instance.url, {
      sv: "Huvudstäder",
    });
    await expect(useCases.createDeck(instance.url, { sv: " " })).rejects.toThrow(
      "A deck needs a name",
    );
    await expect(useCases.createDeck(instance.url, { "": "Kanji" })).rejects.toThrow(
      "cannot be untagged",
    );
    // Tags as the pod reads them: lower case.
    await useCases.createDeck(instance.url, { "pt-BR": "Capitais" });
    expect(deps.deckRepository.createDeck).toHaveBeenLastCalledWith(instance.url, {
      "pt-br": "Capitais",
    });

    // The name in every language it is to have: one left out is removed.
    await useCases.renameDeck(deck, { ja: " 漢字 N4 ", en: "Kanji N4" });
    expect(deps.deckRepository.renameDeck).toHaveBeenCalledWith(deck, {
      ja: "漢字 N4",
      en: "Kanji N4",
    });
    await expect(useCases.renameDeck(deck, {})).rejects.toThrow("A deck needs a name");

    await expect(useCases.setDeckDirection(deck, "bidirectional")).resolves.toEqual({
      ...deck,
      direction: "bidirectional",
    });
    expect(deps.deckRepository.saveDeck).toHaveBeenCalledWith({
      ...deck,
      direction: "bidirectional",
    });

    await useCases.removeDeck(deck);
    expect(deps.deckRepository.removeDeck).toHaveBeenCalledWith(deck);
  });
  describe("setDeckProvenance", () => {
    it("gives the deck, as its entry says now, its authors and license", async () => {
      const deps = makeDeps();
      const now = { ...deck, title: { en: "Renamed elsewhere" } };
      vi.mocked(deps.deckRepository.readDeck).mockResolvedValue(now);
      const useCases = createUseCases(deps);
      await expect(
        useCases.setDeckProvenance(deck, { authors: [" Ada "], license: CC0 }),
      ).resolves.toEqual({
        ...now,
        authors: ["Ada"],
        license: CC0,
      });
      expect(deps.deckRepository.readDeck).toHaveBeenCalledWith(deck.url);
    });

    it("reads and makes the edit again while the catalog changes elsewhere, three times in all", async () => {
      const deps = makeDeps();
      vi.mocked(deps.deckRepository.saveDeck)
        .mockRejectedValueOnce(changed())
        .mockRejectedValueOnce(changed());
      const useCases = createUseCases(deps);
      await expect(useCases.setDeckProvenance(deck, { authors: ["Ada"] })).resolves.toMatchObject({
        authors: ["Ada"],
      });
      expect(deps.deckRepository.readDeck).toHaveBeenCalledTimes(3);
      vi.mocked(deps.deckRepository.saveDeck).mockRejectedValue(changed());
      await expect(useCases.setDeckProvenance(deck, { authors: [] })).rejects.toMatchObject({
        code: "changedElsewhere",
      });
      expect(deps.deckRepository.saveDeck).toHaveBeenCalledTimes(6);
    });

    it("refuses a deck that is gone, and stops at once on another failure", async () => {
      const deps = makeDeps();
      vi.mocked(deps.deckRepository.readDeck).mockResolvedValueOnce(null);
      const useCases = createUseCases(deps);
      await expect(useCases.setDeckProvenance(deck, { authors: [] })).rejects.toMatchObject({
        code: "deckGone",
      });
      await expect(
        useCases.setDeckProvenance(deck, { authors: [], license: "https://example.org/x" }),
      ).rejects.toMatchObject({
        code: "licenseUnknown",
      });
      expect(deps.deckRepository.readDeck).toHaveBeenCalledTimes(2);
      expect(deps.deckRepository.saveDeck).not.toHaveBeenCalled();
    });
  });
});
