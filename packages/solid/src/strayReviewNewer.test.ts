// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * A review state of a card that a newer version of the app wrote,
 * beside the state this app reads: a removal of every state of the card
 * (a card moved or removed, a card set back to new) leaves it as it is,
 * as this app never removes one and the write does not need it gone,
 * and removes the others (GHSA-7x88-hfwx-whvj). A move made with it in
 * the source's or the target's reviews document is done in full, not
 * stopped after the target is written. The state read of the card, when
 * a newer version wrote it, is refused, and a move refused for it writes
 * nothing, so it never stops half way; so does a bulk delete of the card.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Card, Deck } from "@solid-memo/domain/deck";
import { planCardEdit } from "@solid-memo/domain/cardBulk";
import { getSolidDatasetOrNull } from "./datasets";
import { getThing, type Dataset } from "./client/rdf";
import { POD, SESSION, siteOf, type Site, wiredApp } from "./testing/wiredApp";
import { SM } from "./vocab";

const NOW = new Date("2026-11-10T12:00:00.000Z");
const INSTANCE = `${POD}solid-memo/main/`;
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

let site: Site;
beforeAll(() => {
  site = siteOf();
});

/** A user's instance with decks A (two studied cards) and B (one card), over the app wired to it. */
async function world() {
  const app = wiredApp({ now: () => NOW, site });
  const u: UseCases = app.useCases;
  await app.fetch(`${POD}profile/card`, {
    method: "PUT",
    headers: { "Content-Type": "text/turtle" },
    body: `<#me> <http://xmlns.com/foaf/0.1/name> "Alice" ; <http://www.w3.org/ns/pim/space#storage> <${POD}> .`,
  });
  await u.createInstance(SESSION, {
    containerUrl: INSTANCE,
    name: "Main",
    registrationTarget: "private",
  });
  const a = await u.createDeck(INSTANCE, { en: "A" });
  const cards: Card[] = [
    await u.addCard(a, { front: { en: "Sweden" }, back: { en: "Stockholm" } }),
    await u.addCard(a, { front: { en: "Norway" }, back: { en: "Oslo" } }),
  ];
  const queue = await u.getStudyQueue(INSTANCE, a, NOW);
  for (const { id } of cards) {
    const prompt = queue.newPrompts.find(({ card }) => card.id === id)!;
    await u.recordReview(INSTANCE, a, prompt, 4, NOW);
  }
  const b = await u.createDeck(INSTANCE, { en: "B" });
  await u.addCard(b, { front: { en: "Finland" }, back: { en: "Helsinki" } });
  await app.settled();
  const decks = await u.listDecks(INSTANCE);
  const deck = (url: string) => decks.find((one) => one.url === url)!;
  /** A state of the card at `cardUrl` in the deck's reviews document, stamped with format 99. */
  const plant = async (on: Deck, cardUrl: string) => {
    const subject = `${on.reviewsDocumentUrl}#newer`;
    const response = await app.fetch(on.reviewsDocumentUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/sparql-update" },
      body: `INSERT DATA {
<${subject}> <${RDF_TYPE}> <${SM.ReviewState}> .
<${subject}> <${SM.reviewOf}> <${cardUrl}> .
<${subject}> <${SM.formatVersion}> 99 .
};`,
    });
    expect(response.ok).toBe(true);
    return subject;
  };
  const reviews = async (on: Deck): Promise<Dataset> =>
    (await getSolidDatasetOrNull(on.reviewsDocumentUrl, app.fetch))!;
  /** The states of the card `id` in `from`'s reviews document, put in `to`'s as they are, naming `to`'s documents. */
  const copyStates = async (from: Deck, to: Deck, id: string) => {
    const text = await (await app.fetch(from.reviewsDocumentUrl)).text();
    const lines = text
      .split("\n")
      .filter((line) => line.startsWith(`<${from.reviewsDocumentUrl}#${id}`))
      .map((line) =>
        line
          .replaceAll(from.reviewsDocumentUrl, to.reviewsDocumentUrl)
          .replaceAll(from.cardsDocumentUrl, to.cardsDocumentUrl),
      );
    expect(lines.length).toBeGreaterThan(0);
    const response = await app.fetch(to.reviewsDocumentUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/sparql-update" },
      body: `INSERT DATA {\n${lines.join("\n")}\n};`,
    });
    expect(response.ok).toBe(true);
  };
  /** The deck's reviews document with the states of the card `id` stamped with format 99. */
  const restamp = async (on: Deck, id: string) => {
    const text = await (await app.fetch(on.reviewsDocumentUrl)).text();
    const stamped = text
      .split("\n")
      .map((line) =>
        line.startsWith(`<${on.reviewsDocumentUrl}#${id}`) && line.includes(SM.formatVersion)
          ? line.replace(/> \S+ \.$/, "> 99 .")
          : line,
      )
      .join("\n");
    expect(stamped).not.toBe(text);
    const response = await app.fetch(on.reviewsDocumentUrl, {
      method: "PUT",
      headers: { "Content-Type": "text/turtle" },
      body: stamped,
    });
    expect(response.ok).toBe(true);
  };
  /** The ids of the cards of each deck. */
  const held = async () => ({
    a: (await u.listCards(deck(a.url))).map(({ id }) => id),
    b: (await u.listCards(deck(b.url))).map(({ id }) => id),
  });
  return {
    u,
    a: deck(a.url),
    b: deck(b.url),
    cards,
    plant,
    reviews,
    copyStates,
    restamp,
    held,
    fetch: app.fetch,
  };
}

describe("a review state a newer version wrote", () => {
  it("is left in the source's reviews document by a move, which is done in full", async () => {
    const { u, a, b, cards, plant, reviews } = await world();
    const moved = cards[0]!;
    const newer = await plant(a, `${a.cardsDocumentUrl}#${moved.id}`);

    const plan = await u.transferCards(
      INSTANCE,
      a,
      b,
      [moved.id],
      { mode: "move", keepProgress: true },
      SESSION.webId,
    );

    const to = plan.cards[0]!.to;
    expect((await u.listCards(a)).map(({ id }) => id)).toEqual([cards[1]!.id]);
    expect((await u.listCards(b)).map(({ id }) => id)).toContain(to);
    const source = await reviews(a);
    expect(getThing(source, newer)).not.toBeNull();
    expect((await u.listDeckReviewStates(a)).sm2.map(({ cardId }) => cardId)).toEqual([
      cards[1]!.id,
    ]);
    expect((await u.listDeckReviewStates(b)).sm2.map(({ cardId }) => cardId)).toEqual([to]);
  });

  it("is left in the target's reviews document by a move that clears the card's state there", async () => {
    const { u, a, b, cards, plant, reviews, copyStates } = await world();
    const moved = cards[0]!;
    // B holds a state of a card of that id it does not have, and a newer one beside it.
    await copyStates(a, b, moved.id);
    expect((await u.listDeckReviewStates(b)).sm2.map(({ cardId }) => cardId)).toEqual([moved.id]);
    const newer = await plant(b, `${b.cardsDocumentUrl}#${moved.id}`);

    const plan = await u.transferCards(
      INSTANCE,
      a,
      b,
      [moved.id],
      { mode: "move", keepProgress: false },
      SESSION.webId,
    );

    expect(plan.target.reviewRemovals).toHaveLength(1);
    expect((await u.listCards(a)).map(({ id }) => id)).toEqual([cards[1]!.id]);
    expect((await u.listCards(b)).map(({ id }) => id)).toContain(moved.id);
    expect(getThing(await reviews(b), newer)).not.toBeNull();
    expect((await u.listDeckReviewStates(b)).sm2).toEqual([]);
  });

  it("is left by a bulk delete, which removes the card and its other states", async () => {
    const { u, a, cards, plant, reviews } = await world();
    const removed = cards[0]!;
    const newer = await plant(a, `${a.cardsDocumentUrl}#${removed.id}`);
    const edit = { kind: "remove" } as const;
    const previewed = planCardEdit(
      await u.listCards(a),
      [removed.id],
      edit,
      (await u.listDeckReviewStates(a)).sm2,
    );

    await u.editCards(INSTANCE, a, [removed.id], edit, previewed);

    expect((await u.listCards(a)).map(({ id }) => id)).toEqual([cards[1]!.id]);
    expect(getThing(await reviews(a), newer)).not.toBeNull();
    expect((await u.listDeckReviewStates(a)).sm2.map(({ cardId }) => cardId)).toEqual([
      cards[1]!.id,
    ]);
  });

  it("is left by a card's removal, which removes the card and its other states", async () => {
    const { u, a, cards, plant, reviews } = await world();
    const removed = cards[0]!;
    const newer = await plant(a, `${a.cardsDocumentUrl}#${removed.id}`);

    await u.removeCard(a, removed);

    expect((await u.listCards(a)).map(({ id }) => id)).toEqual([cards[1]!.id]);
    expect(getThing(await reviews(a), newer)).not.toBeNull();
    expect((await u.listDeckReviewStates(a)).sm2.map(({ cardId }) => cardId)).toEqual([
      cards[1]!.id,
    ]);
  });
});

describe("the state read of a card, when a newer version wrote it", () => {
  const refused = { code: "writtenByNewerApp" };

  it("is not set back to new", async () => {
    const { u, a, cards, restamp } = await world();
    await restamp(a, cards[0]!.id);

    await expect(u.resetCards(INSTANCE, a, [cards[0]!.id])).rejects.toMatchObject(refused);

    expect((await u.listDeckReviewStates(a)).sm2.map(({ cardId }) => cardId)).toContain(
      cards[0]!.id,
    );
  });

  it("is not removed with its card, which stays", async () => {
    const { u, a, cards, restamp, held } = await world();
    await restamp(a, cards[0]!.id);

    await expect(u.removeCard(a, cards[0]!)).rejects.toMatchObject(refused);

    expect((await held()).a).toEqual(cards.map(({ id }) => id));
  });

  it("refuses a bulk delete of its card before anything is written, each time", async () => {
    const { u, a, cards, restamp, held } = await world();
    await restamp(a, cards[0]!.id);
    const before = await held();
    const statesBefore = await u.listDeckReviewStates(a);
    const edit = { kind: "remove" } as const;
    const previewed = planCardEdit(await u.listCards(a), [cards[0]!.id], edit, statesBefore.sm2);
    expect(previewed.reviewRemovals.length).toBeGreaterThan(0);

    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(u.editCards(INSTANCE, a, [cards[0]!.id], edit, previewed)).rejects.toMatchObject(
        refused,
      );
      expect(await held()).toEqual(before);
      expect(await u.listDeckReviewStates(a)).toEqual(statesBefore);
    }
  });

  it.each([true, false])(
    "refuses a move (progress kept: %s) before anything is written, each time",
    async (keepProgress) => {
      const { u, a, b, cards, restamp, held } = await world();
      await restamp(a, cards[0]!.id);
      const before = await held();

      for (let attempt = 0; attempt < 2; attempt++) {
        await expect(
          u.transferCards(
            INSTANCE,
            a,
            b,
            [cards[0]!.id],
            { mode: "move", keepProgress },
            SESSION.webId,
          ),
        ).rejects.toMatchObject(refused);
        expect(await held()).toEqual(before);
      }
    },
  );

  it("in the target refuses a move that clears it, before anything is written", async () => {
    const { u, a, b, cards, copyStates, restamp, held } = await world();
    const moved = cards[0]!;
    await copyStates(a, b, moved.id);
    await restamp(b, moved.id);
    const before = await held();

    await expect(
      u.transferCards(
        INSTANCE,
        a,
        b,
        [moved.id],
        { mode: "move", keepProgress: false },
        SESSION.webId,
      ),
    ).rejects.toMatchObject(refused);

    expect(await held()).toEqual(before);
  });

  it("added beside a card never studied refuses a move that carries it, before anything is written", async () => {
    const { u, a, b, cards, held, fetch } = await world();
    const fresh = await u.addCard(a, { front: { en: "Denmark" }, back: { en: "Copenhagen" } });
    // A whole state of the new card, at a subject of its own, added to the document.
    const text = await (await fetch(a.reviewsDocumentUrl)).text();
    const lines = text
      .split("\n")
      .filter((line) => line.startsWith(`<${a.reviewsDocumentUrl}#${cards[1]!.id}`))
      .map((line) =>
        line
          .replace(`<${a.reviewsDocumentUrl}#${cards[1]!.id}>`, `<${a.reviewsDocumentUrl}#added>`)
          .replaceAll(cards[1]!.id, fresh.id)
          .replace(new RegExp(`(${SM.formatVersion.replaceAll(".", "\\.")}> )\\S+ \\.$`), "$199 ."),
      );
    expect(lines.join("\n")).toContain("> 99 .");
    const response = await fetch(a.reviewsDocumentUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/sparql-update" },
      body: `INSERT DATA {\n${lines.join("\n")}\n};`,
    });
    expect(response.ok).toBe(true);
    expect((await u.listDeckReviewStates(a)).sm2.map(({ cardId }) => cardId)).toContain(fresh.id);
    const before = await held();

    await expect(
      u.transferCards(
        INSTANCE,
        a,
        b,
        [fresh.id],
        { mode: "move", keepProgress: true },
        SESSION.webId,
      ),
    ).rejects.toMatchObject(refused);

    expect(await held()).toEqual(before);
  });
});

describe("a card's subject a newer version wrote", () => {
  /** A distractor stamped with format 99, appended to the card at `cardUrl` in the deck's cards document. */
  const appendDistractor = async (
    fetch: typeof globalThis.fetch,
    on: Deck,
    cardUrl: string,
  ): Promise<string> => {
    const subject = `${on.cardsDocumentUrl}#newer`;
    const response = await fetch(on.cardsDocumentUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/sparql-update" },
      body: `INSERT DATA {
<${cardUrl}> <${SM.distractor}> <${subject}> .
<${subject}> <${RDF_TYPE}> <${SM.Distractor}> .
<${subject}> <${SM.formatVersion}> 99 .
};`,
    });
    expect(response.ok).toBe(true);
    return subject;
  };
  const cardsOf = async (fetch: typeof globalThis.fetch, on: Deck): Promise<Dataset> =>
    (await getSolidDatasetOrNull(on.cardsDocumentUrl, fetch))!;

  it.each([true, false])(
    "a distractor, is left by a move (progress kept: %s), which is done in full",
    async (keepProgress) => {
      const { u, a, b, cards, held, fetch } = await world();
      const moved = cards[0]!;
      const newer = await appendDistractor(fetch, a, moved.url);

      const plan = await u.transferCards(
        INSTANCE,
        a,
        b,
        [moved.id],
        { mode: "move", keepProgress },
        SESSION.webId,
      );

      const after = await held();
      expect(after.a).toEqual([cards[1]!.id]);
      expect(after.b).toContain(plan.cards[0]!.to);
      expect(getThing(await cardsOf(fetch, a), newer)).not.toBeNull();
      expect((await u.listDeckReviewStates(a)).sm2.map(({ cardId }) => cardId)).toEqual([
        cards[1]!.id,
      ]);
    },
  );

  it("a distractor, is left by the card's removal, which removes the card", async () => {
    const { u, a, cards, held, fetch } = await world();
    const newer = await appendDistractor(fetch, a, cards[0]!.url);

    await u.removeCard(a, cards[0]!);

    expect((await held()).a).toEqual([cards[1]!.id]);
    expect(getThing(await cardsOf(fetch, a), newer)).not.toBeNull();
  });

  it("the moved card, refuses the move before anything is written, each time", async () => {
    const { u, a, b, cards, held, fetch } = await world();
    const moved = cards[0]!;
    const text = await (await fetch(a.cardsDocumentUrl)).text();
    const stamped = text
      .split("\n")
      .map((line) =>
        line.startsWith(`<${moved.url}>`) && line.includes(SM.formatVersion)
          ? line.replace(/> \S+ \.$/, "> 99 .")
          : line,
      )
      .join("\n");
    expect(stamped).not.toBe(text);
    const put = await fetch(a.cardsDocumentUrl, {
      method: "PUT",
      headers: { "Content-Type": "text/turtle" },
      body: stamped,
    });
    expect(put.ok).toBe(true);
    const before = await held();
    const states = async () => ({
      a: await u.listDeckReviewStates(a),
      b: await u.listDeckReviewStates(b),
    });
    const statesBefore = await states();

    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(
        u.transferCards(
          INSTANCE,
          a,
          b,
          [moved.id],
          { mode: "move", keepProgress: true },
          SESSION.webId,
        ),
      ).rejects.toMatchObject({ code: "writtenByNewerApp" });
      expect(await held()).toEqual(before);
      expect(await states()).toEqual(statesBefore);
    }
  });
});
