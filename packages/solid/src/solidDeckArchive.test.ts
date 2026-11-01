// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { CARD_FORMAT_VERSION, type Card, type Deck } from "@solid-memo/domain/deck";
import { DECK_FILE_BASE, type DeckFileFormat, importedDeck } from "@solid-memo/domain/deckFile";
import type { FsrsState, ReviewState } from "@solid-memo/domain/review";
import { growthAsync } from "@solid-memo/domain/testing/growth";
import { LATEST_VERSION } from "@solid-memo/vocab/types.generated";
import { RELEASE_LIMITS } from "./client/readLimits";
import { agentNamesOf, toDeck } from "./mappers/deckMapper";
import { createSolidDeckArchive, parseDeckFile } from "./solidDeckArchive";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { createSolidReviewStateRepository } from "./solidReviewStateRepository";
import { fakePod } from "./testing/fakePod";
import { SCHEMA, SM, SM_NS } from "./vocab";

// The real mappers, watched: a test checks that a file of several decks maps none of them.
vi.mock("./mappers/deckMapper", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./mappers/deckMapper")>();
  return { ...actual, agentNamesOf: vi.fn(actual.agentNamesOf), toDeck: vi.fn(actual.toDeck) };
});

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
  const deck = await repository.setCardLanguage(
    await repository.saveDeck({
      ...created,
      authors: ["Anton <anton@example.com>"],
      license: "https://creativecommons.org/licenses/by/4.0/",
      description: { en: "Capitals of Europe.", sv: "Europas huvudstäder." },
      keywords: { en: ["capitals"], sv: ["huvudstäder"] },
      newCardsPerDay: 5,
    }),
    "sv",
  );
  const cards: Card[] = [
    {
      id: "card-se",
      url: `${deck.cardsDocumentUrl}#card-se`,
      front: { en: "**Sweden**", sv: "**Sverige**" },
      back: { en: "Stockholm", sv: "Stockholm" },
      backNote: { en: "Since 1634.", sv: "Sedan 1634." },
      textFormat: SM.markdown,
      distractors: [
        {
          id: "card-se-d1",
          text: { en: "Gothenburg", sv: "Göteborg" },
          note: { en: "The second city." },
        },
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
      previous: {
        easeFactor: 2.5,
        intervalDays: 1,
        repetitions: 1,
        due: "2026-10-01",
        lastReviewedAt: "2026-09-30T10:00:00.000Z",
      },
    },
  ];
  const fsrs: FsrsState = {
    cardId: "card-se",
    direction: "front-to-back",
    stability: 8.5,
    difficulty: 4.25,
    due: "2026-10-09",
    firstReviewedAt: "2026-09-20T10:00:00.000Z",
    lastReviewedAt: "2026-10-01T10:00:00.000Z",
    formatVersion: LATEST_VERSION.fsrsReviewState,
  };
  await reviews.applyReviewChanges(deck, {
    save: states,
    remove: [],
    fsrs: { save: [fsrs], remove: [] },
  });
  await repository.completeChapter(deck, CHAPTER);
  // What another app said of a card, and the deck's place among its groups.
  await pod.put(
    deck.cardsDocumentUrl,
    [...pod.triples(deck.cardsDocumentUrl)!, `<${cards[0]!.url}> <${FOREIGN}> "5" .`].join("\n"),
  );
  await pod.put(
    `${INSTANCE}catalog.ttl`,
    [
      ...pod.triples(`${INSTANCE}catalog.ttl`)!,
      `<${deck.url}> <${SM.position}> "3"^^<http://www.w3.org/2001/XMLSchema#integer> .`,
      `<${deck.url}> a <${SCHEMA.Course}> .`,
    ].join("\n"),
  );
  const stored = (await repository.readDeck(deck.url))!;
  return {
    pod,
    deck: stored,
    cards: await repository.listCards(stored),
    states: await reviews.listReviewStates(stored),
  };
}

describe("createSolidDeckArchive", () => {
  for (const format of ["turtle", "jsonld"] as const satisfies readonly DeckFileFormat[]) {
    it(`reads back in ${format} what it exports, progress and all`, async () => {
      const { pod, deck, cards, states } = await podWithDeck();
      const archive = createSolidDeckArchive({ fetch: pod.fetch });
      const text = await archive.exportDeck(deck, { format, withProgress: true });
      expect(text).toContain(FOREIGN);
      const read = await archive.readDeckFile(text, format, `${DECK_FILE_BASE}deck`);
      expect(read).toEqual({
        deck,
        cards,
        reviews: states.sm2,
        fsrsReviews: states.fsrs,
        upgraded: [],
        dropped: [],
      });
      expect(read.fsrsReviews).toHaveLength(1);
      expect(read.deck.course).toBe(true);
      expect(read.deck.completedChapters).toEqual([CHAPTER]);
      expect(read.deck.cardLanguage).toBe("sv");
      expect(read.cards.find((card) => card.id === "card-se")!.distractors).toHaveLength(2);
    });
  }

  it("leaves the progress and the deck's place behind unless asked", async () => {
    const { pod, deck, cards } = await podWithDeck();
    const archive = createSolidDeckArchive({ fetch: pod.fetch });
    const text = await archive.exportDeck(deck, { format: "turtle", withProgress: false });
    expect(text).not.toContain("position");
    expect(text).not.toContain("completedChapter");
    // The card language is the learner's choice of how the deck reads, not progress: it goes along.
    expect(text).toContain("deckCardLanguage");
    expect(text).not.toContain(deck.reviewsDocumentUrl + "#");
    const read = await archive.readDeckFile(text, "turtle", `${DECK_FILE_BASE}deck`);
    const { completedChapters: _, ...withoutProgress } = deck;
    expect(read).toEqual({ deck: withoutProgress, cards, upgraded: [], dropped: [] });
    // What the deck is goes along: a course's deck is one without its progress too.
    expect(read.deck.course).toBe(true);
  });

  it("writes JSON-LD with its context in full, as compact IRIs and value objects", async () => {
    const { pod, deck } = await podWithDeck();
    const json = JSON.parse(
      await createSolidDeckArchive({ fetch: pod.fetch }).exportDeck(deck, {
        format: "jsonld",
        withProgress: true,
      }),
    );
    expect(json["@context"].sm).toBe(SM_NS);
    const entry = json["@graph"].find((node: { "@id": string }) => node["@id"] === deck.url);
    expect(entry["@type"]).toContain("sm:Deck");
    expect(entry["dcterms:title"]).toEqual([
      { "@value": "Capitals", "@language": "en" },
      { "@value": "Huvudstäder", "@language": "sv" },
    ]);
    expect(entry["sm:formatVersion"]).toEqual({
      "@value": String(LATEST_VERSION.deck),
      "@type": "xsd:integer",
    });
  });

  it("refuses to export a deck its catalog no longer lists", async () => {
    const { pod, deck } = await podWithDeck();
    const archive = createSolidDeckArchive({ fetch: pod.fetch });
    await expect(
      archive.exportDeck({ ...deck, url: `${deck.url}-gone` } as Deck, {
        format: "turtle",
        withProgress: false,
      }),
    ).rejects.toMatchObject({
      code: "deckGone",
    });
    await expect(
      archive.exportDeck(
        { ...deck, url: "https://pod.example/elsewhere/catalog.ttl#d" },
        { format: "turtle", withProgress: false },
      ),
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
<reviews#gone@fsrs6> a sm:ReviewState ; sm:scheduler sm:fsrs6 ; sm:formatVersion 1 ;
  sm:reviewOf <cards#gone> ; sm:reviewDirection sm:frontToBack ; sm:stability 2.0 ; sm:difficulty 5.0 ;
  sm:due "2026-01-03" ; sm:firstReviewedAt "2026-01-01T00:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> ;
  sm:lastReviewedAt "2026-01-01T00:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
<cards#broken> a sm:ReviewState .
`;

describe("readDeckFile", () => {
  const archive = createSolidDeckArchive({
    fetch: (() => Promise.reject(new Error("no reads"))) as unknown as typeof fetch,
  });
  const base = `${DECK_FILE_BASE}old.ttl`;

  it("brings older formats up to date, resolves relative IRIs, and says what it left out", async () => {
    const read = await archive.readDeckFile(OLD_DECK, "turtle", base);
    expect(read.deck).toMatchObject({
      url: `${base}#deck`,
      title: { en: "Old capitals" },
      cardsDocumentUrl: `${DECK_FILE_BASE}cards`,
    });
    expect(read.cards.map((card) => card.id)).toEqual(["c1"]);
    expect(read.reviews!.map((state) => state.cardId)).toEqual(["c1"]);
    expect(read.upgraded).toEqual([
      { kind: "deck", subject: `${base}#deck`, from: 1, to: LATEST_VERSION.deck },
      { kind: "card", subject: `${DECK_FILE_BASE}cards#c1`, from: 1, to: LATEST_VERSION.card },
      {
        kind: "reviewState",
        subject: `${DECK_FILE_BASE}reviews#c1`,
        from: 1,
        to: LATEST_VERSION.reviewState,
      },
    ]);
    expect(read.dropped.sort()).toEqual(
      [
        `${DECK_FILE_BASE}cards#c2`,
        `${DECK_FILE_BASE}elsewhere#c3`,
        `${DECK_FILE_BASE}reviews#gone`,
        `${DECK_FILE_BASE}reviews#gone@fsrs6`,
        `${DECK_FILE_BASE}cards#broken`,
      ].sort(),
    );
  });

  it("refuses a deck, a card or a review state in a newer format", async () => {
    for (const kind of ["Deck", "Card", "ReviewState"]) {
      const newer = `${OLD_DECK}<#new> a sm:${kind} ; sm:formatVersion 999 .`;
      await expect(archive.readDeckFile(newer, "turtle", base)).rejects.toMatchObject({
        code: "deckFileTooNew",
      });
    }
    // An FSRS-6 state in a format newer than FSRS-6's latest, if not than SM-2's.
    const fsrs = `${OLD_DECK}<reviews#new> a sm:ReviewState ; sm:scheduler sm:fsrs6 ; sm:formatVersion 2 .`;
    await expect(archive.readDeckFile(fsrs, "turtle", base)).rejects.toMatchObject({
      code: "deckFileTooNew",
      vars: { reads: LATEST_VERSION.fsrsReviewState },
    });
  });

  it("refuses a file that holds no deck it can read, or more than one", async () => {
    await expect(archive.readDeckFile(PREFIXES, "turtle", base)).rejects.toMatchObject({
      code: "notADeckFile",
    });
    await expect(
      archive.readDeckFile(`${PREFIXES}<#d> a sm:Deck .`, "turtle", base),
    ).rejects.toMatchObject({ code: "notADeckFile" });
    const two = `${OLD_DECK}<#other> a sm:Deck ; dcterms:title "B" ; sm:cardsDocument <b> ; sm:reviewsDocument <c> .`;
    await expect(archive.readDeckFile(two, "turtle", base)).rejects.toMatchObject({
      code: "notADeckFile",
    });
  });

  it("refuses a file of more than one deck before it maps any (GHSA-hcrw-cr33-jg78)", async () => {
    vi.mocked(toDeck).mockClear();
    vi.mocked(agentNamesOf).mockClear();
    const two = `${OLD_DECK}<#other> a sm:Deck ; dcterms:title "B" ; sm:cardsDocument <b> ; sm:reviewsDocument <c> .`;
    await expect(archive.readDeckFile(two, "turtle", base)).rejects.toMatchObject({
      code: "notADeckFile",
    });
    expect(toDeck).not.toHaveBeenCalled();
    expect(agentNamesOf).not.toHaveBeenCalled();
  });

  it("refuses a file of many decks and agents in time that grows with them, not their product (GHSA-hcrw-cr33-jg78)", async () => {
    const ratio = await growthAsync(
      (count) => {
        let text = PREFIXES;
        for (let i = 0; i < count; i++) {
          text += `<#d${i}> a sm:Deck ; dcterms:title "t" ; sm:cardsDocument <c> ; sm:reviewsDocument <r> .\n`;
          text += `<#a${i}> a <http://xmlns.com/foaf/0.1/Agent> ; <http://xmlns.com/foaf/0.1/name> "n${i}" .\n`;
        }
        return () =>
          expect(archive.readDeckFile(text, "turtle", base)).rejects.toMatchObject({
            code: "notADeckFile",
          });
      },
      1000,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("refuses text that does not parse", async () => {
    await expect(archive.readDeckFile("<#a> <#b>", "turtle", base)).rejects.toMatchObject({
      code: "deckFileUnreadable",
    });
    await expect(archive.readDeckFile("{", "jsonld", base)).rejects.toMatchObject({
      code: "deckFileUnreadable",
    });
    await expect(
      archive.readDeckFile('{"@id": 5, "@type": {}}', "jsonld", base),
    ).rejects.toMatchObject({ code: "deckFileUnreadable" });
  });

  it("refuses as unreadable a text the parser throws on at once, not only one it reports", async () => {
    // Not a string: reading it throws before the parser reads any of it.
    const text = {
      get length(): number {
        throw new TypeError("Not a text");
      },
    } as unknown as string;
    await expect(parseDeckFile(text, "turtle", base, null)).rejects.toMatchObject({
      code: "deckFileUnreadable",
    });
  });

  it("reads JSON-LD written by hand, its context inline", async () => {
    const json = JSON.stringify({
      "@context": [{ sm: SM_NS }, { dcterms: "http://purl.org/dc/terms/" }],
      "@graph": [
        {
          "@id": "#deck",
          "@type": "sm:Deck",
          "dcterms:title": "Hand",
          "sm:cardsDocument": { "@id": "cards" },
          "sm:reviewsDocument": { "@id": "reviews" },
        },
        { "@id": "cards#c1", "@type": "sm:Card", "sm:front": "A", "sm:back": "B" },
      ],
    });
    const read = await archive.readDeckFile(json, "jsonld", base);
    expect(read).toMatchObject({
      deck: { title: { en: "Hand" } },
      cards: [{ id: "c1", front: { "": "A" } }],
    });
    expect(read.reviews).toBeUndefined();
  });

  it("reads only the file's default graph, so a named graph called `_:__proto__` reaches nothing", async () => {
    const victim = "https://victim.example/solid-memo/catalog.ttl#deck";
    const json = JSON.stringify({
      "@context": { sm: SM_NS, dcterms: "http://purl.org/dc/terms/" },
      "@graph": [
        {
          "@id": "#deck",
          "@type": "sm:Deck",
          "dcterms:title": "Hand",
          "sm:cardsDocument": { "@id": "cards" },
          "sm:reviewsDocument": { "@id": "reviews" },
        },
        { "@id": "cards#c1", "@type": "sm:Card", "sm:front": "A", "sm:back": "B" },
        {
          "@id": "_:__proto__",
          "@graph": [
            { "@id": victim, "@type": "sm:Deck", "dcterms:title": "Evil" },
            { "@id": "cards#c2", "@type": "sm:Card", "sm:front": "C", "sm:back": "D" },
          ],
        },
      ],
    });
    const read = await archive.readDeckFile(json, "jsonld", base);
    expect(read.cards.map((card) => card.id)).toEqual(["c1"]);
    expect(victim in {}).toBe(false);
  });

  it("leaves out a triple with a term Turtle cannot write as it is, which would say more once saved", async () => {
    const deck = (card: object) =>
      JSON.stringify({
        "@context": { sm: SM_NS, dcterms: "http://purl.org/dc/terms/" },
        "@graph": [
          {
            "@id": "#deck",
            "@type": "sm:Deck",
            "dcterms:title": "Hand",
            "sm:cardsDocument": { "@id": "cards" },
            "sm:reviewsDocument": { "@id": "reviews" },
          },
          { "@id": "cards#c1", "@type": "sm:Card", "sm:front": "A", "sm:back": "B", ...card },
        ],
      });
    const injected = `https://img.example/a.png#p> . <${base}> <http://purl.org/dc/terms/isPartOf> <https://attacker.example/o`;
    for (const card of [
      { "sm:frontImage": { "@id": injected } },
      { [`${SM_NS}frontImage> <https://attacker.example/o> . <${base}cards#c1> <${SM_NS}x`]: "y" },
      {
        "sm:frontImage": {
          "@id": "_:b x> . <https://attacker.example/s> <https://attacker.example/p> _:c",
        },
      },
    ]) {
      const read = await archive.readDeckFile(deck(card), "jsonld", base);
      expect(read.cards).toMatchObject([{ id: "c1", front: { "": "A" } }]);
      expect(JSON.stringify(read)).not.toContain("attacker");
    }
    // A card whose own text cannot be written is not read: it is left out and counted.
    const typed = await archive.readDeckFile(
      deck({
        "sm:back": { "@value": "B", "@type": "https://t.example/t#a>attacker" },
      }),
      "jsonld",
      base,
    );
    expect(typed.cards).toEqual([]);
    expect(typed.dropped).toEqual([`${base.replace(/[^/]*$/, "")}cards#c1`]);
    const encoded = await archive.readDeckFile(
      deck({
        "sm:frontImage": { "@id": "https://img.example/a.png#p%3E" },
        "sm:formatVersion": CARD_FORMAT_VERSION,
      }),
      "jsonld",
      base,
    );
    expect(encoded.cards[0]?.frontImageUrl).toBe("https://img.example/a.png#p%3E");
  });

  it("leaves out text in a language the pod's parser cannot read, so the imported deck reads back", async () => {
    const { pod, deck } = await podWithDeck();
    const archive = createSolidDeckArchive({ fetch: pod.fetch });
    const json = JSON.parse(
      await archive.exportDeck(deck, { format: "jsonld", withProgress: false }),
    );
    const entry = json["@graph"].find((node: { "@id": string }) => node["@id"] === deck.url);
    for (const key of ["dcterms:title", "dcterms:description", "dcat:keyword"]) {
      entry[key] = [entry[key], { "@value": "x", "@language": "constructor" }].flat();
    }
    const read = await archive.readDeckFile(
      JSON.stringify(json),
      "jsonld",
      `${DECK_FILE_BASE}deck`,
    );
    expect(read.deck).toMatchObject({
      title: deck.title,
      description: deck.description,
      keywords: deck.keywords,
    });
    const repository = createSolidDeckRepository({
      fetch: pod.fetch,
      now: () => new Date("2026-10-02T10:00:00.000Z"),
      randomId: () => "id",
    });
    const imported = importedDeck(INSTANCE, read, {
      withProgress: false,
      decks: await repository.listDecks(INSTANCE),
      freshId: "imported",
      now: "2026-10-02T10:00:00.000Z",
    });
    await repository.applyCardChanges(imported.deck, { save: imported.cards, remove: [] });
    await repository.registerDeck(imported.deck);
    const decks = await repository.listDecks(INSTANCE);
    expect(decks.map((listed) => listed.title)).toEqual([deck.title, deck.title]);
    expect(await repository.listCards(decks[1]!)).toHaveLength(read.cards.length);
  });

  it("refuses JSON-LD whose context would be fetched from elsewhere", async () => {
    for (const context of [
      "https://evil.example/context.jsonld",
      [{ sm: SM_NS }, "https://evil.example/c"],
      { "@import": "https://evil.example/c" },
    ]) {
      const json = JSON.stringify({ "@graph": [{ "@context": context, "@id": "#deck" }] });
      await expect(archive.readDeckFile(json, "jsonld", base)).rejects.toMatchObject({
        code: "deckFileUnreadable",
      });
    }
  });

  it("refuses JSON-LD that defines a term by more than an IRI, such as a @graph container, before the parser reads it", async () => {
    const json = JSON.stringify({
      "@context": { sm: SM_NS, g: { "@container": "@graph" } },
      "@id": "#deck",
      g: Array.from({ length: 4000 }, (_, at) => ({ "@id": `#o${at}`, "sm:p": "v" })),
    });
    await expect(archive.readDeckFile(json, "jsonld", base)).rejects.toMatchObject({
      code: "deckFileUnreadable",
      vars: { reason: "The file defines a JSON-LD term by more than an IRI." },
    });
  });

  it("refuses JSON-LD with a long base and many IRIs relative to it in time that grows with the file, not its square (GHSA-3jqf-v8x6-qcc3)", async () => {
    // Eight times the file must take less than four times as long as an eighth of it done eight times over.
    const ratio = await growthAsync(
      (count) => {
        const json = JSON.stringify({
          "@context": { "@base": `https://a.example/b/${"c".repeat(100 * count)}` },
          "@graph": Array.from({ length: count }, (_, at) => ({
            "@id": `x${at}`,
            [`${SM_NS}p`]: { "@id": "y" },
          })),
        });
        return () =>
          expect(archive.readDeckFile(json, "jsonld", base)).rejects.toMatchObject({
            code: "deckFileUnreadable",
          });
      },
      1000,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("refuses JSON-LD with a long prefix and many IRIs through it in time that grows with the file, not its square (GHSA-3jqf-v8x6-qcc3)", async () => {
    // Eight times the file must take less than four times as long as an eighth of it done eight times over.
    const ratio = await growthAsync(
      (count) => {
        const json = JSON.stringify({
          "@context": { p: `${"a".repeat(100 * count)}/` },
          "@graph": Array.from({ length: count }, (_, at) => ({
            "@id": `p:../x${at}`,
            [`${SM_NS}p`]: { "@id": "p:../y" },
          })),
        });
        return () =>
          expect(archive.readDeckFile(json, "jsonld", base)).rejects.toMatchObject({
            code: "deckFileUnreadable",
          });
      },
      1000,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("reads JSON-LD whose key is named twice as JSON.parse does, fetching nothing", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      // The first "@context" is lost to JSON.parse, so the check never sees it.
      const json = `{"@context": "https://evil.example/c", "@context": {"sm": "${SM_NS}"},
        "@id": "#deck", "@type": "sm:Deck"}`;
      await expect(parseDeckFile(json, "jsonld", base)).resolves.toHaveLength(1);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });

  it("refuses JSON nested deeper than a deck file's, however deep, before the parser reads it", async () => {
    const nested = (depth: number) =>
      `{"@id": "#deck", "${SM_NS}p": ${"[".repeat(depth - 1)}"x"${"]".repeat(depth - 1)}}`;
    await expect(archive.readDeckFile(nested(12), "jsonld", base)).rejects.toMatchObject({
      code: "notADeckFile",
    });
    for (const depth of [13, 100_000]) {
      await expect(archive.readDeckFile(nested(depth), "jsonld", base)).rejects.toMatchObject({
        code: "deckFileUnreadable",
        vars: { reason: "The file nests deeper than 12 levels." },
      });
    }
  });

  it("refuses a file larger than a deck file may be, in characters, triples or their terms, though larger than a release may be", async () => {
    const bytes = 64 * 1024 * 1024;
    const quads = 1_000_000;
    const tooLarge = expect.objectContaining({
      code: "deckFileTooLarge",
      vars: expect.objectContaining({ bytes, quads }),
    });
    expect(() => parseDeckFile(" ".repeat(bytes + 1), "turtle", base)).toThrow(tooLarge);
    const triples = (count: number) =>
      `<#a> <${SM_NS}p> ${Array.from({ length: count }, (_, n) => n).join(",")} .`;
    // More triples than a release's, as a deck with its progress has: read.
    await expect(
      parseDeckFile(triples(RELEASE_LIMITS.quads + 1), "turtle", base),
    ).resolves.toHaveLength(RELEASE_LIMITS.quads + 1);
    await expect(archive.readDeckFile(triples(quads + 1), "turtle", base)).rejects.toMatchObject({
      code: "deckFileTooLarge",
    });
    const prefix = `https://example.com/${"n".repeat(100_000)}/`;
    const lines = Array.from({ length: 4_000 }, (_, at) => `p:s${at} p:p p:o${at} .`).join("\n");
    await expect(
      archive.readDeckFile(`@prefix p: <${prefix}> .\n${lines}`, "turtle", base),
    ).rejects.toMatchObject({ code: "deckFileTooLarge" });
    // A release file is held to a release's limits.
    await expect(
      parseDeckFile(triples(RELEASE_LIMITS.quads + 1), "turtle", base, RELEASE_LIMITS),
    ).rejects.toMatchObject({ code: "deckFileTooLarge", vars: RELEASE_LIMITS });
  });
});
