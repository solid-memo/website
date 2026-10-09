import { describe, expect, it } from "vitest";
import type { Card, Deck } from "@solid-memo/domain/deck";
import { DECK_FILE_BASE, type DeckFileFormat } from "@solid-memo/domain/deckFile";
import type { ReviewState } from "@solid-memo/domain/review";
import { LATEST_VERSION } from "@solid-memo/vocab/types.generated";
import { createSolidDeckArchive } from "./solidDeckArchive";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { createSolidReviewStateRepository } from "./solidReviewStateRepository";
import { fakePod } from "./testing/fakePod";
import { SM, SM_NS } from "./vocab";

const INSTANCE = "https://pod.example/solid-memo/a/";
const FOREIGN = "https://other.example/ns#rating";
const CHAPTER = "https://solid-memo.com/decks/solid/v1.ttl#chapter-1";

/** A deck with all a file must carry: Markdown, pictures, wrong options (one retired), several languages, a retired card, review states. */
async function podWithDeck() {
  const pod = fakePod();
  let ids = 0;
  const repository = createSolidDeckRepository({
    fetch: pod.fetch,
    now: () => new Date("2026-10-01T10:00:00.000Z"),
    randomId: () => `id${++ids}`,
  });
  const reviews = createSolidReviewStateRepository({ fetch: pod.fetch });
  const created = await repository.createDeck(INSTANCE, { en: "Capitals", sv: "Huvudstäder" });
  const deck = await repository.saveDeck({
    ...created,
    authors: ["Anton <anton@example.com>"],
    license: "https://creativecommons.org/licenses/by/4.0/",
    description: { en: "Capitals of Europe.", sv: "Europas huvudstäder." },
    keywords: { en: ["capitals"], sv: ["huvudstäder"] },
    newCardsPerDay: 5,
  });
  const cards: Card[] = [
    {
      id: "card-se",
      url: `${deck.cardsDocumentUrl}#card-se`,
      front: { en: "**Sweden**", sv: "**Sverige**" },
      back: { en: "Stockholm", sv: "Stockholm" },
      backNote: { en: "Since 1634.", sv: "Sedan 1634." },
      textFormat: SM.markdown,
      distractors: [
        { id: "card-se-d1", text: { en: "Gothenburg", sv: "Göteborg" }, note: { en: "The second city." } },
        { id: "card-se-d2", text: { en: "Uppsala", sv: "Uppsala" }, retired: true },
      ],
      createdAt: "2026-09-01T10:00:00.000Z",
      formatVersion: 5,
    },
    {
      id: "card-flag",
      url: `${deck.cardsDocumentUrl}#card-flag`,
      front: {},
      frontImageUrl: "https://flagcdn.com/h80/se.png",
      frontImageDescription: { en: "A yellow cross on blue" },
      back: { en: "Sweden" },
      createdAt: "2026-09-02T10:00:00.000Z",
      formatVersion: 5,
      retired: true,
    },
  ];
  await repository.applyCardChanges(deck, { save: cards, remove: [] });
  const states: ReviewState[] = [
    {
      cardId: "card-se",
      direction: "front-to-back",
      easeFactor: 2.36,
      intervalDays: 6,
      repetitions: 2,
      due: "2026-10-07",
      firstReviewedAt: "2026-09-20T10:00:00.000Z",
      lastReviewedAt: "2026-10-01T10:00:00.000Z",
      formatVersion: LATEST_VERSION.reviewState,
      previous: { easeFactor: 2.5, intervalDays: 1, repetitions: 1, due: "2026-10-01", lastReviewedAt: "2026-09-30T10:00:00.000Z" },
    },
  ];
  await reviews.applyReviewChanges(deck, { save: states, remove: [] });
  await repository.completeChapter(deck, CHAPTER);
  // What another app said of a card, and the deck's place among its groups.
  await pod.put(deck.cardsDocumentUrl, [...pod.triples(deck.cardsDocumentUrl)!, `<${cards[0]!.url}> <${FOREIGN}> "5" .`].join("\n"));
  await pod.put(`${INSTANCE}catalog.ttl`, [...pod.triples(`${INSTANCE}catalog.ttl`)!, `<${deck.url}> <${SM.position}> "3"^^<http://www.w3.org/2001/XMLSchema#integer> .`].join("\n"));
  const stored = (await repository.readDeck(deck.url))!;
  return { pod, deck: stored, cards: await repository.listCards(stored), states: await reviews.listReviewStates(stored) };
}

describe("createSolidDeckArchive", () => {
  for (const format of ["turtle", "jsonld"] as const satisfies readonly DeckFileFormat[]) {
    it(`reads back in ${format} what it exports, progress and all`, async () => {
      const { pod, deck, cards, states } = await podWithDeck();
      const archive = createSolidDeckArchive({ fetch: pod.fetch });
      const text = await archive.exportDeck(deck, { format, withProgress: true });
      expect(text).toContain(FOREIGN);
      const read = await archive.readDeckFile(text, format, `${DECK_FILE_BASE}deck`);
      expect(read).toEqual({ deck, cards, reviews: states, upgraded: [], dropped: [] });
      expect(read.deck.completedChapters).toEqual([CHAPTER]);
      expect(read.cards.find((card) => card.id === "card-se")!.distractors).toHaveLength(2);
    });
  }

  it("leaves the progress and the deck's place behind unless asked", async () => {
    const { pod, deck, cards } = await podWithDeck();
    const archive = createSolidDeckArchive({ fetch: pod.fetch });
    const text = await archive.exportDeck(deck, { format: "turtle", withProgress: false });
    expect(text).not.toContain("position");
    expect(text).not.toContain("completedChapter");
    expect(text).not.toContain(deck.reviewsDocumentUrl + "#");
    const read = await archive.readDeckFile(text, "turtle", `${DECK_FILE_BASE}deck`);
    const { completedChapters: _, ...withoutProgress } = deck;
    expect(read).toEqual({ deck: withoutProgress, cards, upgraded: [], dropped: [] });
  });

  it("writes JSON-LD with its context in full, as compact IRIs and value objects", async () => {
    const { pod, deck } = await podWithDeck();
    const json = JSON.parse(await createSolidDeckArchive({ fetch: pod.fetch }).exportDeck(deck, { format: "jsonld", withProgress: true }));
    expect(json["@context"].sm).toBe(SM_NS);
    const entry = json["@graph"].find((node: { "@id": string }) => node["@id"] === deck.url);
    expect(entry["@type"]).toContain("sm:Deck");
    expect(entry["dcterms:title"]).toEqual([
      { "@value": "Capitals", "@language": "en" },
      { "@value": "Huvudstäder", "@language": "sv" },
    ]);
    expect(entry["sm:formatVersion"]).toEqual({ "@value": String(LATEST_VERSION.deck), "@type": "xsd:integer" });
  });

  it("refuses to export a deck its catalog no longer lists", async () => {
    const { pod, deck } = await podWithDeck();
    const archive = createSolidDeckArchive({ fetch: pod.fetch });
    await expect(archive.exportDeck({ ...deck, url: `${deck.url}-gone` } as Deck, { format: "turtle", withProgress: false })).rejects.toMatchObject({
      code: "deckGone",
    });
    await expect(
      archive.exportDeck({ ...deck, url: "https://pod.example/elsewhere/catalog.ttl#d" }, { format: "turtle", withProgress: false }),
    ).rejects.toMatchObject({ code: "deckGone" });
  });
});

const PREFIXES = `
@prefix sm: <${SM_NS}> .
@prefix dcterms: <http://purl.org/dc/terms/> .
`;

/** A deck of format 1 at relative IRIs, as a file written by hand (or by an old version) has it. */
const OLD_DECK = `${PREFIXES}
<#deck> a sm:Deck ;
  dcterms:title "Old capitals" ;
  sm:cardsDocument <cards> ;
  sm:reviewsDocument <reviews> ;
  sm:formatVersion 1 .
<cards#c1> a sm:Card ; sm:front "Norway" ; sm:back "Oslo" ; sm:formatVersion 1 .
<cards#c2> a sm:Card ; sm:formatVersion 1 .
<elsewhere#c3> a sm:Card ; sm:front "Spain" ; sm:back "Madrid" ; sm:formatVersion 1 .
<reviews#c1> a sm:ReviewState ; sm:easeFactor 2.5 ; sm:intervalDays 1 ; sm:repetitions 1 ; sm:due "2026-01-02" ;
  sm:firstReviewedAt "2026-01-01T00:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> ;
  sm:lastReviewedAt "2026-01-01T00:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
<reviews#gone> a sm:ReviewState ; sm:easeFactor 2.5 ; sm:intervalDays 1 ; sm:repetitions 1 ; sm:due "2026-01-02" ;
  sm:firstReviewedAt "2026-01-01T00:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> ;
  sm:lastReviewedAt "2026-01-01T00:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
<cards#broken> a sm:ReviewState .
`;

describe("readDeckFile", () => {
  const archive = createSolidDeckArchive({ fetch: (() => Promise.reject(new Error("no reads"))) as unknown as typeof fetch });
  const base = `${DECK_FILE_BASE}old.ttl`;

  it("brings older formats up to date, resolves relative IRIs, and says what it left out", async () => {
    const read = await archive.readDeckFile(OLD_DECK, "turtle", base);
    expect(read.deck).toMatchObject({ url: `${base}#deck`, title: { en: "Old capitals" }, cardsDocumentUrl: `${DECK_FILE_BASE}cards` });
    expect(read.cards.map((card) => card.id)).toEqual(["c1"]);
    expect(read.reviews!.map((state) => state.cardId)).toEqual(["c1"]);
    expect(read.upgraded).toEqual([
      { kind: "deck", subject: `${base}#deck`, from: 1, to: LATEST_VERSION.deck },
      { kind: "card", subject: `${DECK_FILE_BASE}cards#c1`, from: 1, to: LATEST_VERSION.card },
      { kind: "reviewState", subject: `${DECK_FILE_BASE}reviews#c1`, from: 1, to: LATEST_VERSION.reviewState },
    ]);
    expect(read.dropped.sort()).toEqual(
      [`${DECK_FILE_BASE}cards#c2`, `${DECK_FILE_BASE}elsewhere#c3`, `${DECK_FILE_BASE}reviews#gone`, `${DECK_FILE_BASE}cards#broken`].sort(),
    );
  });

  it("refuses a deck, a card or a review state in a newer format", async () => {
    for (const kind of ["Deck", "Card", "ReviewState"]) {
      const newer = `${OLD_DECK}<#new> a sm:${kind} ; sm:formatVersion 999 .`;
      await expect(archive.readDeckFile(newer, "turtle", base)).rejects.toMatchObject({ code: "deckFileTooNew" });
    }
  });

  it("refuses a file that holds no deck it can read, or more than one", async () => {
    await expect(archive.readDeckFile(PREFIXES, "turtle", base)).rejects.toMatchObject({ code: "notADeckFile" });
    await expect(archive.readDeckFile(`${PREFIXES}<#d> a sm:Deck .`, "turtle", base)).rejects.toMatchObject({ code: "notADeckFile" });
    const two = `${OLD_DECK}<#other> a sm:Deck ; dcterms:title "B" ; sm:cardsDocument <b> ; sm:reviewsDocument <c> .`;
    await expect(archive.readDeckFile(two, "turtle", base)).rejects.toMatchObject({ code: "notADeckFile" });
  });

  it("refuses text that does not parse", async () => {
    await expect(archive.readDeckFile("<#a> <#b>", "turtle", base)).rejects.toMatchObject({ code: "deckFileUnreadable" });
    await expect(archive.readDeckFile("{", "jsonld", base)).rejects.toMatchObject({ code: "deckFileUnreadable" });
    await expect(archive.readDeckFile('{"@id": 5, "@type": {}}', "jsonld", base)).rejects.toMatchObject({ code: "deckFileUnreadable" });
  });

  it("reads JSON-LD written by hand, its context inline", async () => {
    const json = JSON.stringify({
      "@context": [{ sm: SM_NS }, { dcterms: "http://purl.org/dc/terms/" }],
      "@graph": [
        { "@id": "#deck", "@type": "sm:Deck", "dcterms:title": "Hand", "sm:cardsDocument": { "@id": "cards" }, "sm:reviewsDocument": { "@id": "reviews" } },
        { "@id": "cards#c1", "@type": "sm:Card", "sm:front": "A", "sm:back": "B" },
      ],
    });
    const read = await archive.readDeckFile(json, "jsonld", base);
    expect(read).toMatchObject({ deck: { title: { en: "Hand" } }, cards: [{ id: "c1", front: { "": "A" } }] });
    expect(read.reviews).toBeUndefined();
  });

  it("refuses JSON-LD whose context would be fetched from elsewhere", async () => {
    for (const context of ["https://evil.example/context.jsonld", [{ sm: SM_NS }, "https://evil.example/c"], { "@import": "https://evil.example/c" }]) {
      const json = JSON.stringify({ "@graph": [{ "@context": context, "@id": "#deck" }] });
      await expect(archive.readDeckFile(json, "jsonld", base)).rejects.toMatchObject({ code: "deckFileUnreadable" });
    }
  });
});
