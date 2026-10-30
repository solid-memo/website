// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * A deck's cards and their distractors are subjects of one cards
 * document, each at its id. A release that gives a card a distractor's
 * id, or a distractor a card's, is never written onto the other: the
 * write is refused (idTakenInDeck) and the copy is left as it was. A
 * distractor belongs to the one card that names it: a release never
 * gives it to a second card, and removing one card's never takes
 * another's. The pod is a local one, every write checked against the
 * shapes.
 */
import { describe, expect, it } from "vitest";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/testing/shapeSources";
import type { LibraryCard, LibraryDeckContent } from "@solid-memo/domain/library";
import { planLibraryUpgrade, upgradedCards } from "@solid-memo/domain/libraryUpgrade";
import { buildThing, getThing, setThing } from "./client/rdf";
import { getSolidDatasetOrNull, saveDataset } from "./datasets";
import { createLocalPod } from "./localPod";
import { createMemoryResourceStore } from "./memoryResourceStore";
import { createShaclShapeValidator } from "./shaclShapeValidator";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { DCTERMS, RDF, SM } from "./vocab";

const SERIES = "https://library.example/releases/x/v1.ttl#series";

function card(
  id: string,
  front: string,
  back: string,
  distractors?: { id: string; text: Record<string, string> }[],
): LibraryCard {
  return {
    id,
    front: { en: front },
    back: { en: back },
    formatVersion: 7,
    ...(distractors === undefined ? {} : { distractors }),
  };
}

function release(version: string, cards: LibraryCard[]): LibraryDeckContent {
  return {
    url: `https://library.example/releases/x/v${version}.ttl`,
    title: { en: "Deck" },
    formatVersion: 6,
    authors: [],
    direction: "front-to-back",
    version,
    seriesUrl: SERIES,
    themes: [],
    keywords: {},
    cards,
  };
}

const V1 = release("1", [
  card("x", "Capital of France?", "Paris", [{ id: "dx", text: { en: "Lyon" } }]),
  card("y", "Capital of Spain?", "Madrid"),
]);

/** A copy of V1 in a local pod, its card x edited by the learner (unless `edited` is false). */
async function editedCopy(edited = true) {
  let n = 0;
  const fetch = createLocalPod({
    root: "https://pod.example/",
    store: createMemoryResourceStore(),
    newEtag: () => `"e${n++}"`,
  });
  const validator = createShaclShapeValidator({ fetch, shapesFetch, ...SHAPE_SOURCES }).over(fetch);
  const repository = createSolidDeckRepository({
    fetch,
    now: () => new Date("2026-10-29T00:00:00Z"),
    randomId: () => `r${n++}`,
    checkWrite: validator.checkSubjects,
  });
  const deck = await repository.importDeck("https://pod.example/memo/", V1);
  const find = async (id: string) =>
    (await repository.listCards(deck)).find((one) => one.id === id)!;
  if (edited)
    await repository.updateCard(deck, await find("x"), {
      front: { en: "Capital of France? (my own wording)" },
      back: { en: "Paris" },
    });
  const cards = async () =>
    (await repository.listCards(deck)).map((one) => [
      one.id,
      one.distractors?.map((distractor) => [distractor.id, distractor.text.en]) ?? null,
    ]);
  const upgrade = async (to: LibraryDeckContent, from = V1) => {
    const plan = planLibraryUpgrade({
      deck,
      cards: await repository.listCards(deck),
      from,
      to,
      releases: [],
    })!;
    await repository.applyCardChanges(
      deck,
      { save: upgradedCards(plan), remove: plan.remove.map((one) => one.id) },
      { whole: true },
    );
  };
  /** The pod as an earlier app left it: card y named x's distractor too. */
  const shareDistractor = async () => {
    const dataset = (await getSolidDatasetOrNull(deck.cardsDocumentUrl, fetch))!;
    const y = getThing(dataset, `${deck.cardsDocumentUrl}#y`)!;
    const shared = buildThing(y).addUrl(SM.distractor, `${deck.cardsDocumentUrl}#dx`).build();
    await saveDataset(deck.cardsDocumentUrl, setThing(dataset, shared), fetch);
  };
  /** The pod as an earlier app left it: a release's card dx written onto x's distractor. */
  const takeOverDistractor = async () => {
    const dataset = (await getSolidDatasetOrNull(deck.cardsDocumentUrl, fetch))!;
    const dx = getThing(dataset, `${deck.cardsDocumentUrl}#dx`)!;
    const taken = buildThing(dx)
      .addUrl(RDF.type, SM.Card)
      .addStringWithLocale(SM.front, "Planted", "en")
      .addStringWithLocale(SM.back, "Card", "en")
      .addDatetime(DCTERMS.created, new Date("2026-10-29T00:00:00Z"))
      .setInteger(SM.formatVersion, 7)
      .build();
    await saveDataset(deck.cardsDocumentUrl, setThing(dataset, taken), fetch);
  };
  const remove = async (id: string) => repository.removeCard(deck, await find(id));
  const removeByChanges = async (id: string) =>
    repository.applyCardChanges(deck, { save: [], remove: [id] }, { whole: true });
  return { cards, upgrade, shareDistractor, takeOverDistractor, remove, removeByChanges };
}

describe("a card and a distractor of one id", () => {
  it("refuses a release's card at a distractor's id, keeping the edited card's distractor", async () => {
    const copy = await editedCopy();
    const before = await copy.cards();
    expect(before).toEqual([
      ["x", [["dx", "Lyon"]]],
      ["y", null],
    ]);
    await expect(
      copy.upgrade(release("2", [...V1.cards, card("dx", "Planted", "Card")])),
    ).rejects.toMatchObject({
      code: "idTakenInDeck",
      vars: { url: expect.stringMatching(/#dx$/) },
    });
    expect(await copy.cards()).toEqual(before);
  });

  it("refuses a release's distractor at a card's id, not as data a newer app wrote", async () => {
    const copy = await editedCopy();
    const before = await copy.cards();
    await expect(
      copy.upgrade(
        release("2", [
          V1.cards[0]!,
          card("y", "Capital of Spain?", "Madrid", [{ id: "x", text: { en: "Seville" } }]),
        ]),
      ),
    ).rejects.toMatchObject({ code: "idTakenInDeck", vars: { url: expect.stringMatching(/#x$/) } });
    expect(await copy.cards()).toEqual(before);
  });

  it("refuses a new card naming the edited card's distractor, left out of the release", async () => {
    const copy = await editedCopy();
    const before = await copy.cards();
    await expect(
      copy.upgrade(
        release("2", [
          card("x", "Capital of France?", "Paris"),
          V1.cards[1]!,
          card("z", "Planted", "Card", [{ id: "dx", text: { en: "Planted text" } }]),
        ]),
      ),
    ).rejects.toMatchObject({
      code: "idTakenInDeck",
      vars: { url: expect.stringMatching(/#dx$/) },
    });
    expect(await copy.cards()).toEqual(before);
  });

  it("refuses an unedited card naming the edited card's distractor", async () => {
    const copy = await editedCopy();
    const before = await copy.cards();
    await expect(
      copy.upgrade(
        release("2", [
          card("x", "Capital of France?", "Paris"),
          card("y", "Capital of Spain?", "Madrid", [{ id: "dx", text: { en: "Planted text" } }]),
        ]),
      ),
    ).rejects.toMatchObject({
      code: "idTakenInDeck",
      vars: { url: expect.stringMatching(/#dx$/) },
    });
    expect(await copy.cards()).toEqual(before);
  });

  it.each([
    ["after", ["x", "y"]],
    ["before", ["y", "x"]],
  ])("moves a distractor to a card written %s the one that named it", async (_, order) => {
    const copy = await editedCopy(false);
    const moved = {
      x: card("x", "Capital of France?", "Paris"),
      y: card("y", "Capital of Spain?", "Madrid", [{ id: "dx", text: { en: "Seville" } }]),
    };
    await copy.upgrade(
      release(
        "2",
        order.map((id) => moved[id as "x" | "y"]),
      ),
    );
    expect(await copy.cards()).toEqual([
      ["x", null],
      ["y", [["dx", "Seville"]]],
    ]);
  });

  it("keeps a distractor another card still names when a card is removed", async () => {
    const copy = await editedCopy();
    await copy.shareDistractor();
    await copy.remove("y");
    expect(await copy.cards()).toEqual([["x", [["dx", "Lyon"]]]]);
  });

  it("keeps a distractor another card still names when a change removes a card", async () => {
    const copy = await editedCopy();
    await copy.shareDistractor();
    await copy.removeByChanges("y");
    expect(await copy.cards()).toEqual([["x", [["dx", "Lyon"]]]]);
  });

  it("keeps the edited card's distractor when a release drops a card an earlier version wrote onto it", async () => {
    const copy = await editedCopy();
    await copy.takeOverDistractor();
    const taken = release("2", [...V1.cards, card("dx", "Planted", "Card")]);
    await copy.upgrade(release("3", [...V1.cards]), taken);
    expect(await copy.cards()).toEqual([
      ["x", [["dx", "Lyon"]]],
      ["y", null],
    ]);
  });

  it("keeps the edited card's distractor when the card an earlier version wrote onto it is removed", async () => {
    const copy = await editedCopy();
    await copy.takeOverDistractor();
    await copy.remove("dx");
    expect(await copy.cards()).toEqual([
      ["x", [["dx", "Lyon"]]],
      ["y", null],
    ]);
  });

  it("removes a removed card's distractor no other card names", async () => {
    const copy = await editedCopy();
    await copy.removeByChanges("x");
    expect(await copy.cards()).toEqual([["y", null]]);
  });
});
