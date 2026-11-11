// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  buildThing,
  createSolidDataset,
  createThing,
  datasetFromQuads,
  getDecimal,
  getInteger,
  getLiteralAll,
  getStringNoLocale,
  getStringNoLocaleAll,
  getThing,
  getUrl,
  getUrlAll,
  setThing,
  toRdfJsDataset,
} from "./client/rdf";
import { datasetOfTurtle, getStringWithLocale, getStringWithLocaleAll } from "./testing/datasets";
import { cardToRecord } from "@solid-memo/domain/deckRecord";
import { isReviewStateOutdated, upgradeReviewState } from "@solid-memo/domain/migration";
import {
  readShapeTree,
  SHAPE_SOURCES,
  shapesFetch,
} from "@solid-memo/vocab/tooling/testing/shapeSources";
import { deckSubjects, toCards, toDecks, withDeck } from "./mappers/deckMapper";
import { toReviewStates, withReviewStates } from "./mappers/reviewStateMapper";
import { createShaclShapeValidator } from "./shaclShapeValidator";
import type { Literal, Quad } from "@rdfjs/types";
import { describe, expect, it, vi } from "vitest";
import type { ShapeDescriptor } from "@solid-memo/vocab/shapeDescriptor";
import { LATEST_VERSION, type CardV5 } from "@solid-memo/vocab/types.generated";
import {
  CARD_V2,
  CARD_V4,
  CARD_V5,
  CARD_V7,
  COLOR_SET_V1,
  DECK_V2,
  DECK_V4,
  DECK_V6,
  FSRS_REVIEW_STATE_V1,
  LIBRARY_DECK_V5,
  PREFERENCES_V2,
  REVIEW_STATE_V2,
  SHAPES,
} from "@solid-memo/vocab/descriptors.generated";
import {
  applyRecord,
  datetimeLiteral,
  isUnreadableDatetime,
  readDatetime,
  readRecord,
  readVersioned,
  recordThing,
  removeAllUnlessNewer,
  storedVersionOf,
  unlessNewer,
  unreadableDatetimes,
} from "./records";
import { DCTERMS, RDF, SM } from "./vocab";
import { integerLiteral } from "./testing/literals";

const URL_ = "https://pod.example/x.ttl#it";
const EX = "https://example.com/ns#";

/**
 * A valid xsd:dateTime past the year 275760, which a JavaScript date
 * cannot hold: the library reads it as an invalid date, not as none.
 */
const FAR_DATE = {
  termType: "Literal",
  value: "300000-01-01T00:00:00Z",
  language: "",
  datatype: { termType: "NamedNode", value: "http://www.w3.org/2001/XMLSchema#dateTime" },
} as Literal;

interface Thing {
  name: string;
  count?: number;
  ratio?: number;
  when?: string;
  flag?: boolean;
  link?: string;
  mode?: "a" | "b";
  concept?: string;
  tags: readonly string[];
  links: readonly string[];
  concepts: readonly string[];
}

const THING: ShapeDescriptor<Thing> = {
  shape: "card",
  version: 1,
  targetClass: `${EX}Thing`,
  additionalTypes: [`${EX}Extra`],
  absent: [`${EX}gone`],
  fixedValues: [],
  shapeIri: `${EX}shape`,
  shapeDocument: "thing/v1.ttl",
  context: "any",
  fields: [
    { name: "name", predicate: `${EX}name`, kind: "string", cardinality: "one" },
    { name: "count", predicate: `${EX}count`, kind: "integer", cardinality: "optional" },
    { name: "ratio", predicate: `${EX}ratio`, kind: "decimal", cardinality: "optional" },
    { name: "when", predicate: `${EX}when`, kind: "dateTime", cardinality: "optional" },
    { name: "flag", predicate: `${EX}flag`, kind: "boolean", cardinality: "optional" },
    { name: "link", predicate: `${EX}link`, kind: "iri", cardinality: "optional" },
    {
      name: "mode",
      predicate: `${EX}mode`,
      kind: "enum",
      cardinality: "optional",
      values: ["a", "b"],
    },
    { name: "tags", predicate: `${EX}tag`, kind: "string", cardinality: "many" },
    { name: "links", predicate: `${EX}links`, kind: "iri", cardinality: "many" },
    {
      name: "concept",
      predicate: `${EX}concept`,
      kind: "iriEnum",
      cardinality: "optional",
      values: [`${EX}c1`, `${EX}c2`],
    },
    {
      name: "concepts",
      predicate: `${EX}concepts`,
      kind: "iriEnum",
      cardinality: "many",
      values: [`${EX}c1`, `${EX}c2`],
    },
  ],
};

const FULL: Thing = {
  name: "Ann",
  count: 3,
  ratio: 2.5,
  when: "2026-09-21T10:00:00.000Z",
  flag: true,
  link: "https://example.com/a",
  mode: "b",
  concept: `${EX}c2`,
  tags: ["x", "y"],
  links: ["https://example.com/b", "https://example.com/c"],
  concepts: [`${EX}c1`, `${EX}c2`],
};

describe("recordThing and readRecord", () => {
  it("round-trip every kind and cardinality, typing the subject and stamping the version", () => {
    const thing = recordThing(URL_, THING, FULL, null);
    expect(getUrlAll(thing, RDF.type)).toEqual([`${EX}Thing`, `${EX}Extra`]);
    expect(getInteger(thing, SM.formatVersion)).toBe(1);
    expect(getDecimal(thing, `${EX}ratio`)).toBe(2.5);
    expect(readRecord(thing, THING)).toEqual(FULL);
  });

  it("leave out absent optional fields and read them back as absent", () => {
    const thing = recordThing(
      URL_,
      THING,
      { name: "Ann", tags: [], links: [], concepts: [] },
      null,
    );
    expect(readRecord(thing, THING)).toEqual({ name: "Ann", tags: [], links: [], concepts: [] });
  });

  it("edit the existing subject in place: owned predicates replaced, forbidden ones removed, others kept, types not repeated", () => {
    const existing = buildThing(createThing({ url: URL_ }))
      .addIri(RDF.type, `${EX}Thing`)
      .addIri(RDF.type, `${EX}Extra`)
      .addStringNoLocale(`${EX}gone`, "stale")
      .addStringNoLocale(`${EX}name`, "Old")
      .addStringNoLocale(`${EX}tag`, "old")
      .addLiteral(`${EX}count`, integerLiteral(9))
      .addStringNoLocale(`${EX}foreign`, "kept")
      .addLiteral(SM.formatVersion, integerLiteral(0))
      .build();
    const thing = recordThing(
      URL_,
      THING,
      { name: "New", tags: ["fresh"], links: [], concepts: [] },
      existing,
    );
    expect(getUrlAll(thing, RDF.type)).toEqual([`${EX}Thing`, `${EX}Extra`]);
    expect(getStringNoLocale(thing, `${EX}name`)).toBe("New");
    expect(getStringNoLocaleAll(thing, `${EX}tag`)).toEqual(["fresh"]);
    expect(getInteger(thing, `${EX}count`)).toBeNull();
    expect(getStringNoLocale(thing, `${EX}foreign`)).toBe("kept");
    expect(getStringNoLocale(thing, `${EX}gone`)).toBeNull();
    expect(getInteger(thing, SM.formatVersion)).toBe(1);
  });

  it("drop a class another app gave the subject whose shape is closed, as no write would pass it, and keep other classes", async () => {
    const classes = (await readShapeTree())
      .filter((file) => file.turtle.includes("sh:closed true"))
      .map(
        (file) =>
          Object.values(SHAPES)
            .flatMap((versions) => Object.values(versions))
            .find((descriptor) => descriptor.shapeDocument === file.path)?.targetClass,
      );
    // CLOSED_CLASSES in records.ts names these.
    expect(classes).toEqual([SM.ColorSet]);
    const existing = buildThing(createThing({ url: URL_ }))
      .addIri(RDF.type, `${EX}Thing`)
      .addIri(RDF.type, SM.ColorSet)
      .addIri(RDF.type, `${EX}Other`)
      .build();
    expect(getUrlAll(recordThing(URL_, THING, FULL, existing), RDF.type)).toEqual([
      `${EX}Thing`,
      `${EX}Other`,
      `${EX}Extra`,
    ]);
    expect(getUrlAll(recordThing(URL_, COLOR_SET_V1, {}, existing), RDF.type)).toContain(
      SM.ColorSet,
    );
  });

  it("refuse to write over a subject a newer version of the app wrote, and write over one at this app's version or older", () => {
    const stamped = (version: number) =>
      buildThing(createThing({ url: URL_ }))
        .addIri(RDF.type, `${EX}Thing`)
        .addLiteral(SM.formatVersion, integerLiteral(version))
        .build();
    expect(() => recordThing(URL_, THING, FULL, stamped(2))).toThrow(
      expect.objectContaining({
        code: "writtenByNewerApp",
        message: expect.stringContaining(`url: ${URL_}\nversion: 2\nwrites: 1`),
      }),
    );
    expect(getInteger(recordThing(URL_, THING, FULL, stamped(1)), SM.formatVersion)).toBe(1);
    expect(
      getInteger(recordThing(URL_, { ...THING, version: 2 }, FULL, stamped(1)), SM.formatVersion),
    ).toBe(2);
  });
});

describe("numbers written", () => {
  /** The lexical form of the literal a written field holds. */
  const lexical = (thing: ReturnType<typeof recordThing>, predicate: string) =>
    getLiteralAll(thing, predicate)[0]!.value;

  it.each([
    [1e23, -1e-7, "100000000000000000000000", "-0.0000001"],
    [-1.5e21, 1.25e-8, "-1500000000000000000000", "0.0000000125"],
    [42, 2.5, "42", "2.5"],
  ])("spell %s and %s without an exponent", (count, ratio, countForm, ratioForm) => {
    const thing = recordThing(URL_, THING, { ...FULL, count, ratio }, null);
    expect(lexical(thing, `${EX}count`)).toBe(countForm);
    expect(lexical(thing, `${EX}ratio`)).toBe(ratioForm);
    expect(readRecord(thing, THING)).toMatchObject({ count, ratio });
  });

  it("spell a number that is not finite as JavaScript does", () => {
    const thing = recordThing(URL_, THING, { ...FULL, ratio: Number.POSITIVE_INFINITY }, null);
    expect(lexical(thing, `${EX}ratio`)).toBe("Infinity");
  });
});

describe("a change or removal that records no subject", () => {
  const CARD = "https://pod.example/cards.ttl#q";
  const card = (version?: number, type: string = SM.Card) => {
    const builder = buildThing(createThing({ url: CARD })).addIri(RDF.type, type);
    return (
      version === undefined
        ? builder
        : builder.addLiteral(SM.formatVersion, integerLiteral(version))
    ).build();
  };

  it("refuses a subject stamped above every version this app writes for its class", () => {
    const newer = LATEST_VERSION.card + 1;
    expect(() => unlessNewer(card(newer))).toThrow(
      expect.objectContaining({
        code: "writtenByNewerApp",
        message: expect.stringContaining(
          `url: ${CARD}\nversion: ${newer}\nwrites: ${LATEST_VERSION.card}`,
        ),
      }),
    );
    expect(() => removeAllUnlessNewer(setThing(createSolidDataset(), card(newer)), [CARD])).toThrow(
      expect.objectContaining({ code: "writtenByNewerApp" }),
    );
  });

  it("passes one at this app's version or older, one of no class it writes, and the removal of one not there", () => {
    expect(unlessNewer(card(LATEST_VERSION.card))).toEqual(card(LATEST_VERSION.card));
    expect(unlessNewer(card())).toEqual(card());
    expect(unlessNewer(card(99, `${EX}Other`))).toEqual(card(99, `${EX}Other`));
    const dataset = setThing(createSolidDataset(), card(LATEST_VERSION.card));
    expect(getThing(removeAllUnlessNewer(dataset, [CARD]), CARD)).toBeNull();
    expect(getThing(removeAllUnlessNewer(createSolidDataset(), [CARD]), CARD)).toBeNull();
  });
});

describe("a card's text format", () => {
  const CARD = "https://pod.example/cards.ttl#q";
  const marked = () =>
    recordThing(
      CARD,
      CARD_V5,
      { front: { en: "**a**" }, back: { en: "b" }, distractor: [], textFormat: SM.markdown },
      null,
    );

  it("is read, and written in place, with the card", () => {
    expect(readRecord(marked(), CARD_V5)).toMatchObject({ textFormat: SM.markdown });
    const edited = recordThing(
      CARD,
      CARD_V5,
      { front: { en: "a" }, back: { en: "b" }, distractor: [] },
      marked(),
    );
    expect(getUrlAll(edited, SM.textFormat)).toEqual([]);
  });

  it("survives an edit by an app whose card shape predates it, as any predicate the shape does not own", () => {
    const older = {
      ...CARD_V5,
      fields: CARD_V5.fields.filter((field) => field.name !== "textFormat"),
    } as ShapeDescriptor<Omit<CardV5, "textFormat">>;
    const edited = recordThing(
      CARD,
      older,
      { front: { en: "a" }, back: { en: "b" }, distractor: [] },
      marked(),
    );
    expect(getUrlAll(edited, SM.textFormat)).toEqual([SM.markdown]);
    expect(readRecord(edited, CARD_V5)).toMatchObject({
      front: { en: "a" },
      textFormat: SM.markdown,
    });
  });
});

describe("readRecord", () => {
  it("is null when a required field is missing", () => {
    const thing = buildThing(createThing({ url: URL_ }))
      .addLiteral(`${EX}count`, integerLiteral(1))
      .build();
    expect(readRecord(thing, THING)).toBeNull();
  });

  it("treats an enum value the shape does not list as absent", () => {
    const thing = buildThing(createThing({ url: URL_ }))
      .addStringNoLocale(`${EX}name`, "Ann")
      .addStringNoLocale(`${EX}mode`, "z")
      .build();
    expect(readRecord(thing, THING)).toEqual({ name: "Ann", tags: [], links: [], concepts: [] });
    const required: ShapeDescriptor<{ mode: "a" }> = {
      shape: "card",
      version: 1,
      targetClass: `${EX}Thing`,
      additionalTypes: [],
      absent: [],
      fixedValues: [],
      shapeIri: `${EX}shape`,
      shapeDocument: "thing/v1.ttl",
      context: "any",
      fields: [
        { name: "mode", predicate: `${EX}mode`, kind: "enum", cardinality: "one", values: ["a"] },
      ],
    };
    expect(readRecord(thing, required)).toBeNull();
  });

  it("treats a concept the shape does not list as absent", () => {
    const thing = buildThing(createThing({ url: URL_ }))
      .addStringNoLocale(`${EX}name`, "Ann")
      .addIri(`${EX}concept`, `${EX}c9`)
      .addIri(`${EX}concepts`, `${EX}c9`)
      .addIri(`${EX}concepts`, `${EX}c1`)
      .build();
    expect(readRecord(thing, THING)).toEqual({
      name: "Ann",
      tags: [],
      links: [],
      concepts: [`${EX}c1`],
    });
    const required: ShapeDescriptor<{ concept: string }> = {
      ...THING,
      fields: [
        {
          name: "concept",
          predicate: `${EX}concept`,
          kind: "iriEnum",
          cardinality: "one",
          values: [`${EX}c1`],
        },
      ],
    } as unknown as ShapeDescriptor<{ concept: string }>;
    expect(readRecord(thing, required)).toBeNull();
  });

  it("ignores a literal where an IRI is expected", () => {
    const thing = buildThing(createThing({ url: URL_ }))
      .addStringNoLocale(`${EX}name`, "Ann")
      .addStringNoLocale(`${EX}link`, "https://example.com/a")
      .build();
    expect(readRecord(thing, THING)).toEqual({ name: "Ann", tags: [], links: [], concepts: [] });
  });

  it("leaves out an IRI that is no URL, which the library would not write back, and writes the record over it", async () => {
    const dataset = await datasetOfTurtle(
      URL_,
      `<${URL_}> <${EX}name> "Ann" ; <${EX}link> <http://[x>, <https://example.com/a> ;
        <${EX}links> <http://a:99999/x>, <https://example.com/b> .`,
    );
    const thing = getThing(dataset, URL_)!;
    const record = readRecord(thing, THING)!;
    expect(record).toEqual({
      name: "Ann",
      link: "https://example.com/a",
      tags: [],
      links: ["https://example.com/b"],
      concepts: [],
    });
    const written = recordThing(URL_, THING, { ...record, name: "Bo" }, thing);
    expect(getUrlAll(written, `${EX}link`)).toEqual(["https://example.com/a"]);
    expect(getUrlAll(written, `${EX}links`)).toEqual(["https://example.com/b"]);
    // A value the subject has stays as it is when the record keeps it.
    const kept = recordThing(URL_, THING, { ...record, link: "http://[x" }, thing);
    expect(getUrlAll(kept, `${EX}link`)).toEqual(["http://[x"]);
  });

  it("treats a date past what a JavaScript date holds as absent, so a required one does not fit", () => {
    const thing = buildThing(createThing({ url: URL_ }))
      .addStringNoLocale(`${EX}name`, "Ann")
      .addLiteral(`${EX}when`, FAR_DATE)
      .build();
    expect(readRecord(thing, THING)).toEqual({ name: "Ann", tags: [], links: [], concepts: [] });
    const required: ShapeDescriptor<{ when: string }> = {
      ...THING,
      fields: [{ name: "when", predicate: `${EX}when`, kind: "dateTime", cardinality: "one" }],
    } as unknown as ShapeDescriptor<{ when: string }>;
    expect(readRecord(thing, required)).toBeNull();
  });
});

describe("language-tagged text", () => {
  const record = {
    title: { en: "Capitals", sv: "Huvudstäder" },
    description: { en: "Capitals of the world." },
    creator: [],
    studyDirection: `${SM.frontToBack}` as const,
    theme: [],
    keyword: [],
    distribution: [],
    cardsDocument: "https://pod.example/d.ttl",
    reviewsDocument: "https://pod.example/r.ttl",
  };

  it("writes one literal per language and reads them back by tag", () => {
    const thing = recordThing(URL_, DECK_V4, record, null);
    expect(getStringWithLocale(thing, DCTERMS.title, "en")).toBe("Capitals");
    expect(getStringWithLocale(thing, DCTERMS.title, "sv")).toBe("Huvudstäder");
    expect(getStringNoLocale(thing, DCTERMS.title)).toBeNull();
    expect(readRecord(thing, DECK_V4)).toEqual(record);
  });

  it("reads only tagged values, the first of a language twice stated, and none as missing", () => {
    const thing = buildThing(recordThing(URL_, DECK_V4, record, null))
      .addStringWithLocale(DCTERMS.title, "Huvudorter", "sv")
      .addStringNoLocale(DCTERMS.title, "Untagged")
      .build();
    expect(readRecord(thing, DECK_V4)?.title).toEqual({ en: "Capitals", sv: "Huvudstäder" });
    const untagged = buildThing(createThing({ url: URL_ }))
      .addStringNoLocale(DCTERMS.title, "Capitals")
      .build();
    expect(readRecord(untagged, DECK_V4)).toBeNull();
  });
});

describe("several texts per language (a deck's keywords)", () => {
  const KEYWORD = "http://www.w3.org/ns/dcat#keyword";
  const deck = {
    title: { sv: "Huvudstäder" },
    description: { sv: "Kortlek." },
    creator: [],
    studyDirection: `${SM.frontToBack}` as const,
    theme: [],
    keyword: { sv: ["huvudstäder", "länder"], "": ["legacy"], en: ["capitals"] },
    distribution: [],
    cardsDocument: "https://pod.example/d.ttl",
    reviewsDocument: "https://pod.example/r.ttl",
  };

  it("writes one literal per keyword, untagged ones without a tag, and reads them back by tag", () => {
    const thing = recordThing(URL_, DECK_V6, deck, null);
    expect(getStringWithLocaleAll(thing, KEYWORD, "sv")).toEqual(["huvudstäder", "länder"]);
    expect(getStringWithLocaleAll(thing, KEYWORD, "en")).toEqual(["capitals"]);
    expect(getStringNoLocaleAll(thing, KEYWORD)).toEqual(["legacy"]);
    expect(readRecord(thing, DECK_V6)).toEqual({
      ...deck,
      keyword: { "": ["legacy"], en: ["capitals"], sv: ["huvudstäder", "länder"] },
    });
  });

  it("merges tags that differ only in case, each keyword once, and reads none as empty", () => {
    const thing = buildThing(recordThing(URL_, DECK_V6, { ...deck, keyword: {} }, null))
      .addStringWithLocale(KEYWORD, "huvudstäder", "sv")
      .addStringWithLocale(KEYWORD, "städer", "SV")
      .addStringWithLocale(KEYWORD, "huvudstäder", "sv")
      .build();
    expect(readRecord(thing, DECK_V6)?.keyword).toEqual({ sv: ["huvudstäder", "städer"] });
    expect(
      readRecord(recordThing(URL_, DECK_V6, { ...deck, keyword: {} }, null), DECK_V6)?.keyword,
    ).toEqual({});
  });

  it("reads a tag named like a member of Object.prototype as any other", () => {
    // The library's builder throws on such a tag, and writes refuse it (writableTerms.ts): built from quads.
    const keyword = (value: string, language: string) =>
      ({
        subject: { termType: "NamedNode", value: URL_ },
        predicate: { termType: "NamedNode", value: KEYWORD },
        object: {
          termType: "Literal",
          value,
          language,
          datatype: {
            termType: "NamedNode",
            value: "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString",
          },
        },
        graph: { termType: "DefaultGraph", value: "" },
      }) as Quad;
    const record = setThing(
      createSolidDataset(),
      recordThing(URL_, DECK_V6, { ...deck, keyword: {} }, null),
    );
    const thing = getThing(
      datasetFromQuads([
        ...toRdfJsDataset(record),
        keyword("a", "constructor"),
        keyword("b", "Constructor"),
        keyword("c", "toString"),
      ]),
      URL_,
    )!;
    expect(readRecord(thing, DECK_V6)?.keyword).toEqual({
      constructor: ["a", "b"],
      tostring: ["c"],
    });
  });

  it("reads only tagged keywords where the shape allows no untagged ones, and replaces them in place", () => {
    const release = {
      title: { en: "Capitals" },
      description: { en: "Capitals." },
      creator: [],
      publisher: "https://solid-memo.com/decks/index.ttl#solid-memo",
      studyDirection: `${SM.frontToBack}` as const,
      theme: [],
      keyword: { en: ["capitals"] },
      language: [],
      version: "1",
      inSeries: "https://solid-memo.com/decks/index.ttl#capitals",
      isVersionOf: "https://solid-memo.com/decks/index.ttl#capitals",
      distribution: [],
      wasDerivedFrom: [],
    };
    const existing = buildThing(recordThing(URL_, LIBRARY_DECK_V5, release, null))
      .addStringNoLocale(KEYWORD, "stray")
      .build();
    expect(readRecord(existing, LIBRARY_DECK_V5)?.keyword).toEqual({ en: ["capitals"] });
    const thing = recordThing(
      URL_,
      LIBRARY_DECK_V5,
      { ...release, keyword: { sv: ["huvudstäder"] } },
      existing,
    );
    expect(getStringWithLocaleAll(thing, KEYWORD, "en")).toEqual([]);
    expect(getStringNoLocaleAll(thing, KEYWORD)).toEqual([]);
    expect(readRecord(thing, LIBRARY_DECK_V5)?.keyword).toEqual({ sv: ["huvudstäder"] });
  });
});

describe("text that may be untagged (a card's sides)", () => {
  it("writes the empty tag as an untagged literal and other tags as tagged ones, and reads them back", () => {
    const record = { front: { "": "Sweden" }, back: { en: "Stockholm", sv: "Stockholm" } };
    const thing = recordThing(URL_, CARD_V4, record, null);
    expect(getStringNoLocale(thing, SM.front)).toBe("Sweden");
    expect(getStringWithLocale(thing, SM.back, "sv")).toBe("Stockholm");
    expect(getStringNoLocale(thing, SM.back)).toBeNull();
    expect(readRecord(thing, CARD_V4)).toEqual(record);
  });

  it("reads untagged and tagged values together, and a side without text as absent", () => {
    const thing = buildThing(createThing({ url: URL_ }))
      .addStringNoLocale(SM.front, "Sverige")
      .addStringWithLocale(SM.front, "Sweden", "en")
      .addUrl(SM.backImage, "https://flagcdn.com/se.svg")
      .build();
    expect(readRecord(thing, CARD_V4)).toEqual({
      front: { "": "Sverige", en: "Sweden" },
      backImage: "https://flagcdn.com/se.svg",
    });
  });
});

describe("applyRecord", () => {
  it("adds nothing for undefined fields but still clears their old values", () => {
    const builder = buildThing(createThing({ url: URL_ })).addLiteral(
      `${EX}count`,
      integerLiteral(9),
    );
    applyRecord(builder, THING, { name: "Ann", tags: [], links: [], concepts: [] });
    expect(getInteger(builder.build(), `${EX}count`)).toBeNull();
  });
});

describe("a shape that fixes a value (an FSRS-6 review state's scheduler)", () => {
  const STATE = "https://pod.example/reviews.ttl#card-1@fsrs6";
  const RECORD = {
    reviewOf: "https://pod.example/cards.ttl#card-1",
    direction: SM.frontToBack,
    stability: 6.2,
    difficulty: 4.93,
    due: "2026-09-27",
    firstReviewedAt: "2026-09-20T10:00:00.000Z",
    lastReviewedAt: "2026-09-21T10:00:00.000Z",
  } as const;
  const stamped = (version: number, scheduler: string) =>
    buildThing(createThing({ url: STATE }))
      .addIri(RDF.type, SM.ReviewState)
      .addIri(SM.scheduler, scheduler)
      .addLiteral(SM.formatVersion, integerLiteral(version))
      .build();

  it("is written with the value, in place of any other, and read only where it is stated", () => {
    const written = recordThing(STATE, FSRS_REVIEW_STATE_V1, RECORD, stamped(1, SM.sm2));
    expect(getUrlAll(written, SM.scheduler)).toEqual([SM.fsrs6]);
    expect(readVersioned(written, "fsrsReviewState")).toEqual({
      storedVersion: 1,
      record: { version: 1, data: RECORD },
    });
    const sm2 = buildThing(written).setIri(SM.scheduler, SM.sm2).build();
    expect(readVersioned(sm2, "fsrsReviewState")).toBeNull();
  });

  it("refuses a change to a subject newer than the kind it is of writes, not its class's other kinds", () => {
    // Review-state format 2 is written, FSRS review-state format 1: an
    // FSRS-6 state at format 2 is newer than this app writes.
    expect(() => unlessNewer(stamped(2, SM.fsrs6))).toThrow(
      expect.objectContaining({
        code: "writtenByNewerApp",
        message: expect.stringContaining(`url: ${STATE}\nversion: 2\nwrites: 1`),
      }),
    );
    expect(unlessNewer(stamped(1, SM.fsrs6))).toEqual(stamped(1, SM.fsrs6));
    expect(unlessNewer(stamped(2, SM.sm2))).toEqual(stamped(2, SM.sm2));
  });
});

describe("unreadableDatetimes", () => {
  it("names the date-times of a predicate readDatetime reads as none, and only those", () => {
    const thing = buildThing(createThing({ url: URL_ }))
      .addLiteral(`${EX}when`, FAR_DATE)
      .addLiteral(`${EX}when`, datetimeLiteral("2026-01-01T00:00:00Z"))
      .addStringNoLocale(`${EX}when`, "300000-01-01T00:00:00Z")
      .addLiteral(`${EX}other`, FAR_DATE)
      .build();
    expect(unreadableDatetimes(thing, `${EX}when`)).toEqual(["300000-01-01T00:00:00Z"]);
    expect(unreadableDatetimes(thing, `${EX}none`)).toEqual([]);
    expect(isUnreadableDatetime(datetimeLiteral("275760-09-13T00:00:00Z"))).toBe(false);
    expect(isUnreadableDatetime(datetimeLiteral("-300000-01-01T00:00:00Z"))).toBe(true);
    expect(isUnreadableDatetime(datetimeLiteral("soon"))).toBe(true);
    // The library's pattern lets this through, then throws on it.
    expect(isUnreadableDatetime(datetimeLiteral("T2026-01-01T00:00:00Z"))).toBe(true);
    expect(isUnreadableDatetime(FAR_DATE.datatype)).toBe(false);
  });
});

describe("readDatetime", () => {
  const at = (...values: string[]) => {
    const builder = buildThing(createThing({ url: URL_ }));
    for (const value of values) builder.addLiteral(`${EX}when`, datetimeLiteral(value));
    return readDatetime(builder.build(), `${EX}when`);
  };

  it("reads the first date-time of the predicate, as getDatetime does", () => {
    expect(at("2026-01-01T10:00:00Z", "2027-01-01T10:00:00Z")).toEqual(
      new Date("2026-01-01T10:00:00Z"),
    );
    expect(at("2026-01-01T10:00:00.5+02:00")).toEqual(new Date("2026-01-01T12:00:00.005Z"));
    expect(at("+010000-01-01T00:00:00.000Z")).toEqual(new Date("+010000-01-01T00:00:00.000Z"));
    expect(at()).toBeNull();
  });

  it("reads a literal that is not wholly a date-time, or is too long, as none", () => {
    expect(at("2026-01-01T10:00:00Z and more")).toBeNull();
    expect(at(" 2026-01-01T10:00:00Z")).toBeNull();
    expect(at(`2026-01-01T10:00:00.${"0".repeat(44)}Z`)).toBeNull();
    expect(at(`2026-01-01T10:00:00.${"0".repeat(43)}Z`)).toEqual(new Date("2026-01-01T10:00:00Z"));
  });

  it("reads a long run of digits as none without first matching the library's pattern on it", () => {
    const started = performance.now();
    expect(at("1".repeat(100_000))).toBeNull();
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});

describe("readVersioned", () => {
  const card = (version?: number, front = "Sweden") => {
    const b = buildThing(createThing({ url: URL_ }))
      .addIri(RDF.type, SM.Card)
      .addStringNoLocale(SM.front, front)
      .addStringNoLocale(SM.back, "Stockholm");
    if (version !== undefined) b.addLiteral(SM.formatVersion, integerLiteral(version));
    return b.build();
  };

  it("reads a subject with the shape of its stored version, absent meaning 1", () => {
    expect(readVersioned(card(), "card")).toEqual({
      storedVersion: 1,
      record: { version: 1, data: { front: "Sweden", back: "Stockholm" } },
    });
    expect(storedVersionOf(card())).toBe(1);
    expect(readVersioned(card(2), "card")).toEqual({
      storedVersion: 2,
      record: { version: 2, data: { front: "Sweden", back: "Stockholm" } },
    });
  });

  it("reads a newer version with the latest shape it knows, passing the stored version through", () => {
    expect(readVersioned(card(8), "card")).toEqual({
      storedVersion: 8,
      record: {
        version: 7,
        data: { front: { "": "Sweden" }, back: { "": "Stockholm" }, distractor: [], subject: [] },
      },
    });
  });

  it("is null for a version below 1, which no shape has, so no shape checks it", () => {
    expect(readVersioned(card(0), "card")).toBeNull();
    expect(readVersioned(card(-3), "card")).toBeNull();
  });

  it("is null for the wrong class or a subject that does not fit", () => {
    expect(readVersioned(card(), "deck")).toBeNull();
    const noBack = buildThing(createThing({ url: URL_ }))
      .addIri(RDF.type, SM.Card)
      .addStringNoLocale(SM.front, "Sweden")
      .addLiteral(SM.formatVersion, integerLiteral(1))
      .build();
    expect(readVersioned(noBack, "card")).toBeNull();
  });

  it("reads a date past what a JavaScript date holds as absent, and a subject that needs it as not fitting", () => {
    const instance = (created: Literal | string) => {
      const b = buildThing(createThing({ url: URL_ }))
        .addIri(RDF.type, SM.Instance)
        .addStringNoLocale(DCTERMS.title, "Home")
        .addLiteral(SM.formatVersion, integerLiteral(2))
        .addLiteral(DCTERMS.modified, FAR_DATE);
      if (typeof created === "string") b.addLiteral(DCTERMS.created, datetimeLiteral(created));
      else b.addLiteral(DCTERMS.created, created);
      return b.build();
    };
    expect(readVersioned(instance("2026-01-01T00:00:00.000Z"), "instance")).toEqual({
      storedVersion: 2,
      record: { version: 2, data: { title: "Home", created: "2026-01-01T00:00:00.000Z" } },
    });
    expect(readVersioned(instance(FAR_DATE), "instance")).toBeNull();
  });
});

describe("the real descriptors", () => {
  it("write and read a deck, a card, a review state and preferences", () => {
    const deck = recordThing(
      URL_,
      DECK_V2,
      {
        title: "Capitals",
        created: "2026-09-21T10:00:00.000Z",
        creator: ["Anton"],
        license: "https://creativecommons.org/publicdomain/zero/1.0/",
        direction: "bidirectional",
        cardsDocument: "https://pod.example/decks/d.ttl",
        reviewsDocument: "https://pod.example/reviews/d.ttl",
      },
      null,
    );
    expect(getUrl(deck, SM.cardsDocument)).toBe("https://pod.example/decks/d.ttl");
    expect(getStringNoLocale(deck, DCTERMS.title)).toBe("Capitals");
    expect(readVersioned(deck, "deck")?.record.data).toMatchObject({ direction: "bidirectional" });
    const card = recordThing(
      URL_,
      CARD_V2,
      { frontImage: "https://flagcdn.com/se.svg", back: "Sweden" },
      null,
    );
    expect(getUrl(card, SM.frontImage)).toBe("https://flagcdn.com/se.svg");
    const state = recordThing(
      URL_,
      REVIEW_STATE_V2,
      {
        easeFactor: 2.5,
        intervalDays: 1,
        repetitions: 1,
        due: "2026-09-22",
        firstReviewedAt: "2026-09-21T10:00:00.000Z",
        lastReviewedAt: "2026-09-21T10:00:00.000Z",
      },
      null,
    );
    expect(getInteger(state, SM.formatVersion)).toBe(2);
    const prefs = recordThing(
      URL_,
      PREFERENCES_V2,
      {
        newCardsPerDay: 20,
        maxReviewsPerDay: 200,
        dayBoundaryHour: 4,
        answerScale: "sm2",
        developerMode: false,
      },
      null,
    );
    expect(readVersioned(prefs, "preferences")).toEqual({
      storedVersion: 2,
      record: {
        version: 2,
        data: {
          newCardsPerDay: 20,
          maxReviewsPerDay: 200,
          dayBoundaryHour: 4,
          answerScale: "sm2",
          developerMode: false,
        },
      },
    });
  });
});

describe("a date of any year a date holds", () => {
  const INSTANCE = "https://pod.example/solid-memo/a/";
  const CATALOG = `${INSTANCE}catalog.ttl`;
  const CARDS = `${INSTANCE}decks/d1/cards.ttl`;
  const REVIEWS = `${INSTANCE}decks/d1/reviews.ttl`;
  const PREFIXES = `@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
`;
  const { checkSubjects } = createShaclShapeValidator({
    fetch: vi.fn() as never,
    shapesFetch,
    ...SHAPE_SOURCES,
  });

  const DATES = [
    ["12345-01-01T00:00:00Z", "+012345-01-01T00:00:00.000Z", "12345-01-01T00:00:00.000Z"],
    ["10000-06-15T08:30:00Z", "+010000-06-15T08:30:00.000Z", "10000-06-15T08:30:00.000Z"],
    ["-0001-01-01T00:00:00Z", "-000001-01-01T00:00:00.000Z", "-0001-01-01T00:00:00.000Z"],
    ["-271821-04-20T00:00:00Z", "-271821-04-20T00:00:00.000Z", "-271821-04-20T00:00:00.000Z"],
    ["0000-01-01T00:00:00Z", "0000-01-01T00:00:00.000Z", "0000-01-01T00:00:00.000Z"],
    ["2026-01-01T00:00:00Z", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"],
  ] as const;

  it.each(DATES)(
    "keeps a deck's date of %s and passes the write check",
    async (stored, read, written) => {
      const dataset = await datasetOfTurtle(
        CATALOG,
        `${PREFIXES}
<#catalog> a dcat:Catalog ; sm:formatVersion 1 ; dcterms:title "c"@en ; dcterms:description "c"@en ;
  dcterms:publisher <#a> ; dcat:dataset <#d1> .
<#a> a foaf:Agent ; foaf:name "A" .
<#d1> a sm:Deck, dcat:Dataset ; sm:formatVersion 6 ; dcterms:title "t"@en ; dcterms:description "d"@en ;
  dcterms:created "${stored}"^^xsd:dateTime ; dcterms:creator <#a> ; sm:studyDirection sm:frontToBack ;
  dcat:distribution <#dist> ; sm:cardsDocument <${CARDS}> ; sm:reviewsDocument <${REVIEWS}> .
<#dist> a dcat:Distribution ; sm:formatVersion 1 ; dcat:accessURL <${CARDS}> ;
  dcat:mediaType <https://www.iana.org/assignments/media-types/text/turtle> .
`,
      );
      const [deck] = toDecks(dataset, CATALOG);
      expect(deck!.createdAt).toBe(read);
      const edited = withDeck(dataset, { ...deck!, title: { en: "renamed" } });
      await expect(
        checkSubjects(edited, deckSubjects(edited, deck!), "pod"),
      ).resolves.toBeUndefined();
      expect(
        getLiteralAll(getThing(edited, `${CATALOG}#d1`)!, DCTERMS.created).map((one) => one.value),
      ).toEqual([written]);
      expect(toDecks(edited, CATALOG)[0]!.createdAt).toBe(read);
    },
  );

  it.each(DATES)(
    "keeps a card's date of %s and passes the write check",
    async (stored, read, written) => {
      const url = `${CARDS}#c1`;
      const dataset = await datasetOfTurtle(
        CARDS,
        `${PREFIXES}<${url}> a sm:Card ; sm:formatVersion 7 ; sm:front "f"@en ; sm:back "b"@en ;
  dcterms:created "${stored}"^^xsd:dateTime .`,
      );
      const [card] = toCards(dataset);
      expect(card!.createdAt).toBe(read);
      const edited = setThing(
        dataset,
        recordThing(
          url,
          CARD_V7,
          cardToRecord({ ...card!, front: { en: "edited" } }, card!.createdAt!, CARDS),
          getThing(dataset, url),
        ),
      );
      await expect(checkSubjects(edited, [url], "pod")).resolves.toBeUndefined();
      expect(
        getLiteralAll(getThing(edited, url)!, DCTERMS.created).map((one) => one.value),
      ).toEqual([written]);
    },
  );

  it("updates the format of a document holding a review state of such a date, with the others", async () => {
    const state = (id: string, first: string) =>
      `<${REVIEWS}#${id}> a sm:ReviewState ; sm:formatVersion 1 ; sm:reviewOf <${CARDS}#${id}> ;
  sm:reviewDirection sm:frontToBack ; sm:easeFactor 2.5 ; sm:intervalDays 3 ; sm:repetitions 2 ;
  sm:due "2026-02-02" ; sm:firstReviewedAt "${first}"^^xsd:dateTime ;
  sm:lastReviewedAt "2026-01-01T00:00:00Z"^^xsd:dateTime .\n`;
    const dataset = await datasetOfTurtle(
      REVIEWS,
      PREFIXES +
        state("a", "2026-01-01T00:00:00Z") +
        state("b", "12345-01-01T00:00:00Z") +
        state("c", "-0001-01-01T00:00:00Z"),
    );
    const documents = { id: "d1", cardsDocumentUrl: CARDS, reviewsDocumentUrl: REVIEWS } as never;
    const outdated = toReviewStates(dataset, documents).sm2.filter(isReviewStateOutdated);
    expect(outdated).toHaveLength(3);
    const written = withReviewStates(
      dataset,
      documents,
      { sm2: outdated.map(upgradeReviewState) },
      () => "x",
    );
    await expect(checkSubjects(written.dataset, written.subjects, "pod")).resolves.toBeUndefined();
    expect(
      getLiteralAll(getThing(written.dataset, `${REVIEWS}#b`)!, SM.firstReviewedAt).map(
        (one) => one.value,
      ),
    ).toEqual(["12345-01-01T00:00:00.000Z"]);
  });

  it("writes an ordinary date as toISOString spells it, milliseconds and all", () => {
    const written = recordThing(
      URL_,
      DECK_V2,
      {
        title: "Capitals",
        created: "2026-09-21T10:00:00.123Z",
        creator: ["Anton"],
        license: "https://creativecommons.org/publicdomain/zero/1.0/",
        direction: "bidirectional",
        cardsDocument: "https://pod.example/decks/d.ttl",
        reviewsDocument: "https://pod.example/reviews/d.ttl",
      },
      null,
    );
    expect(getLiteralAll(written, DCTERMS.created).map((one) => one.value)).toEqual([
      "2026-09-21T10:00:00.123Z",
    ]);
  });
});
