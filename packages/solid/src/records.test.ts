import {
  buildThing,
  createThing,
  getDecimal,
  getInteger,
  getStringNoLocale,
  getStringNoLocaleAll,
  getStringWithLocale,
  getStringWithLocaleAll,
  getUrl,
  getUrlAll,
} from "@inrupt/solid-client";
import { describe, expect, it } from "vitest";
import type { ShapeDescriptor } from "@solid-memo/vocab/shapeDescriptor";
import type { CardV5 } from "@solid-memo/vocab/types.generated";
import { CARD_V2, CARD_V4, CARD_V5, DECK_V2, DECK_V4, DECK_V6, LIBRARY_DECK_V5, PREFERENCES_V2, REVIEW_STATE_V2 } from "@solid-memo/vocab/descriptors.generated";
import { applyRecord, readRecord, readVersioned, recordThing, storedVersionOf } from "./records";
import { DCTERMS, RDF, SM } from "./vocab";

const URL_ = "https://pod.example/x.ttl#it";
const EX = "https://example.com/ns#";

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
    { name: "mode", predicate: `${EX}mode`, kind: "enum", cardinality: "optional", values: ["a", "b"] },
    { name: "tags", predicate: `${EX}tag`, kind: "string", cardinality: "many" },
    { name: "links", predicate: `${EX}links`, kind: "iri", cardinality: "many" },
    { name: "concept", predicate: `${EX}concept`, kind: "iriEnum", cardinality: "optional", values: [`${EX}c1`, `${EX}c2`] },
    { name: "concepts", predicate: `${EX}concepts`, kind: "iriEnum", cardinality: "many", values: [`${EX}c1`, `${EX}c2`] },
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
    const thing = recordThing(URL_, THING, { name: "Ann", tags: [], links: [], concepts: [] }, null);
    expect(readRecord(thing, THING)).toEqual({ name: "Ann", tags: [], links: [], concepts: [] });
  });

  it("edit the existing subject in place: owned predicates replaced, forbidden ones removed, others kept, types not repeated", () => {
    const existing = buildThing(createThing({ url: URL_ }))
      .addIri(RDF.type, `${EX}Thing`)
      .addIri(RDF.type, `${EX}Extra`)
      .addStringNoLocale(`${EX}gone`, "stale")
      .addStringNoLocale(`${EX}name`, "Old")
      .addStringNoLocale(`${EX}tag`, "old")
      .addInteger(`${EX}count`, 9)
      .addStringNoLocale(`${EX}foreign`, "kept")
      .addInteger(SM.formatVersion, 0)
      .build();
    const thing = recordThing(URL_, THING, { name: "New", tags: ["fresh"], links: [], concepts: [] }, existing);
    expect(getUrlAll(thing, RDF.type)).toEqual([`${EX}Thing`, `${EX}Extra`]);
    expect(getStringNoLocale(thing, `${EX}name`)).toBe("New");
    expect(getStringNoLocaleAll(thing, `${EX}tag`)).toEqual(["fresh"]);
    expect(getInteger(thing, `${EX}count`)).toBeNull();
    expect(getStringNoLocale(thing, `${EX}foreign`)).toBe("kept");
    expect(getStringNoLocale(thing, `${EX}gone`)).toBeNull();
    expect(getInteger(thing, SM.formatVersion)).toBe(1);
  });
});

describe("a card's text format", () => {
  const CARD = "https://pod.example/cards.ttl#q";
  const marked = () =>
    recordThing(CARD, CARD_V5, { front: { en: "**a**" }, back: { en: "b" }, distractor: [], textFormat: SM.markdown }, null);

  it("is read, and written in place, with the card", () => {
    expect(readRecord(marked(), CARD_V5)).toMatchObject({ textFormat: SM.markdown });
    const edited = recordThing(CARD, CARD_V5, { front: { en: "a" }, back: { en: "b" }, distractor: [] }, marked());
    expect(getUrlAll(edited, SM.textFormat)).toEqual([]);
  });

  it("survives an edit by an app whose card shape predates it, as any predicate the shape does not own", () => {
    const older = {
      ...CARD_V5,
      fields: CARD_V5.fields.filter((field) => field.name !== "textFormat"),
    } as ShapeDescriptor<Omit<CardV5, "textFormat">>;
    const edited = recordThing(CARD, older, { front: { en: "a" }, back: { en: "b" }, distractor: [] }, marked());
    expect(getUrlAll(edited, SM.textFormat)).toEqual([SM.markdown]);
    expect(readRecord(edited, CARD_V5)).toMatchObject({ front: { en: "a" }, textFormat: SM.markdown });
  });
});

describe("readRecord", () => {
  it("is null when a required field is missing", () => {
    const thing = buildThing(createThing({ url: URL_ })).addInteger(`${EX}count`, 1).build();
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
      shapeIri: `${EX}shape`,
      shapeDocument: "thing/v1.ttl",
      context: "any",
      fields: [{ name: "mode", predicate: `${EX}mode`, kind: "enum", cardinality: "one", values: ["a"] }],
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
    expect(readRecord(thing, THING)).toEqual({ name: "Ann", tags: [], links: [], concepts: [`${EX}c1`] });
    const required: ShapeDescriptor<{ concept: string }> = {
      ...THING,
      fields: [{ name: "concept", predicate: `${EX}concept`, kind: "iriEnum", cardinality: "one", values: [`${EX}c1`] }],
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
    const untagged = buildThing(createThing({ url: URL_ })).addStringNoLocale(DCTERMS.title, "Capitals").build();
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
    expect(readRecord(thing, DECK_V6)).toEqual({ ...deck, keyword: { "": ["legacy"], en: ["capitals"], sv: ["huvudstäder", "länder"] } });
  });

  it("merges tags that differ only in case, each keyword once, and reads none as empty", () => {
    const thing = buildThing(recordThing(URL_, DECK_V6, { ...deck, keyword: {} }, null))
      .addStringWithLocale(KEYWORD, "huvudstäder", "sv")
      .addStringWithLocale(KEYWORD, "städer", "SV")
      .addStringWithLocale(KEYWORD, "huvudstäder", "sv")
      .build();
    expect(readRecord(thing, DECK_V6)?.keyword).toEqual({ sv: ["huvudstäder", "städer"] });
    expect(readRecord(recordThing(URL_, DECK_V6, { ...deck, keyword: {} }, null), DECK_V6)?.keyword).toEqual({});
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
    const existing = buildThing(recordThing(URL_, LIBRARY_DECK_V5, release, null)).addStringNoLocale(KEYWORD, "stray").build();
    expect(readRecord(existing, LIBRARY_DECK_V5)?.keyword).toEqual({ en: ["capitals"] });
    const thing = recordThing(URL_, LIBRARY_DECK_V5, { ...release, keyword: { sv: ["huvudstäder"] } }, existing);
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
    expect(readRecord(thing, CARD_V4)).toEqual({ front: { "": "Sverige", en: "Sweden" }, backImage: "https://flagcdn.com/se.svg" });
  });
});

describe("applyRecord", () => {
  it("adds nothing for undefined fields but still clears their old values", () => {
    const builder = buildThing(createThing({ url: URL_ })).addInteger(`${EX}count`, 9);
    applyRecord(builder, THING, { name: "Ann", tags: [], links: [], concepts: [] });
    expect(getInteger(builder.build(), `${EX}count`)).toBeNull();
  });
});

describe("readVersioned", () => {
  const card = (version?: number, front = "Sweden") => {
    const b = buildThing(createThing({ url: URL_ }))
      .addIri(RDF.type, SM.Card)
      .addStringNoLocale(SM.front, front)
      .addStringNoLocale(SM.back, "Stockholm");
    if (version !== undefined) b.addInteger(SM.formatVersion, version);
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
    expect(readVersioned(card(7), "card")).toEqual({
      storedVersion: 7,
      record: { version: 5, data: { front: { "": "Sweden" }, back: { "": "Stockholm" }, distractor: [] } },
    });
    expect(readVersioned(card(0), "card")?.record.version).toBe(1);
  });

  it("is null for the wrong class or a subject that does not fit", () => {
    expect(readVersioned(card(), "deck")).toBeNull();
    const noBack = buildThing(createThing({ url: URL_ }))
      .addIri(RDF.type, SM.Card)
      .addStringNoLocale(SM.front, "Sweden")
      .addInteger(SM.formatVersion, 1)
      .build();
    expect(readVersioned(noBack, "card")).toBeNull();
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
    const card = recordThing(URL_, CARD_V2, { frontImage: "https://flagcdn.com/se.svg", back: "Sweden" }, null);
    expect(getUrl(card, SM.frontImage)).toBe("https://flagcdn.com/se.svg");
    const state = recordThing(
      URL_,
      REVIEW_STATE_V2,
      { easeFactor: 2.5, intervalDays: 1, repetitions: 1, due: "2026-09-22", firstReviewedAt: "2026-09-21T10:00:00.000Z", lastReviewedAt: "2026-09-21T10:00:00.000Z" },
      null,
    );
    expect(getInteger(state, SM.formatVersion)).toBe(2);
    const prefs = recordThing(
      URL_,
      PREFERENCES_V2,
      { newCardsPerDay: 20, maxReviewsPerDay: 200, dayBoundaryHour: 4, answerScale: "sm2", developerMode: false },
      null,
    );
    expect(readVersioned(prefs, "preferences")).toEqual({
      storedVersion: 2,
      record: { version: 2, data: { newCardsPerDay: 20, maxReviewsPerDay: 200, dayBoundaryHour: 4, answerScale: "sm2", developerMode: false } },
    });
  });
});
