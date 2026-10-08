import { describe, expect, it } from "vitest";
import type { Deck, Distractor } from "./deck";
import {
  cardContentFromRecord,
  cardFromRecord,
  cardToRecord,
  deckAgents,
  deckDistribution,
  deckFromRecord,
  deckToRecord,
  libraryCardFromRecord,
  distractorFromRecord,
  distractorToRecord,
  libraryDeckFromRecord,
} from "./deckRecord";

const CATALOG = "https://pod.example/solid-memo/a/catalog.ttl";
const CARDS = "https://pod.example/solid-memo/a/decks/deck-1.ttl";
const REVIEWS = "https://pod.example/solid-memo/a/reviews/deck-1.ttl";
const FLAG = "https://flagcdn.com/se.svg";

const deck: Deck = {
  id: "deck-1",
  url: `${CATALOG}#deck-1`,
  title: { en: "Capitals" },
  cardsDocumentUrl: CARDS,
  reviewsDocumentUrl: REVIEWS,
  createdAt: "2026-09-21T10:00:00.000Z",
  modifiedAt: "2026-09-27T20:12:13.000Z",
  formatVersion: 2,
  direction: "bidirectional",
  authors: ["Anton Wiklund"],
  license: "https://creativecommons.org/publicdomain/zero/1.0/",
  description: { en: "From Wikipedia." },
  sourceUrl: "https://solid-memo.com/decks/capitals/v1.ttl",
};

const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";
const TOPIC = "https://solid-memo.com/ns/vocab/topics.ttl#geography";
const ANTON = `${CATALOG}#agent-anton-wiklund`;
const byAgent = (agent: string) => (agent === ANTON ? "Anton Wiklund" : agent);

describe("deck records", () => {
  it("round-trip a deck with every field, its creators as agents", () => {
    const full: Deck = {
      ...deck,
      formatVersion: 3,
      sourceUrl: "https://solid-memo.com/decks/capitals/v1.ttl",
      themes: [TOPIC],
      keywords: { en: ["capitals", "countries"], sv: ["huvudstäder"], "": ["legacy"] },
      newCardsPerDay: 5,
      maxReviewsPerDay: 0,
    };
    const record = deckToRecord(full);
    expect(record).toEqual({
      title: { en: "Capitals" },
      description: deck.description,
      created: deck.createdAt,
      modified: deck.modifiedAt,
      creator: [ANTON],
      license: deck.license,
      studyDirection: `${SM}bidirectional`,
      theme: [TOPIC],
      keyword: { en: ["capitals", "countries"], sv: ["huvudstäder"], "": ["legacy"] },
      distribution: [`${deck.url}-cards`],
      cardsDocument: CARDS,
      reviewsDocument: REVIEWS,
      source: full.sourceUrl,
      newCardsPerDay: 5,
      maxReviewsPerDay: 0,
    });
    expect(deckFromRecord(deck.url, 3, record, byAgent)).toEqual(full);
  });

  it("round-trip a title and description in every language they are in", () => {
    const record = deckToRecord({
      ...deck,
      title: { "en-gb": "Capitals", sv: "Huvudstäder" },
      description: { "en-gb": "From Wikipedia.", sv: "Från Wikipedia." },
    });
    expect(record.title).toEqual({ "en-gb": "Capitals", sv: "Huvudstäder" });
    expect(record.description).toEqual({ "en-gb": "From Wikipedia.", sv: "Från Wikipedia." });
    const read = deckFromRecord(deck.url, 4, record, byAgent);
    expect(read.title).toEqual({ "en-gb": "Capitals", sv: "Huvudstäder" });
    expect(read.description).toEqual({ "en-gb": "From Wikipedia.", sv: "Från Wikipedia." });
  });

  it("give a deck without a description the default one, and leave out what it does not have", () => {
    const bare: Deck = {
      id: "deck-1",
      url: `${CATALOG}#deck-1`,
      title: { en: "Own" },
      cardsDocumentUrl: CARDS,
      reviewsDocumentUrl: REVIEWS,
      createdAt: "",
      formatVersion: 1,
      direction: "front-to-back",
      authors: [],
    };
    const record = deckToRecord(bare);
    expect(record).toEqual({
      title: { en: "Own" },
      description: { en: "Flashcards: Own.", sv: "Kortlek: Own." },
      creator: [],
      studyDirection: `${SM}frontToBack`,
      theme: [],
      keyword: {},
      distribution: [`${bare.url}-cards`],
      cardsDocument: CARDS,
      reviewsDocument: REVIEWS,
    });
    expect(deckFromRecord(bare.url, 1, record, byAgent)).toEqual({
      ...bare,
      description: { en: "Flashcards: Own.", sv: "Kortlek: Own." },
    });
  });

  it("name the agents beside a deck, one per author, and its cards document as its distribution", () => {
    const withTwo: Deck = { ...deck, authors: ["Anton Wiklund", "A friend <friend@example.com>", "Anton Wiklund"] };
    expect(deckAgents(withTwo)).toEqual([
      { url: ANTON, record: { name: "Anton Wiklund" } },
      {
        url: `${CATALOG}#agent-a-friend-friend-example-com`,
        record: { name: "A friend", mbox: "mailto:friend@example.com" },
      },
    ]);
    expect(deckDistribution(deck)).toEqual({
      url: `${deck.url}-cards`,
      record: {
        accessUrl: CARDS,
        mediaType: "https://www.iana.org/assignments/media-types/text/turtle",
      },
    });
  });
});

describe("card records", () => {
  it("round-trip text, pictures and the creation time", () => {
    const record = cardToRecord(
      { front: { "": "Flag" }, back: { "": "Sweden" }, frontImageUrl: FLAG, backImageUrl: FLAG },
      "2026-09-21T10:00:00.000Z",
      CARDS,
    );
    expect(record).toEqual({
      front: { "": "Flag" },
      back: { "": "Sweden" },
      frontImage: FLAG,
      backImage: FLAG,
      created: "2026-09-21T10:00:00.000Z",
      distractor: [],
    });
    expect(cardFromRecord(`${CARDS}#se`, 2, record)).toEqual({
      id: "se",
      url: `${CARDS}#se`,
      front: { "": "Flag" },
      back: { "": "Sweden" },
      frontImageUrl: FLAG,
      backImageUrl: FLAG,
      createdAt: "2026-09-21T10:00:00.000Z",
      formatVersion: 2,
    });
  });

  it("leave out empty text, missing pictures and an unknown creation time", () => {
    expect(cardToRecord({ front: {}, back: { "": "Sweden" }, frontImageUrl: FLAG }, "", CARDS)).toEqual({
      back: { "": "Sweden" },
      frontImage: FLAG,
      distractor: [],
    });
    expect(cardFromRecord(`${CARDS}#se`, 1, { back: { "": "Sweden" }, frontImage: FLAG, distractor: [] })).toEqual({
      id: "se",
      url: `${CARDS}#se`,
      front: {},
      back: { "": "Sweden" },
      frontImageUrl: FLAG,
      createdAt: "",
      formatVersion: 1,
    });
  });

  it("round-trip a card of text only", () => {
    const record = cardToRecord({ front: { "": "Sweden" }, back: { "": "Stockholm" } }, "", CARDS);
    expect(record).toEqual({ front: { "": "Sweden" }, back: { "": "Stockholm" }, distractor: [] });
    expect(cardToRecord({ front: { "": "Sweden" }, back: {}, backImageUrl: FLAG }, "", CARDS)).toEqual({ front: { "": "Sweden" }, backImage: FLAG, distractor: [] });
    expect(cardFromRecord(`${CARDS}#se`, 2, record)).toEqual({
      id: "se",
      url: `${CARDS}#se`,
      front: { "": "Sweden" },
      back: { "": "Stockholm" },
      createdAt: "",
      formatVersion: 2,
    });
  });

  it("round-trip the notes under each side and the label above the back", () => {
    const content = {
      front: { "": "Aktiemäklare" },
      frontNote: { en: "Out of use" },
      backLabel: { en: "Replaced by" },
      back: { "": "Finansmäklare" },
      backNote: { en: "Version 30." },
    };
    const record = cardToRecord(content, "", CARDS);
    expect(record).toEqual({ ...content, distractor: [] });
    expect(cardFromRecord(`${CARDS}#a`, 3, record)).toMatchObject(content);
  });

  it("round-trip the description of each side's picture", () => {
    const content = {
      front: {},
      frontImageUrl: "https://flagcdn.com/se.svg",
      frontImageDescription: { en: "A blue flag with a yellow cross", sv: "En blå flagga med ett gult kors" },
      back: { "": "Sweden" },
      backImageUrl: "https://example.org/stockholm.jpg",
      backImageDescription: { sv: "Stockholms stadshus" },
    };
    const record = cardToRecord(content, "", CARDS);
    expect(record).toEqual({
      frontImage: content.frontImageUrl,
      frontImageDescription: content.frontImageDescription,
      back: content.back,
      backImage: content.backImageUrl,
      backImageDescription: content.backImageDescription,
      distractor: [],
    });
    expect(cardFromRecord(`${CARDS}#se`, 4, record)).toMatchObject(content);
  });

  it("round-trip a retired card, and leave the retirement out of a card in use", () => {
    const record = cardToRecord({ front: { "": "Yugoslavia" }, back: { "": "Belgrade" }, retired: true }, "", CARDS);
    expect(record).toEqual({ front: { "": "Yugoslavia" }, back: { "": "Belgrade" }, deprecated: true, distractor: [] });
    expect(cardFromRecord(`${CARDS}#yu`, 3, record)).toMatchObject({ id: "yu", retired: true });
    expect(cardFromRecord(`${CARDS}#yu`, 3, { ...record, deprecated: false })).not.toHaveProperty("retired");
    expect(cardToRecord({ front: { "": "Sweden" }, back: { "": "Stockholm" } }, "", CARDS)).not.toHaveProperty("deprecated");
  });

  it("have no content when a side has neither text nor a picture", () => {
    expect(cardContentFromRecord({ back: { "": "Sweden" }, distractor: [] })).toBeNull();
    expect(cardContentFromRecord({ front: { "": "Sweden" }, distractor: [] })).toBeNull();
    expect(cardFromRecord(`${CARDS}#se`, 2, { front: { "": "x" }, distractor: [] })).toBeNull();
    expect(libraryCardFromRecord(`${CARDS}#se`, 2, { front: { "": "x" }, distractor: [] })).toBeNull();
  });

  it("read a library card, retired or not, keeping its fragment id", () => {
    expect(libraryCardFromRecord("https://solid-memo.com/decks/x/v2.ttl#se", 3, { front: { "": "Sweden" }, back: { "": "Stockholm" }, distractor: [] })).toEqual({
      id: "se",
      front: { "": "Sweden" },
      back: { "": "Stockholm" },
      formatVersion: 3,
    });
    expect(
      libraryCardFromRecord("https://solid-memo.com/decks/x/v2.ttl#yu", 3, { front: { "": "Yugoslavia" }, back: { "": "Belgrade" }, deprecated: true, distractor: [] }),
    ).toEqual({ id: "yu", front: { "": "Yugoslavia" }, back: { "": "Belgrade" }, formatVersion: 3, retired: true });
  });

  it("name a card's distractors as subjects of its document, and read them back as the document has them", () => {
    const distractors: Distractor[] = [
      { id: "q-d1", text: { en: "Only web pages", sv: "Bara webbsidor" }, note: { en: "A URL is one kind of IRI." } },
      { id: "q-d2", text: { "": "404" } },
    ];
    const record = cardToRecord({ front: { en: "What can an IRI name?" }, back: { en: "Anything" }, distractors }, "", CARDS);
    expect(record.distractor).toEqual([`${CARDS}#q-d1`, `${CARDS}#q-d2`]);
    expect(cardFromRecord(`${CARDS}#q`, 5, record, distractors)).toMatchObject({ id: "q", distractors });
    expect(cardFromRecord(`${CARDS}#q`, 5, record)).not.toHaveProperty("distractors");
    expect(libraryCardFromRecord("https://solid-memo.com/decks/x/v1.ttl#q", 5, record, distractors)).toMatchObject({ distractors });
  });
});

describe("a card's text format", () => {
  const MARKDOWN = "https://solid-memo.com/ns/vocab/v1.ttl#markdown";
  it("is written and read back as the card has it, absent when it has none", () => {
    const record = cardToRecord({ front: { en: "**Staged**" }, back: { zxx: "`git diff --staged`" }, textFormat: MARKDOWN }, "", CARDS);
    expect(record).toEqual({ front: { en: "**Staged**" }, back: { zxx: "`git diff --staged`" }, distractor: [], textFormat: MARKDOWN });
    expect(cardFromRecord(`${CARDS}#q`, 5, record)).toMatchObject({ id: "q", textFormat: MARKDOWN });
    expect(libraryCardFromRecord("https://solid-memo.com/decks/x/v2.ttl#q", 5, record)).toMatchObject({ textFormat: MARKDOWN });
    // A concept this app does not know is kept as it is: it reads as plain text.
    expect(cardContentFromRecord({ ...record, textFormat: "https://example.org/formats#asciidoc" })).toMatchObject({
      textFormat: "https://example.org/formats#asciidoc",
    });
    expect(cardContentFromRecord({ front: { en: "a" }, back: { en: "b" }, distractor: [] })).not.toHaveProperty("textFormat");
  });
});

describe("distractor records", () => {
  it("round-trip the text and the note, keeping the fragment id", () => {
    const distractor = { id: "q-d1", text: { en: "Only web pages" }, note: { en: "A URL is one kind of IRI." } };
    expect(distractorToRecord(distractor)).toEqual({ text: distractor.text, note: distractor.note });
    expect(distractorFromRecord(`${CARDS}#q-d1`, distractorToRecord(distractor))).toEqual(distractor);
    expect(distractorToRecord({ id: "q-d2", text: { "": "404" } })).toEqual({ text: { "": "404" } });
  });

  it("leave out an empty note, and have none when the text is empty or the distractor is retired", () => {
    expect(distractorFromRecord(`${CARDS}#d`, { text: { en: "x" }, note: {} })).toEqual({ id: "d", text: { en: "x" } });
    expect(distractorFromRecord(`${CARDS}#d`, { text: {} })).toBeNull();
    expect(distractorFromRecord(`${CARDS}#d`, { text: { en: "x" }, deprecated: true })).toBeNull();
    expect(distractorFromRecord(`${CARDS}#d`, { text: { en: "x" }, deprecated: false })).toEqual({ id: "d", text: { en: "x" } });
  });
});

describe("library deck records", () => {
  const RELEASE = "https://solid-memo.com/decks/capitals/v1.ttl";
  const release = {
    title: { en: "Capitals" },
    description: { en: "From Wikipedia." },
    creator: [ANTON],
    publisher: "https://solid-memo.com/decks/index.ttl#solid-memo",
    studyDirection: `${SM}frontToBack` as const,
    theme: ["http://publications.europa.eu/resource/authority/data-theme/EDUC", TOPIC],
    keyword: { en: ["capitals"], sv: ["huvudstäder", "länder"] },
    language: [],
    version: "1",
    inSeries: "https://solid-memo.com/decks/index.ttl#capitals",
    isVersionOf: "https://solid-memo.com/decks/index.ttl#capitals",
    distribution: [`${RELEASE}#turtle`],
    wasDerivedFrom: [],
  };

  it("build a release's content around its cards", () => {
    const cards = [{ id: "se", front: { "": "Sweden" }, back: { "": "Stockholm" }, formatVersion: 1 }];
    expect(libraryDeckFromRecord(RELEASE, 4, release, cards, byAgent)).toEqual({
      url: RELEASE,
      title: { en: "Capitals" },
      formatVersion: 4,
      authors: ["Anton Wiklund"],
      description: { en: "From Wikipedia." },
      direction: "front-to-back",
      version: "1",
      seriesUrl: "https://solid-memo.com/decks/index.ttl#capitals",
      themes: release.theme,
      keywords: { en: ["capitals"], sv: ["huvudstäder", "länder"] },
      cards,
    });
  });

  it("keep a release's title and description in every language they are in", () => {
    const content = libraryDeckFromRecord(
      RELEASE,
      4,
      { ...release, title: { sv: "Huvudstäder", en: "Capitals" }, description: { en: "From Wikipedia." } },
      [],
      byAgent,
    );
    expect(content.title).toEqual({ sv: "Huvudstäder", en: "Capitals" });
    expect(content.description).toEqual({ en: "From Wikipedia." });
  });

  it("carry the licence, version notes and modification time when stated", () => {
    expect(
      libraryDeckFromRecord(
        RELEASE,
        4,
        {
          ...release,
          license: "https://creativecommons.org/publicdomain/zero/1.0/",
          versionNotes: "Added Norway.",
          modified: "2026-09-27T20:12:13.000Z",
          studyDirection: `${SM}bidirectional`,
        },
        [],
        byAgent,
      ),
    ).toMatchObject({
      license: "https://creativecommons.org/publicdomain/zero/1.0/",
      versionNotes: "Added Norway.",
      modifiedAt: "2026-09-27T20:12:13.000Z",
      direction: "bidirectional",
    });
  });
});
