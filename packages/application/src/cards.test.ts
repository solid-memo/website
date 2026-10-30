// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "@solid-memo/domain/appError";
import { describe, expect, it, vi } from "vitest";
import { createUseCases } from "./useCases";
import { CARD_FORMAT_VERSION, type Card, type Deck } from "@solid-memo/domain/deck";
import type { FsrsState, ReviewState } from "@solid-memo/domain/review";
import { planCardEdit } from "@solid-memo/domain/cardBulk";
import { sm2s, instance, deck, card, libraryContent, makeDeps } from "./testing/fakePorts";

describe("cards", () => {
  describe("stateCardLanguages", () => {
    const cardOf = (id: string, content: Partial<Card>): Card => ({
      ...card,
      id,
      url: `${deck.cardsDocumentUrl}#${id}`,
      ...content,
    });

    it("re-keys only the untagged sides, leaving tagged sides and unchanged cards alone", async () => {
      const deps = makeDeps();
      vi.mocked(deps.deckRepository.listCards).mockResolvedValue([
        cardOf("both", {}),
        cardOf("back-only", { front: { ja: "火" } }),
        cardOf("tagged", { front: { ja: "木" }, back: { en: "tree" } }),
      ]);
      const useCases = createUseCases(deps);
      await expect(useCases.stateCardLanguages(deck, { front: "JA", back: "en" })).resolves.toBe(2);
      // The tag as the app stores it, lower-cased.
      expect(deps.deckRepository.stateCardLanguages).toHaveBeenCalledWith(
        deck,
        ["both", "back-only"],
        {
          front: "ja",
          back: "en",
        },
      );
      await expect(useCases.stateCardLanguages(deck, { front: "ja" })).resolves.toBe(1);
      expect(deps.deckRepository.stateCardLanguages).toHaveBeenLastCalledWith(deck, ["both"], {
        front: "ja",
      });
      expect(deps.deckLibrary.fetchLibraryDeck).not.toHaveBeenCalled();
    });

    it("skips the cards still as the deck's library release has them", async () => {
      const deps = makeDeps();
      const imported = { ...deck, sourceUrl: libraryContent.url };
      vi.mocked(deps.deckRepository.listCards).mockResolvedValue([
        cardOf("sweden", { front: { "": "Sweden" }, back: { "": "Stockholm" } }),
        cardOf("mine", { front: { "": "Norway" }, back: { "": "Oslo" } }),
      ]);
      const useCases = createUseCases(deps);
      await expect(
        useCases.stateCardLanguages(imported, { front: "en", back: "en" }),
      ).resolves.toBe(1);
      expect(deps.deckLibrary.fetchLibraryDeck).toHaveBeenCalledWith(libraryContent.url);
      expect(deps.deckRepository.stateCardLanguages).toHaveBeenCalledWith(imported, ["mine"], {
        front: "en",
        back: "en",
      });
    });

    it("writes nothing when no side is to change, or the language is no language code", async () => {
      const deps = makeDeps();
      const useCases = createUseCases(deps);
      await expect(useCases.stateCardLanguages(deck, {})).resolves.toBe(0);
      expect(deps.deckRepository.listCards).not.toHaveBeenCalled();
      vi.mocked(deps.deckRepository.listCards).mockResolvedValueOnce([
        { ...card, front: { ja: "水" }, back: { en: "water" } },
      ]);
      await expect(useCases.stateCardLanguages(deck, { front: "ja" })).resolves.toBe(0);
      await expect(
        useCases.stateCardLanguages(deck, { front: "en", back: "x-klingon" }),
      ).rejects.toThrow("“x-klingon” is not a language code.");
      expect(deps.deckRepository.listCards).toHaveBeenCalledTimes(1);
      expect(deps.deckRepository.stateCardLanguages).not.toHaveBeenCalled();
    });

    it("passes on the pod's refusal of a cards document changed since it was read", async () => {
      const deps = makeDeps();
      vi.mocked(deps.deckRepository.stateCardLanguages).mockRejectedValue(
        new AppError("changedElsewhere", { url: deck.cardsDocumentUrl }),
      );
      const useCases = createUseCases(deps);
      await expect(useCases.stateCardLanguages(deck, { front: "ja" })).rejects.toMatchObject({
        code: "changedElsewhere",
      });
    });
  });
  describe("editCards and undoCardEdit", () => {
    const tagged = (id: string, extra: Partial<Card> = {}): Card => ({
      ...card,
      id,
      url: `${deck.cardsDocumentUrl}#${id}`,
      front: { en: id },
      back: { sv: id },
      ...extra,
    });
    const one = tagged("one");
    const two = tagged("two");
    const reviewed: ReviewState = {
      cardId: "one",
      direction: "front-to-back",
      easeFactor: 2.5,
      intervalDays: 1,
      repetitions: 1,
      due: "2026-09-27",
      firstReviewedAt: "2026-09-26T10:00:00.000Z",
      lastReviewedAt: "2026-09-26T10:00:00.000Z",
      formatVersion: 2,
    };
    const changed = () => new AppError("changedElsewhere", { url: deck.cardsDocumentUrl });

    /** A deck of the two cards, its cards document at version "v1" (then v2, v3…, as it is read again). */
    function setup(cards: Card[] = [one, two]) {
      const deps = makeDeps();
      let version = 0;
      vi.mocked(deps.deckRepository.readCardsSince).mockImplementation(async () => ({
        unchanged: false as const,
        value: cards,
        version: `v${++version}`,
      }));
      vi.mocked(deps.reviewStateRepository.listReviewStates).mockResolvedValue(sm2s([reviewed]));
      return { deps, useCases: createUseCases(deps) };
    }

    it("writes the edit previewed in one write of the cards document, at the version it was planned on, then refreshes the digest", async () => {
      const { deps, useCases } = setup();
      const previewed = planCardEdit([one, two], ["one", "two"], { kind: "retire" });
      const written = await useCases.editCards(
        instance.url,
        deck,
        ["one", "two"],
        { kind: "retire" },
        previewed,
      );
      expect(written.save.map((saved) => saved.retired)).toEqual([true, true]);
      expect(deps.deckRepository.applyCardChanges).toHaveBeenCalledOnce();
      expect(deps.deckRepository.applyCardChanges).toHaveBeenCalledWith(
        deck,
        { save: written.save, remove: [] },
        { whole: true, version: "v1" },
      );
      expect(deps.reviewStateRepository.applyReviewChanges).not.toHaveBeenCalled();
      // The digest's refresh reads the reviews document as it is now.
      expect(deps.reviewStateRepository.readReviewStatesSince).toHaveBeenCalledWith(
        deck,
        undefined,
      );
    });

    it("writes the edit whole and unchecked where the pod gave the cards document no version", async () => {
      const { deps, useCases } = setup();
      vi.mocked(deps.deckRepository.readCardsSince).mockResolvedValue({
        unchanged: false,
        value: [one, two],
        version: null,
      });
      const previewed = planCardEdit([one, two], ["one"], { kind: "retire" });
      const written = await useCases.editCards(
        instance.url,
        deck,
        ["one"],
        { kind: "retire" },
        previewed,
      );
      expect(deps.deckRepository.applyCardChanges).toHaveBeenCalledWith(
        deck,
        { save: written.save, remove: [] },
        { whole: true },
      );
    });

    it("removes cards and their review states, one write each, and undoes that, the states written back", async () => {
      const { deps, useCases } = setup();
      const edit = { kind: "remove" } as const;
      const previewed = planCardEdit([one, two], ["one"], edit);
      const written = await useCases.editCards(instance.url, deck, ["one"], edit, previewed);
      expect(deps.deckRepository.applyCardChanges).toHaveBeenCalledWith(
        deck,
        { save: [], remove: ["one"] },
        { whole: true, version: "v1" },
      );
      expect(deps.reviewStateRepository.applyReviewChanges).toHaveBeenCalledWith(deck, {
        save: [],
        remove: [
          { cardId: "one", direction: "front-to-back" },
          { cardId: "one", direction: "back-to-front" },
        ],
        every: true,
      });
      expect(written.inverse.reviewSaves).toEqual([reviewed]);

      const after = setup([two]);
      await after.useCases.undoCardEdit(instance.url, deck, written);
      expect(after.deps.deckRepository.applyCardChanges).toHaveBeenCalledWith(
        deck,
        { save: [one], remove: [] },
        { whole: true, version: "v1" },
      );
      expect(after.deps.reviewStateRepository.applyReviewChanges).toHaveBeenCalledWith(deck, {
        save: [reviewed],
        remove: [],
        every: true,
      });
    });

    it("writes nothing when the edit changes no card", async () => {
      const { deps, useCases } = setup();
      const edit = { kind: "restore" } as const;
      await useCases.editCards(
        instance.url,
        deck,
        ["one"],
        edit,
        planCardEdit([one, two], ["one"], edit),
      );
      expect(deps.deckRepository.applyCardChanges).not.toHaveBeenCalled();
      expect(deps.reviewStateRepository.readReviewStatesSince).not.toHaveBeenCalled();
    });

    it("plans the edit again on a cards document changed meanwhile, and writes it while it is the one previewed", async () => {
      const { deps, useCases } = setup();
      vi.mocked(deps.deckRepository.applyCardChanges).mockRejectedValueOnce(changed());
      const edit = { kind: "retire" } as const;
      await useCases.editCards(
        instance.url,
        deck,
        ["one"],
        edit,
        planCardEdit([one, two], ["one"], edit),
      );
      expect(deps.deckRepository.applyCardChanges).toHaveBeenCalledTimes(2);
      expect(deps.deckRepository.applyCardChanges).toHaveBeenLastCalledWith(
        deck,
        expect.anything(),
        { whole: true, version: "v2" },
      );
    });

    it("plans the edit again on a cards document made since it was read as absent", async () => {
      const { deps, useCases } = setup();
      vi.mocked(deps.deckRepository.applyCardChanges).mockRejectedValueOnce(
        new AppError("createdElsewhere", { url: deck.cardsDocumentUrl }),
      );
      const edit = { kind: "retire" } as const;
      await useCases.editCards(
        instance.url,
        deck,
        ["one"],
        edit,
        planCardEdit([one, two], ["one"], edit),
      );
      expect(deps.deckRepository.applyCardChanges).toHaveBeenCalledTimes(2);
      expect(deps.deckRepository.applyCardChanges).toHaveBeenLastCalledWith(
        deck,
        expect.anything(),
        { whole: true, version: "v2" },
      );
    });

    it("gives up after three attempts on a cards document that keeps changing", async () => {
      const { deps, useCases } = setup();
      vi.mocked(deps.deckRepository.applyCardChanges).mockRejectedValue(changed());
      const edit = { kind: "retire" } as const;
      await expect(
        useCases.editCards(
          instance.url,
          deck,
          ["one"],
          edit,
          planCardEdit([one, two], ["one"], edit),
        ),
      ).rejects.toMatchObject({
        code: "changedElsewhere",
      });
      expect(deps.deckRepository.applyCardChanges).toHaveBeenCalledTimes(3);
    });

    it("stops, writing nothing, once the edit planned again is not the one previewed", async () => {
      const { deps, useCases } = setup([tagged("one", { front: { en: "edited elsewhere" } }), two]);
      const edit = { kind: "retire" } as const;
      await expect(
        useCases.editCards(
          instance.url,
          deck,
          ["one"],
          edit,
          planCardEdit([one, two], ["one"], edit),
        ),
      ).rejects.toMatchObject({
        code: "changedElsewhere",
      });
      expect(deps.deckRepository.applyCardChanges).not.toHaveBeenCalled();
    });

    it("passes on any other failure at once", async () => {
      const { deps, useCases } = setup();
      vi.mocked(deps.deckRepository.applyCardChanges).mockRejectedValue(new Error("offline"));
      const edit = { kind: "retire" } as const;
      await expect(
        useCases.editCards(
          instance.url,
          deck,
          ["one"],
          edit,
          planCardEdit([one, two], ["one"], edit),
        ),
      ).rejects.toThrow("offline");
      expect(deps.deckRepository.applyCardChanges).toHaveBeenCalledOnce();
    });

    it("keeps an edit made when the digest cannot be refreshed", async () => {
      const { deps, useCases } = setup();
      vi.mocked(deps.reviewStateRepository.readReviewStatesSince).mockRejectedValue(
        new Error("offline"),
      );
      const edit = { kind: "retire" } as const;
      await expect(
        useCases.editCards(
          instance.url,
          deck,
          ["one"],
          edit,
          planCardEdit([one, two], ["one"], edit),
        ),
      ).resolves.toMatchObject({
        save: [expect.objectContaining({ id: "one", retired: true })],
      });
    });

    it("undoes an edit only while the cards are as it left them", async () => {
      const edit = { kind: "retire" } as const;
      const plan = planCardEdit([one, two], ["one"], edit);
      const { deps, useCases } = setup([
        tagged("one", { retired: true, front: { en: "edited elsewhere" } }),
        two,
      ]);
      await expect(useCases.undoCardEdit(instance.url, deck, plan)).rejects.toMatchObject({
        code: "changedElsewhere",
      });
      expect(deps.deckRepository.applyCardChanges).not.toHaveBeenCalled();
      const asLeft = setup([plan.save[0]!, two]);
      await asLeft.useCases.undoCardEdit(instance.url, deck, plan);
      expect(asLeft.deps.deckRepository.applyCardChanges).toHaveBeenCalledWith(
        deck,
        { save: [one], remove: [] },
        { whole: true, version: "v1" },
      );
    });
  });
  it("listDeckReviewStates reads the deck's review states as stored", async () => {
    const deps = makeDeps();
    const stored: ReviewState[] = [
      {
        cardId: "card-1",
        direction: "front-to-back",
        easeFactor: 2.5,
        intervalDays: 1,
        repetitions: 1,
        due: "2026-09-27",
        firstReviewedAt: "2026-09-26T10:00:00.000Z",
        lastReviewedAt: "2026-09-26T10:00:00.000Z",
        formatVersion: 2,
      },
    ];
    vi.mocked(deps.reviewStateRepository.listReviewStates).mockResolvedValue(sm2s(stored));
    const useCases = createUseCases(deps);
    await expect(useCases.listDeckReviewStates(deck)).resolves.toEqual(sm2s(stored));
    expect(deps.reviewStateRepository.listReviewStates).toHaveBeenCalledWith(deck);
  });
  it("card use cases delegate to the deck repository", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);

    await expect(useCases.listCards(deck)).resolves.toEqual([card]);
    expect(deps.deckRepository.listCards).toHaveBeenCalledWith(deck);

    await useCases.addCard(deck, { front: { ja: " 火 " }, back: { en: " fire " } });
    expect(deps.deckRepository.addCard).toHaveBeenCalledWith(deck, {
      front: { ja: "火" },
      back: { en: "fire" },
    });

    // The front's untagged text, untouched, stays as it was saved.
    await useCases.updateCard(deck, card, {
      front: { "": " 水 " },
      back: { en: " water (mizu) " },
      frontImageUrl: " https://img.example/water.png ",
      backImageUrl: "",
    });
    expect(deps.deckRepository.updateCard).toHaveBeenCalledWith(deck, card, {
      front: { "": "水" },
      back: { en: "water (mizu)" },
      frontImageUrl: "https://img.example/water.png",
    });

    await useCases.removeCard(deck, card);
    expect(deps.deckRepository.removeCard).toHaveBeenCalledWith(deck, card);
  });
  it("addCard and updateCard reject incomplete content without writing", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await expect(useCases.addCard(deck, { front: {}, back: { en: "fire" } })).rejects.toThrow(
      "The front needs text or an image.",
    );
    await expect(
      useCases.updateCard(deck, card, {
        front: { en: "f" },
        back: { en: "b" },
        backImageUrl: "javascript:alert(1)",
      }),
    ).rejects.toThrow("The back image must be an http(s) URL.");
    // Text in no stated language is never written anew.
    await expect(
      useCases.addCard(deck, { front: { "": "火" }, back: { en: "fire" } }),
    ).rejects.toThrow("Choose the language of the front.");
    await expect(
      useCases.updateCard(deck, card, { front: { "": "水" }, back: { "": "water!" } }),
    ).rejects.toThrow("Choose the language of the back.");
    expect(deps.deckRepository.addCard).not.toHaveBeenCalled();
    expect(deps.deckRepository.updateCard).not.toHaveBeenCalled();
  });
  describe("resetCards and rescheduleCards", () => {
    const studied = (
      cardId: string,
      direction: ReviewState["direction"] = "front-to-back",
    ): ReviewState => ({
      cardId,
      direction,
      easeFactor: 2.5,
      intervalDays: 6,
      repetitions: 2,
      due: "2026-10-01",
      firstReviewedAt: "2026-09-20T10:00:00.000Z",
      lastReviewedAt: "2026-09-28T09:00:00.000Z",
      formatVersion: 2,
      previous: {
        easeFactor: 2.5,
        intervalDays: 1,
        repetitions: 1,
        due: "2026-09-27",
        lastReviewedAt: "2026-09-26T10:00:00.000Z",
      },
    });

    /** Card one's FSRS-6 state, front to back, with its snapshot. */
    const fsrsOne: FsrsState = {
      cardId: "one",
      direction: "front-to-back",
      stability: 7.5,
      difficulty: 5,
      due: "2026-10-04",
      firstReviewedAt: "2026-09-20T10:00:00.000Z",
      lastReviewedAt: "2026-09-28T09:00:00.000Z",
      formatVersion: 1,
      previous: {
        stability: 2,
        difficulty: 5.2,
        due: "2026-09-27",
        lastReviewedAt: "2026-09-26T10:00:00.000Z",
      },
    };

    function setup() {
      const deps = makeDeps();
      vi.mocked(deps.reviewStateRepository.listReviewStates).mockResolvedValue({
        sm2: [studied("one"), studied("one", "back-to-front"), studied("two")],
        fsrs: [fsrsOne],
      });
      return { deps, useCases: createUseCases(deps) };
    }

    it("forgets the cards' states in one write of the reviews document, then refreshes the digest", async () => {
      const { deps, useCases } = setup();
      await expect(useCases.resetCards(instance.url, deck, ["one", "new"])).resolves.toBe(1);
      // With every, the keys take FSRS-6's states along.
      expect(deps.reviewStateRepository.applyReviewChanges).toHaveBeenCalledExactlyOnceWith(deck, {
        save: [],
        remove: [
          { cardId: "one", direction: "front-to-back" },
          { cardId: "one", direction: "back-to-front" },
        ],
        fsrs: { save: [], remove: [] },
        every: true,
      });
      expect(deps.reviewStateRepository.readReviewStatesSince).toHaveBeenCalledWith(
        deck,
        undefined,
      );
    });

    it("forgets an FSRS-6 state without an SM-2 state beside it", async () => {
      const { deps, useCases } = setup();
      vi.mocked(deps.reviewStateRepository.listReviewStates).mockResolvedValue({
        sm2: [],
        fsrs: [{ ...fsrsOne, cardId: "three" }],
      });
      await expect(useCases.resetCards(instance.url, deck, ["three"])).resolves.toBe(1);
      expect(deps.reviewStateRepository.applyReviewChanges).toHaveBeenCalledExactlyOnceWith(deck, {
        save: [],
        remove: [{ cardId: "three", direction: "front-to-back" }],
        fsrs: { save: [], remove: [] },
        every: true,
      });
    });

    it("forgets one direction when asked", async () => {
      const { deps, useCases } = setup();
      await expect(useCases.resetCards(instance.url, deck, ["one"], "back-to-front")).resolves.toBe(
        1,
      );
      expect(deps.reviewStateRepository.applyReviewChanges).toHaveBeenCalledWith(deck, {
        save: [],
        remove: [{ cardId: "one", direction: "back-to-front" }],
        fsrs: { save: [], remove: [] },
        every: true,
      });
    });

    it("writes nothing for cards never studied", async () => {
      const { deps, useCases } = setup();
      await expect(useCases.resetCards(instance.url, deck, ["new"])).resolves.toBe(0);
      await expect(
        useCases.rescheduleCards(instance.url, deck, ["new"], "2026-10-12"),
      ).resolves.toBe(0);
      expect(deps.reviewStateRepository.applyReviewChanges).not.toHaveBeenCalled();
      expect(deps.reviewStateRepository.readReviewStatesSince).not.toHaveBeenCalled();
    });

    it("sets the cards due on the day in one write, their snapshot dropped", async () => {
      const { deps, useCases } = setup();
      await expect(
        useCases.rescheduleCards(instance.url, deck, ["one", "two"], "2026-10-12", "front-to-back"),
      ).resolves.toBe(2);
      const { previous: _one, ...one } = studied("one");
      const { previous: _two, ...two } = studied("two");
      const { previous: _fsrs, ...fsrsLeft } = fsrsOne;
      expect(deps.reviewStateRepository.applyReviewChanges).toHaveBeenCalledExactlyOnceWith(deck, {
        save: [
          { ...one, due: "2026-10-12" },
          { ...two, due: "2026-10-12" },
        ],
        remove: [],
        fsrs: { save: [{ ...fsrsLeft, due: "2026-10-12" }], remove: [] },
        every: true,
      });
    });

    it("refuses a day that is no date before reading anything", async () => {
      const { deps, useCases } = setup();
      await expect(
        useCases.rescheduleCards(instance.url, deck, ["one"], "2026-02-30"),
      ).rejects.toMatchObject({ code: "dueDayInvalid" });
      expect(deps.reviewStateRepository.listReviewStates).not.toHaveBeenCalled();
    });

    it("keeps an edit made when the digest cannot be refreshed", async () => {
      const { deps, useCases } = setup();
      vi.mocked(deps.reviewStateRepository.readReviewStatesSince).mockRejectedValue(
        new Error("offline"),
      );
      await expect(useCases.resetCards(instance.url, deck, ["two"])).resolves.toBe(1);
    });
  });
  describe("transferCards", () => {
    const target: Deck = {
      ...deck,
      id: "deck-2",
      url: `${instance.url}catalog.ttl#deck-2`,
      cardsDocumentUrl: `${instance.url}decks/deck-2.ttl`,
      reviewsDocumentUrl: `${instance.url}reviews/deck-2.ttl`,
    };
    const one: Card = {
      ...card,
      id: "one",
      url: `${deck.cardsDocumentUrl}#one`,
      front: { en: "one" },
      back: { sv: "ett" },
    };
    const two: Card = {
      ...card,
      id: "two",
      url: `${deck.cardsDocumentUrl}#two`,
      front: { en: "two" },
      back: { sv: "två" },
    };
    const studied: ReviewState = {
      cardId: "one",
      direction: "front-to-back",
      easeFactor: 2.5,
      intervalDays: 6,
      repetitions: 2,
      due: "2026-10-01",
      firstReviewedAt: "2026-09-20T10:00:00.000Z",
      lastReviewedAt: "2026-09-28T09:00:00.000Z",
      formatVersion: 2,
    };
    const studiedFsrs: FsrsState = {
      cardId: "one",
      direction: "front-to-back",
      stability: 6.5,
      difficulty: 5,
      due: "2026-10-03",
      firstReviewedAt: studied.firstReviewedAt,
      lastReviewedAt: studied.lastReviewedAt,
      formatVersion: 1,
    };
    const changed = () => new AppError("changedElsewhere", { url: deck.cardsDocumentUrl });
    const { url: _url, formatVersion: _formatVersion, ...oneWritten } = one;

    /** The source holds one and two, the target what `held` says; each cards document read at a new version. */
    function setup(held: Card[] = []) {
      const deps = makeDeps();
      let version = 0;
      vi.mocked(deps.deckRepository.readCardsSince).mockImplementation(async (d) => ({
        unchanged: false as const,
        value: d.url === deck.url ? [one, two] : held,
        version: `v${++version}`,
      }));
      vi.mocked(deps.reviewStateRepository.listReviewStates).mockImplementation(async (d) =>
        d.url === deck.url ? { sm2: [studied], fsrs: [studiedFsrs] } : sm2s([]),
      );
      return { deps, useCases: createUseCases(deps) };
    }

    it("moves cards with their progress: the target written first, then the source, then both decks' digests", async () => {
      const { deps, useCases } = setup();
      const plan = await useCases.transferCards(instance.url, deck, target, ["one"], {
        mode: "move",
        keepProgress: true,
      });
      expect(plan.cards).toEqual([{ from: "one", to: "one", present: false }]);
      const { applyCardChanges } = deps.deckRepository;
      expect(vi.mocked(applyCardChanges).mock.calls).toEqual([
        [target, { save: [oneWritten], remove: [] }, { whole: true, version: "v2" }],
        [deck, { save: [], remove: ["one"] }, { whole: true, version: "v1" }],
      ]);
      expect(vi.mocked(deps.reviewStateRepository.applyReviewChanges).mock.calls).toEqual([
        [
          target,
          {
            save: [studied],
            remove: [],
            fsrs: { save: [studiedFsrs], remove: [] },
            every: true,
          },
        ],
        // The source's every state of the card goes: its FSRS-6 one too.
        [deck, { save: [], remove: [{ cardId: "one", direction: "front-to-back" }], every: true }],
      ]);
      expect(deps.reviewStateRepository.readReviewStatesSince).toHaveBeenCalledWith(
        target,
        undefined,
      );
      expect(deps.reviewStateRepository.readReviewStatesSince).toHaveBeenCalledWith(
        deck,
        undefined,
      );
    });

    it("copies cards without progress, leaving the source and its digest as they are", async () => {
      const { deps, useCases } = setup();
      await useCases.transferCards(instance.url, deck, target, ["two"], {
        mode: "copy",
        keepProgress: false,
      });
      expect(deps.deckRepository.applyCardChanges).toHaveBeenCalledExactlyOnceWith(
        target,
        { save: [expect.objectContaining({ id: "two" })], remove: [] },
        { whole: true, version: "v2" },
      );
      expect(deps.reviewStateRepository.applyReviewChanges).not.toHaveBeenCalled();
      expect(deps.reviewStateRepository.readReviewStatesSince).not.toHaveBeenCalledWith(
        deck,
        undefined,
      );
    });

    it("moves a card never studied without a write of either reviews document", async () => {
      const { deps, useCases } = setup();
      await useCases.transferCards(instance.url, deck, target, ["two"], {
        mode: "move",
        keepProgress: true,
      });
      expect(deps.deckRepository.applyCardChanges).toHaveBeenCalledTimes(2);
      expect(deps.reviewStateRepository.applyReviewChanges).not.toHaveBeenCalled();
    });

    it("finishes a move stopped after the target was written, writing no card twice", async () => {
      const { deps, useCases } = setup([{ ...one, url: `${target.cardsDocumentUrl}#one` }]);
      const plan = await useCases.transferCards(instance.url, deck, target, ["one"], {
        mode: "move",
        keepProgress: false,
      });
      expect(plan.cards).toEqual([{ from: "one", to: "one", present: true }]);
      expect(deps.deckRepository.applyCardChanges).toHaveBeenCalledExactlyOnceWith(
        deck,
        { save: [], remove: ["one"] },
        { whole: true, version: "v1" },
      );
    });

    it("removes the source's states before its cards, so a move stopped between is finished by making it again", async () => {
      const { deps, useCases } = setup();
      vi.mocked(deps.deckRepository.applyCardChanges)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("offline"));
      await expect(
        useCases.transferCards(instance.url, deck, target, ["one"], {
          mode: "move",
          keepProgress: true,
        }),
      ).rejects.toThrow("offline");
      const [, sourceReviews] = vi.mocked(deps.reviewStateRepository.applyReviewChanges).mock
        .invocationCallOrder;
      const [, sourceCards] = vi.mocked(deps.deckRepository.applyCardChanges).mock
        .invocationCallOrder;
      expect(sourceReviews).toBeLessThan(sourceCards!);

      // The source keeps the card without progress; the target has both.
      const again = setup([{ ...one, url: `${target.cardsDocumentUrl}#one` }]);
      vi.mocked(again.deps.reviewStateRepository.listReviewStates).mockImplementation(async (d) =>
        sm2s(d.url === deck.url ? [] : [studied]),
      );
      const plan = await again.useCases.transferCards(instance.url, deck, target, ["one"], {
        mode: "move",
        keepProgress: true,
      });
      expect(plan.cards).toEqual([{ from: "one", to: "one", present: true }]);
      expect(again.deps.deckRepository.applyCardChanges).toHaveBeenCalledExactlyOnceWith(
        deck,
        { save: [], remove: ["one"] },
        { whole: true, version: "v1" },
      );
      expect(again.deps.reviewStateRepository.applyReviewChanges).not.toHaveBeenCalled();
    });

    it("plans the transfer again when a cards document was made since it was read as absent", async () => {
      const { deps, useCases } = setup();
      vi.mocked(deps.deckRepository.applyCardChanges).mockRejectedValueOnce(
        new AppError("createdElsewhere", { url: target.cardsDocumentUrl }),
      );
      await useCases.transferCards(instance.url, deck, target, ["one"], {
        mode: "copy",
        keepProgress: true,
      });
      expect(deps.deckRepository.applyCardChanges).toHaveBeenCalledTimes(2);
      expect(deps.deckRepository.applyCardChanges).toHaveBeenLastCalledWith(
        target,
        { save: [oneWritten], remove: [] },
        { whole: true, version: "v4" },
      );
    });

    it("plans the transfer again when a document changed meanwhile, then gives up", async () => {
      const { deps, useCases } = setup();
      vi.mocked(deps.deckRepository.applyCardChanges).mockRejectedValueOnce(changed());
      await useCases.transferCards(instance.url, deck, target, ["one"], {
        mode: "copy",
        keepProgress: true,
      });
      expect(deps.deckRepository.applyCardChanges).toHaveBeenLastCalledWith(
        target,
        { save: [oneWritten], remove: [] },
        { whole: true, version: "v4" },
      );

      vi.mocked(deps.deckRepository.applyCardChanges).mockRejectedValue(changed());
      await expect(
        useCases.transferCards(instance.url, deck, target, ["one"], {
          mode: "copy",
          keepProgress: true,
        }),
      ).rejects.toMatchObject({ code: "changedElsewhere" });
      expect(deps.deckRepository.applyCardChanges).toHaveBeenCalledTimes(5);
    });

    it("passes on any other failure at once", async () => {
      const { deps, useCases } = setup();
      vi.mocked(deps.deckRepository.applyCardChanges).mockRejectedValueOnce(new Error("offline"));
      await expect(
        useCases.transferCards(instance.url, deck, target, ["one"], {
          mode: "move",
          keepProgress: true,
        }),
      ).rejects.toThrow("offline");
      expect(deps.deckRepository.applyCardChanges).toHaveBeenCalledOnce();
    });

    it("keeps a transfer made when the digest cannot be refreshed", async () => {
      const { deps, useCases } = setup();
      vi.mocked(deps.reviewStateRepository.readReviewStatesSince).mockRejectedValue(
        new Error("offline"),
      );
      await expect(
        useCases.transferCards(instance.url, deck, target, ["one"], {
          mode: "move",
          keepProgress: false,
        }),
      ).resolves.toMatchObject({ missing: [] });
    });

    it("writes nothing when no card is left to transfer", async () => {
      const { deps, useCases } = setup();
      await expect(
        useCases.transferCards(instance.url, deck, target, ["gone"], {
          mode: "move",
          keepProgress: true,
        }),
      ).resolves.toMatchObject({ missing: ["gone"] });
      expect(deps.deckRepository.applyCardChanges).not.toHaveBeenCalled();
      expect(deps.reviewStateRepository.applyReviewChanges).not.toHaveBeenCalled();
    });

    it("refuses a transfer to the deck itself before reading anything", async () => {
      const { deps, useCases } = setup();
      await expect(
        useCases.transferCards(instance.url, deck, deck, ["one"], {
          mode: "move",
          keepProgress: true,
        }),
      ).rejects.toMatchObject({ code: "cardTransferSameDeck" });
      expect(deps.deckRepository.readCardsSince).not.toHaveBeenCalled();
    });

    it.each([
      [
        "move",
        "cards",
        { cardsDocumentUrl: "https://ALICE.example/solid-memo/main/decks/./deck-1.ttl" },
      ],
      ["copy", "cards", { cardsDocumentUrl: deck.cardsDocumentUrl }],
      ["move", "reviews", { reviewsDocumentUrl: deck.reviewsDocumentUrl }],
      [
        "copy",
        "reviews",
        { reviewsDocumentUrl: "https://alice.example:443/solid-memo/main/reviews/deck-1.ttl" },
      ],
      [
        "move",
        "cards",
        { cardsDocumentUrl: "https://alice.example/solid-memo/main/%64ecks/deck-1.ttl" },
      ],
      ["copy", "reviews", { cardsDocumentUrl: deck.reviewsDocumentUrl }],
      [
        "move",
        "cards",
        { cardsDocumentUrl: "https://alice:secret@alice.example/solid-memo/main/decks/deck-1.ttl" },
      ],
      [
        "copy",
        "reviews",
        { reviewsDocumentUrl: "https://bob@alice.example/solid-memo/main/reviews/deck-1.ttl" },
      ],
    ] as const)(
      "refuses a %s to another entry over the deck's %s document, writing nothing",
      async (mode, _document, shared) => {
        const { deps, useCases } = setup();
        await expect(
          useCases.transferCards(instance.url, deck, { ...target, ...shared }, ["one"], {
            mode,
            keepProgress: true,
          }),
        ).rejects.toMatchObject({ code: "cardTransferSameDeck" });
        expect(deps.deckRepository.readCardsSince).not.toHaveBeenCalled();
        expect(deps.deckRepository.applyCardChanges).not.toHaveBeenCalled();
        expect(deps.reviewStateRepository.applyReviewChanges).not.toHaveBeenCalled();
      },
    );
  });
  describe("deck files", () => {
    const fileDeck: Deck = {
      ...deck,
      id: "deck-x",
      url: "https://bob.example/memo/catalog.ttl#deck-x",
      cardsDocumentUrl: "https://bob.example/memo/decks/deck-x.ttl",
      reviewsDocumentUrl: "https://bob.example/memo/reviews/deck-x.ttl",
      completedChapters: ["https://lib.example/c.ttl#ch1"],
    };
    const state: ReviewState = {
      cardId: "card-1",
      direction: "front-to-back",
      easeFactor: 2.5,
      intervalDays: 1,
      repetitions: 1,
      due: "2026-09-29",
      firstReviewedAt: "2026-09-28T10:00:00.000Z",
      lastReviewedAt: "2026-09-28T10:00:00.000Z",
      formatVersion: 2,
    };
    const fsrsState: FsrsState = {
      cardId: "card-1",
      direction: "front-to-back",
      stability: 2.3,
      difficulty: 2.1,
      due: "2026-09-30",
      firstReviewedAt: state.firstReviewedAt,
      lastReviewedAt: state.lastReviewedAt,
      formatVersion: 1,
    };
    const file = {
      name: "kanji.ttl",
      format: "turtle" as const,
      content: {
        deck: fileDeck,
        cards: [{ ...card, url: `${fileDeck.cardsDocumentUrl}#card-1` }],
        reviews: [state],
        fsrsReviews: [fsrsState],
        upgraded: [],
        dropped: [],
      },
    };

    function withFiles(picked: { name: string; text: string } | null = null) {
      const deckArchive = {
        exportDeck: vi.fn(async () => "<#a> <#b> <#c> ."),
        readDeckFile: vi.fn(async () => file.content),
      };
      const fileExchange = { save: vi.fn(), open: vi.fn(async () => picked) };
      const deps = makeDeps();
      return {
        deps,
        deckArchive,
        fileExchange,
        useCases: createUseCases({ ...deps, deckArchive, fileExchange }),
      };
    }

    it("saves a deck as a file named after it", async () => {
      const { deckArchive, fileExchange, useCases } = withFiles();
      await useCases.exportDeckFile(deck, { format: "jsonld", withProgress: true });
      expect(deckArchive.exportDeck).toHaveBeenCalledWith(deck, {
        format: "jsonld",
        withProgress: true,
      });
      expect(fileExchange.save).toHaveBeenCalledWith(
        "kanji-n5.jsonld",
        "application/ld+json",
        "<#a> <#b> <#c> .",
      );
    });

    it("reads the file the user picks, in the format its name says, at a base of its own", async () => {
      const { deckArchive, fileExchange, useCases } = withFiles({
        name: "kanji.jsonld",
        text: "{}",
      });
      expect(await useCases.openDeckFile()).toEqual({
        name: "kanji.jsonld",
        format: "jsonld",
        content: file.content,
      });
      expect(fileExchange.open).toHaveBeenCalledWith(
        ".ttl,.jsonld,.json,text/turtle,application/ld+json",
      );
      expect(deckArchive.readDeckFile).toHaveBeenCalledWith(
        "{}",
        "jsonld",
        "https://file.solid-memo.invalid/kanji.jsonld",
      );
    });

    it("reads nothing when the user picks no file", async () => {
      const { deckArchive, useCases } = withFiles(null);
      expect(await useCases.openDeckFile()).toBeNull();
      expect(deckArchive.readDeckFile).not.toHaveBeenCalled();
    });

    it("refuses a file in a newer format, as the archive does", async () => {
      const { deckArchive, useCases } = withFiles({ name: "new.ttl", text: "" });
      deckArchive.readDeckFile.mockRejectedValueOnce(new AppError("deckFileTooNew"));
      await expect(useCases.openDeckFile()).rejects.toMatchObject({ code: "deckFileTooNew" });
    });

    it("imports the deck: its cards where none are yet, its progress, then its entry, then the digest", async () => {
      const { deps, useCases } = withFiles();
      const imported = await useCases.importDeckFile(instance.url, file, { withProgress: true });
      expect(imported).toMatchObject({
        id: "deck-x",
        url: `${instance.url}catalog.ttl#deck-x`,
        cardsDocumentUrl: `${instance.url}decks/deck-x.ttl`,
        completedChapters: fileDeck.completedChapters,
      });
      expect(deps.deckRepository.applyCardChanges).toHaveBeenCalledWith(
        imported,
        {
          save: [
            {
              ...card,
              url: `${instance.url}decks/deck-x.ttl#card-1`,
              formatVersion: CARD_FORMAT_VERSION,
            },
          ],
          remove: [],
        },
        { whole: true, version: "absent" },
      );
      expect(deps.reviewStateRepository.applyReviewChanges).toHaveBeenCalledWith(imported, {
        save: [state],
        remove: [],
        fsrs: { save: [fsrsState], remove: [] },
      });
      expect(deps.deckRepository.registerDeck).toHaveBeenCalledWith(imported);
      const order = (mock: unknown) =>
        (mock as { mock: { invocationCallOrder: number[] } }).mock.invocationCallOrder[0]!;
      expect(order(deps.deckRepository.applyCardChanges)).toBeLessThan(
        order(deps.reviewStateRepository.applyReviewChanges),
      );
      expect(order(deps.reviewStateRepository.applyReviewChanges)).toBeLessThan(
        order(deps.deckRepository.registerDeck),
      );
      expect(deps.reviewStateRepository.readReviewStatesSince).toHaveBeenCalledWith(
        imported,
        undefined,
      );
    });

    it("imports no progress unless asked, and a digest it cannot bring up to date stops nothing", async () => {
      const { deps, useCases } = withFiles();
      vi.mocked(deps.deckRepository.readCardsSince).mockRejectedValueOnce(new Error("offline"));
      const imported = await useCases.importDeckFile(instance.url, file, { withProgress: false });
      expect(imported.completedChapters).toBeUndefined();
      expect(deps.reviewStateRepository.applyReviewChanges).not.toHaveBeenCalled();
    });

    it("gives the deck a fresh id when a cards document is at its URL already, once", async () => {
      const { deps, useCases } = withFiles();
      vi.mocked(deps.deckRepository.applyCardChanges).mockRejectedValueOnce(
        new AppError("createdElsewhere"),
      );
      const imported = await useCases.importDeckFile(instance.url, file, { withProgress: true });
      expect(imported.id).toBe("deck-0f3a");
      expect(deps.deckRepository.applyCardChanges).toHaveBeenCalledTimes(2);
      vi.mocked(deps.deckRepository.applyCardChanges).mockRejectedValue(
        new AppError("createdElsewhere"),
      );
      await expect(
        useCases.importDeckFile(instance.url, file, { withProgress: true }),
      ).rejects.toMatchObject({ code: "createdElsewhere" });
    });

    it("stops at any other failure of the cards' write, writing nothing more", async () => {
      const { deps, useCases } = withFiles();
      vi.mocked(deps.deckRepository.applyCardChanges).mockRejectedValueOnce(new Error("offline"));
      await expect(
        useCases.importDeckFile(instance.url, file, { withProgress: true }),
      ).rejects.toThrow("offline");
      expect(deps.deckRepository.registerDeck).not.toHaveBeenCalled();
    });
  });
});
