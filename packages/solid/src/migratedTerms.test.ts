// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * A deck or release in an older format, brought to this app's format in
 * memory, is held to the bound on a term (MAX_TERM_CHARACTERS) as a read
 * is (GHSA-87vh-m93g-54f6): the default description a migration gives
 * it is cut short within the bound, so it can be written, and one the
 * migration would give a longer term, an address or a text it tags,
 * does not fit.
 */
import { describe, expect, it } from "vitest";
import { importedDeck } from "@solid-memo/domain/deckFile";
import { MAX_TERM_CHARACTERS } from "./client/readLimits";
import { toDeck } from "./mappers/deckMapper";
import {
  toLibraryDeckContent,
  toLibraryDecks,
  toStandaloneLibraryDeck,
} from "./mappers/libraryMapper";
import { createSolidDeckArchive } from "./solidDeckArchive";
import { datasetOfTurtle } from "./testing/datasets";
import { INSTANCE, SM, put, read, repositoryInPod } from "./testing/deckWrites";
import { buildThing, createThing, getThing, setThing } from "./client/rdf";
import { datasetFrom } from "./testing/datasets";
import { integerLiteral } from "./testing/literals";
import { DCTERMS, RDF } from "./vocab";

const PREFIXES = `@prefix sm: <${SM}> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
`;

/** A title the read keeps, which the default description's text around it takes past the bound. */
const LONG_TITLE = "T".repeat(16_370);

/** The longest text in a two-letter language a term may hold: its quotes and `@en` take the rest. */
const LONGEST_TAGGED_TEXT = MAX_TERM_CHARACTERS - 5;

const RELEASE = "https://library.example/r/v1.ttl";

/** A release in library deck format 2 with no description, as the advisory's proof has it. */
function releaseTurtle(title: string): string {
  return `${PREFIXES}<> a sm:Deck ; sm:formatVersion 2 ; dcterms:title "${title}" ; sm:direction "front-to-back" ; dcterms:creator "Alice" .
<#c1> a sm:Card ; sm:formatVersion 1 ; sm:front "a" ; sm:back "b" .
`;
}

/** A release's address as long as a read takes one: the series its migration names, `#series` after it, is longer. */
const LONG_RELEASE = `https://library.example/${"p".repeat(MAX_TERM_CHARACTERS - 2 - "https://library.example/".length)}`;

describe("a release with a title as long as a term and no description", () => {
  it("gets a default description within the bound, and its copy is written", async () => {
    const dataset = await datasetOfTurtle(RELEASE, releaseTurtle(LONG_TITLE));
    const release = toStandaloneLibraryDeck(RELEASE, dataset);
    expect(release.title).toEqual({ en: LONG_TITLE });
    for (const text of Object.values(release.description!)) {
      expect(text).toHaveLength(LONGEST_TAGGED_TEXT);
    }
    const { repository } = repositoryInPod();
    const deck = await repository.importDeck(INSTANCE, toLibraryDeckContent(RELEASE, dataset));
    expect(deck.description).toEqual(release.description);
    expect((await repository.listDecks(INSTANCE)).map((each) => each.url)).toEqual([deck.url]);
  });

  it("is not a deck when its migration would name its series past the bound", async () => {
    // Built as read: a Turtle read of a document at so long an address stops at its base.
    const release = buildThing(createThing({ url: LONG_RELEASE }))
      .addIri(RDF.type, `${SM}Deck`)
      .addStringNoLocale(DCTERMS.title, "Short")
      .addStringNoLocale(`${SM}direction`, "front-to-back")
      .addLiteral(`${SM}formatVersion`, integerLiteral(2))
      .build();
    const dataset = setThing(datasetFrom(LONG_RELEASE), release);
    expect(() => toLibraryDeckContent(LONG_RELEASE, dataset)).toThrow(
      expect.objectContaining({ code: "notADeck" }),
    );
  });
});

describe("a library index whose current release would be named past the bound", () => {
  const index = "https://library.example/index.ttl";
  const indexOf = (current: string) => `${PREFIXES}<> a dcat:Catalog ; dcat:dataset <#series> .
<#series> a dcat:DatasetSeries, dcat:Dataset ; dcterms:title "L" ; dcterms:description "L." ; dcterms:publisher <#p> ;
  dcat:first <${current}> ; dcat:last <${current}> ; dcat:hasVersion <${current}> ; dcat:hasCurrentVersion <${current}> .
<${current}> a sm:Deck ; sm:formatVersion 2 ; dcterms:title "L" ; sm:direction "front-to-back" ; dcterms:creator "Alice" .
`;

  it("does not list its series", async () => {
    const listed = async (current: string) =>
      toLibraryDecks(await datasetOfTurtle(index, indexOf(current))).map((deck) => deck.seriesUrl);
    expect(await listed(RELEASE)).toEqual([`${index}#series`]);
    expect(await listed(LONG_RELEASE)).toEqual([]);
  });
});

describe("a deck file with a title as long as a term and no description", () => {
  it("gets a default description within the bound, and is written", async () => {
    const file = "https://file.example/d.ttl";
    const turtle = `${PREFIXES}<${file}#deck> a sm:Deck ; sm:formatVersion 2 ; dcterms:title "${LONG_TITLE}" ; sm:direction "front-to-back" ;
  sm:cardsDocument <https://file.example/cards.ttl> ; sm:reviewsDocument <https://file.example/reviews.ttl> .
<https://file.example/cards.ttl#c1> a sm:Card ; sm:formatVersion 1 ; sm:front "a" ; sm:back "b" .
`;
    const { fetch, repository } = repositoryInPod();
    const content = await createSolidDeckArchive({ fetch, publicFetch: fetch }).readDeckFile(
      turtle,
      "turtle",
      file,
    );
    for (const text of Object.values(content.deck.description!)) {
      expect(text).toHaveLength(LONGEST_TAGGED_TEXT);
    }
    const { deck } = importedDeck(INSTANCE, content, {
      withProgress: false,
      decks: [],
      freshId: "deck-new",
      now: "2026-11-12T00:00:00.000Z",
    });
    await expect(repository.addDeck(deck)).resolves.toEqual(
      expect.objectContaining({ url: deck.url }),
    );
  });
});

describe("a catalog entry in an older format", () => {
  const catalogUrl = `${INSTANCE}catalog.ttl`;
  const entry = (id: string, title: string) =>
    `<#${id}> a <${SM}Deck> ; <http://purl.org/dc/terms/title> "${title}" ; <${SM}cardsDocument> <decks/${id}.ttl> ; <${SM}reviewsDocument> <reviews/${id}.ttl> .`;

  it("with a title as long as a term and no description is brought up to date beside the others", async () => {
    const { fetch, repository } = repositoryInPod();
    await put(
      fetch,
      catalogUrl,
      [
        "<#catalog> a <http://www.w3.org/ns/dcat#Catalog> .",
        entry("deck-0", "Normal"),
        entry("deck-1", LONG_TITLE),
      ].join("\n"),
    );
    expect(await repository.upgradeDecks(INSTANCE, null)).toBe(true);
    const decks = await repository.listDecks(INSTANCE);
    expect(decks.map((deck) => deck.formatVersion)).toEqual([6, 6]);
    expect(decks[1]!.description!.en).toHaveLength(LONGEST_TAGGED_TEXT);
    // And a later save of it is written too.
    await expect(
      repository.saveDeck({ ...decks[1]!, title: { en: "Renamed" } }),
    ).resolves.toBeDefined();
    expect(await read(fetch, catalogUrl)).toContain("Renamed");
  });

  it("in format 3 with the default description as the app wrote it before, whole, is brought up to date", async () => {
    const { fetch, repository } = repositoryInPod();
    const title = "T".repeat(16_367);
    await put(
      fetch,
      catalogUrl,
      [
        "<#catalog> a <http://www.w3.org/ns/dcat#Catalog> .",
        entry("deck-0", "Normal"),
        `${entry("deck-1", title).slice(0, -1)}; <http://purl.org/dc/terms/description> "Flashcards: ${title}." ; <${SM}studyDirection> <${SM}frontToBack> ; <${SM}formatVersion> 3 .`,
      ].join("\n"),
    );
    expect(await repository.upgradeDecks(INSTANCE, null)).toBe(true);
    const decks = await repository.listDecks(INSTANCE);
    expect(decks.map((deck) => deck.formatVersion)).toEqual([6, 6]);
    for (const text of Object.values(decks[1]!.description!)) {
      expect(text.length).toBeLessThanOrEqual(LONGEST_TAGGED_TEXT);
    }
    await expect(
      repository.saveDeck({ ...decks[1]!, title: { en: "Renamed" } }),
    ).resolves.toBeDefined();
  });

  it("whose authors' agents no write would take is left as it is, the others brought up to date", async () => {
    const { fetch, repository } = repositoryInPod();
    await put(
      fetch,
      catalogUrl,
      [
        "<#catalog> a <http://www.w3.org/ns/dcat#Catalog> .",
        entry("deck-0", "Normal"),
        `${entry("deck-1", "Long author").slice(0, -1)}; <http://purl.org/dc/terms/creator> "${"a".repeat(16_370)}" ; <${SM}direction> "front-to-back" ; <${SM}formatVersion> 2 .`,
      ].join("\n"),
    );
    expect(await repository.upgradeDecks(INSTANCE, null)).toBe(true);
    const decks = await repository.listDecks(INSTANCE);
    expect(decks.map((deck) => [deck.title, deck.formatVersion])).toEqual([
      [{ en: "Normal" }, 6],
      [{ en: "Long author" }, 2],
    ]);
  });

  it("whose migration would name its distribution past the bound does not fit", async () => {
    // The entry's own address is as long as an address read may be: its cards document's distribution, `-cards` after it, is longer.
    const id = `#${"d".repeat(MAX_TERM_CHARACTERS - 2 - catalogUrl.length - 1)}`;
    const subject = `${catalogUrl}${id}`;
    const dataset = await datasetOfTurtle(
      catalogUrl,
      `<${subject}> a <${SM}Deck> ; <http://purl.org/dc/terms/title> "Long" ; <${SM}cardsDocument> <decks/d.ttl> ; <${SM}reviewsDocument> <reviews/d.ttl> .`,
    );
    const thing = getThing(dataset, subject);
    expect(thing).not.toBeNull();
    expect(toDeck(thing!)).toBeNull();
  });
});

/** An untagged text the read keeps, past the bound once a migration writes it in English, `@en` after it. */
const LONG_UNTAGGED = "T".repeat(MAX_TERM_CHARACTERS - 3);

describe("an untagged title or description that its tag in English would take past the bound", () => {
  const catalogUrl = `${INSTANCE}catalog.ttl`;
  const format2 = `<${SM}direction> "front-to-back" ; <${SM}formatVersion> 2`;
  const entries = {
    "format 1": "",
    "format 2": ` ; ${format2}`,
    "format 3": ` ; <${SM}studyDirection> <${SM}frontToBack> ; <${SM}formatVersion> 3 ; <http://purl.org/dc/terms/description> "D"`,
  };

  for (const [format, extra] of Object.entries(entries)) {
    for (const [what, title, description] of [
      ["title", LONG_UNTAGGED, ""],
      ["description", "Short", ` ; <http://purl.org/dc/terms/description> "${LONG_UNTAGGED}"`],
    ] as const) {
      // Format 3 names a description of its own, so it takes only the long title.
      if (format === "format 3" && what === "description") continue;
      it(`in a catalog entry in ${format}, its ${what}, does not fit and keeps no other entry back`, async () => {
        const { fetch, repository } = repositoryInPod();
        const entry = (id: string, text: string, rest: string) =>
          `<#${id}> a <${SM}Deck> ; <http://purl.org/dc/terms/title> "${text}" ; <${SM}cardsDocument> <decks/${id}.ttl> ; <${SM}reviewsDocument> <reviews/${id}.ttl>${rest} .`;
        await put(
          fetch,
          catalogUrl,
          [
            "<#catalog> a <http://www.w3.org/ns/dcat#Catalog> .",
            entry("deck-0", "Normal", ""),
            entry("deck-1", title, `${description}${extra}`),
          ].join("\n"),
        );
        expect((await repository.listDecks(INSTANCE)).map((deck) => deck.title)).toEqual([
          { en: "Normal" },
        ]);
        expect(await repository.upgradeDecks(INSTANCE, null)).toBe(true);
        const decks = await repository.listDecks(INSTANCE);
        expect(decks.map((deck) => [deck.title, deck.formatVersion])).toEqual([
          [{ en: "Normal" }, 6],
        ]);
      });
    }
  }

  for (const [what, title, description] of [
    ["title", LONG_UNTAGGED, ""],
    ["description", "Short", ` ; dcterms:description "${LONG_UNTAGGED}"`],
  ] as const) {
    it(`in a release in format 2, its ${what}, is not a deck`, async () => {
      const turtle = `${PREFIXES}<> a sm:Deck ; sm:formatVersion 2 ; dcterms:title "${title}"${description} ; sm:direction "front-to-back" ; dcterms:creator "Alice" .
<#c1> a sm:Card ; sm:formatVersion 1 ; sm:front "a" ; sm:back "b" .
`;
      const dataset = await datasetOfTurtle(RELEASE, turtle);
      expect(() => toLibraryDeckContent(RELEASE, dataset)).toThrow(
        expect.objectContaining({ code: "notADeck" }),
      );
    });
  }

  it("as long as a text in English may be fits", async () => {
    const title = "T".repeat(LONGEST_TAGGED_TEXT);
    const dataset = await datasetOfTurtle(RELEASE, releaseTurtle(title));
    expect(toLibraryDeckContent(RELEASE, dataset).title).toEqual({ en: title });
  });
});
