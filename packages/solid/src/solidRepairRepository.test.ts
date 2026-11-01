// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildThing,
  createThing,
  type Dataset,
  getDecimal,
  getInteger,
  getLiteralAll,
  getStringNoLocale,
  getThing,
  getUrl,
  getUrlAll,
  type NamedSubject,
  changesOf,
  setThing,
  toRdfJsDataset,
  withQuads,
} from "./client/rdf";
import type { Quad } from "@rdfjs/types";
import { writeDocument } from "./client/resources";
import { datasetFrom, datasetOfTurtle, getStringWithLocale } from "./testing/datasets";
import type { Repair } from "@solid-memo/domain/repair";
import { getSolidDatasetOrNull } from "./datasets";
import { createSolidRepairRepository } from "./solidRepairRepository";
import { DCAT, DCTERMS, RDF, SM } from "./vocab";

vi.mock("./client/resources", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client/resources")>();
  return {
    ...actual, // A write the pod takes as given, with no version.
    writeDocument: vi.fn(async (_url: string, dataset: object) => ({ dataset, etag: undefined })),
  };
});
vi.mock("./datasets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./datasets")>()),
  getSolidDatasetOrNull: vi.fn(),
}));

const CATALOG = "https://pod.example/solid-memo/a/catalog.ttl";
const REVIEWS = "https://pod.example/solid-memo/a/reviews/deck-1.ttl";
const FOAF_NAME = "http://xmlns.com/foaf/0.1/name";
const XSD_DATETIME = "http://www.w3.org/2001/XMLSchema#dateTime";

function documentOf(url: string, ...things: NamedSubject[]): never {
  return things.reduce<Dataset>(
    (dataset, thing) => setThing(dataset, thing),
    datasetFrom(url),
  ) as never;
}

function repository() {
  return createSolidRepairRepository({ fetch: vi.fn() as unknown as typeof fetch });
}

function repair(
  kind: Repair["kind"],
  subjectUrl: string,
  version = 3,
  documentUrl = CATALOG,
): Repair {
  return { kind, documentUrl, subjectUrl, version };
}

/** Quads as sorted lines, to compare as sets. */
function lines(quads: Iterable<Quad>): string[] {
  return [...quads]
    .map((quad) =>
      JSON.stringify([
        quad.subject.value,
        quad.predicate.value,
        quad.object.termType,
        quad.object.value,
        quad.object.termType === "Literal"
          ? [quad.object.language, quad.object.datatype.value]
          : [],
      ]),
    )
    .sort();
}

function saved(index = 0): Dataset {
  return vi.mocked(writeDocument).mock.calls[index][1] as Dataset;
}

beforeEach(() => {
  vi.mocked(getSolidDatasetOrNull).mockReset();
  vi.mocked(writeDocument).mockReset();
});

describe("applyRepairs", () => {
  it("refuses to repair a subject a newer version of the app has written since, writing nothing", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      documentOf(
        CATALOG,
        buildThing(createThing({ url: `${CATALOG}#deck-1` }))
          .addIri(RDF.type, SM.Deck)
          .addInteger(SM.formatVersion, 99)
          .build(),
      ),
    );
    await expect(
      repository().applyRepairs([repair("remove-subject", `${CATALOG}#deck-1`)]),
    ).rejects.toMatchObject({
      code: "writtenByNewerApp",
    });
    expect(writeDocument).not.toHaveBeenCalled();
  });

  it("fills in a deck's description and direction, in the deck's own format, with one write per document", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      documentOf(
        CATALOG,
        buildThing(createThing({ url: `${CATALOG}#deck-1` }))
          .addIri(RDF.type, SM.Deck)
          .addStringNoLocale(DCTERMS.title, "Capitals")
          .addStringNoLocale(SM.direction, "odd")
          .build(),
        buildThing(createThing({ url: `${CATALOG}#deck-2` }))
          .addIri(RDF.type, SM.Deck)
          .build(),
      ),
    );
    await repository().applyRepairs([
      repair("describe-deck", `${CATALOG}#deck-1`),
      repair("direct-deck", `${CATALOG}#deck-1`),
      repair("describe-deck", `${CATALOG}#deck-2`, 2),
      repair("direct-deck", `${CATALOG}#deck-2`, 2),
    ]);
    expect(writeDocument).toHaveBeenCalledOnce();
    const one = getThing(saved(), `${CATALOG}#deck-1`)!;
    expect(getStringNoLocale(one, DCTERMS.description)).toBe("Flashcards: Capitals.");
    expect(getUrl(one, SM.studyDirection)).toBe(SM.frontToBack);
    expect(getStringNoLocale(one, SM.direction)).toBeNull();
    const two = getThing(saved(), `${CATALOG}#deck-2`)!;
    expect(getStringNoLocale(two, DCTERMS.description)).toBe("Flashcards: a deck.");
    expect(getStringNoLocale(two, SM.direction)).toBe("front-to-back");
  });

  it("describes a format-4 deck in English, from its English title", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      documentOf(
        CATALOG,
        buildThing(createThing({ url: `${CATALOG}#deck-1` }))
          .addIri(RDF.type, SM.Deck)
          .addStringWithLocale(DCTERMS.title, "Huvudstäder", "sv")
          .addStringWithLocale(DCTERMS.title, "Capitals", "en")
          .build(),
        buildThing(createThing({ url: `${CATALOG}#deck-2` }))
          .addIri(RDF.type, SM.Deck)
          .build(),
      ),
    );
    await repository().applyRepairs([
      repair("describe-deck", `${CATALOG}#deck-1`, 4),
      repair("describe-deck", `${CATALOG}#deck-2`, 4),
    ]);
    const one = getThing(saved(), `${CATALOG}#deck-1`)!;
    expect(getStringWithLocale(one, DCTERMS.description, "en")).toBe("Flashcards: Capitals.");
    expect(getStringWithLocale(one, DCTERMS.description, "sv")).toBe("Kortlek: Huvudstäder.");
    expect(getStringWithLocale(one, DCTERMS.title, "sv")).toBe("Huvudstäder");
    const two = getThing(saved(), `${CATALOG}#deck-2`)!;
    expect(getStringWithLocale(two, DCTERMS.description, "en")).toBe("Flashcards: a deck.");
    expect(getStringWithLocale(two, DCTERMS.description, "sv")).toBe("Kortlek: a deck.");
  });

  it("describes a format-5 deck from its title in whatever language it is in", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      documentOf(
        CATALOG,
        buildThing(createThing({ url: `${CATALOG}#deck-1` }))
          .addIri(RDF.type, SM.Deck)
          .addStringWithLocale(DCTERMS.title, "Huvudstäder", "sv")
          .build(),
        buildThing(createThing({ url: `${CATALOG}#deck-2` }))
          .addIri(RDF.type, SM.Deck)
          .addStringWithLocale(DCTERMS.title, "日本語の単語", "ja")
          .build(),
      ),
    );
    await repository().applyRepairs([
      repair("describe-deck", `${CATALOG}#deck-1`, 5),
      repair("describe-deck", `${CATALOG}#deck-2`, 5),
    ]);
    const one = getThing(saved(), `${CATALOG}#deck-1`)!;
    expect(getStringWithLocale(one, DCTERMS.description, "en")).toBe("Flashcards: Huvudstäder.");
    expect(getStringWithLocale(one, DCTERMS.description, "sv")).toBe("Kortlek: Huvudstäder.");
    const two = getThing(saved(), `${CATALOG}#deck-2`)!;
    expect(getStringWithLocale(two, DCTERMS.description, "en")).toBe("Flashcards: 日本語の単語.");
    expect(getStringWithLocale(two, DCTERMS.description, "sv")).toBe("Kortlek: 日本語の単語.");
    expect(getStringWithLocale(two, DCTERMS.title, "ja")).toBe("日本語の単語");
  });

  it("drops a half-written snapshot and recomputes a due day, leaving a state without the facts as it is", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      documentOf(
        REVIEWS,
        buildThing(createThing({ url: `${REVIEWS}#a` }))
          .addIri(RDF.type, SM.ReviewState)
          .addStringNoLocale(SM.due, "soon")
          .addDatetime(SM.lastReviewedAt, new Date("2026-09-21T10:00:00Z"))
          .addInteger(SM.intervalDays, 6)
          .addStringNoLocale(SM.previousDue, "2026-09-20")
          .build(),
        buildThing(createThing({ url: `${REVIEWS}#b` }))
          .addIri(RDF.type, SM.ReviewState)
          .addStringNoLocale(SM.due, "soon")
          .build(),
      ),
    );
    await repository().applyRepairs([
      repair("drop-snapshot", `${REVIEWS}#a`, 2, REVIEWS),
      repair("recompute-due", `${REVIEWS}#a`, 2, REVIEWS),
      repair("recompute-due", `${REVIEWS}#b`, 2, REVIEWS),
    ]);
    const a = getThing(saved(), `${REVIEWS}#a`)!;
    expect(getStringNoLocale(a, SM.previousDue)).toBeNull();
    expect(getStringNoLocale(a, SM.due)).toBe("2026-09-27");
    expect(getStringNoLocale(getThing(saved(), `${REVIEWS}#b`)!, SM.due)).toBe("soon");
  });

  it("leaves a due day as it is when the last review or the next one is past what a date holds", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      documentOf(
        REVIEWS,
        buildThing(createThing({ url: `${REVIEWS}#a` }))
          .addIri(RDF.type, SM.ReviewState)
          .addStringNoLocale(SM.due, "soon")
          // A valid xsd:dateTime the library reads as an invalid date.
          .addLiteral(SM.lastReviewedAt, {
            termType: "Literal",
            value: "300000-01-01T00:00:00Z",
            language: "",
            datatype: { termType: "NamedNode", value: XSD_DATETIME },
          } as never)
          .addInteger(SM.intervalDays, 6)
          .build(),
        buildThing(createThing({ url: `${REVIEWS}#b` }))
          .addIri(RDF.type, SM.ReviewState)
          .addStringNoLocale(SM.due, "soon")
          .addDatetime(SM.lastReviewedAt, new Date("2026-09-21T10:00:00Z"))
          .addInteger(SM.intervalDays, 100_000_000)
          .build(),
        // Within what a date holds, but past the four-digit years of a study day.
        buildThing(createThing({ url: `${REVIEWS}#c` }))
          .addIri(RDF.type, SM.ReviewState)
          .addStringNoLocale(SM.due, "soon")
          .addDatetime(SM.lastReviewedAt, new Date("2026-09-21T10:00:00Z"))
          .addInteger(SM.intervalDays, 3_000_000)
          .build(),
      ),
    );
    await repository().applyRepairs([
      repair("recompute-due", `${REVIEWS}#a`, 2, REVIEWS),
      repair("recompute-due", `${REVIEWS}#b`, 2, REVIEWS),
      repair("recompute-due", `${REVIEWS}#c`, 2, REVIEWS),
    ]);
    expect(getStringNoLocale(getThing(saved(), `${REVIEWS}#a`)!, SM.due)).toBe("soon");
    expect(getStringNoLocale(getThing(saved(), `${REVIEWS}#b`)!, SM.due)).toBe("soon");
    expect(getStringNoLocale(getThing(saved(), `${REVIEWS}#c`)!, SM.due)).toBe("soon");
  });

  it("drops only the unreadable dates of the fields it names, a readable one and the rest kept", async () => {
    const dateTime = (value: string) =>
      ({
        termType: "Literal",
        value,
        language: "",
        datatype: { termType: "NamedNode", value: XSD_DATETIME },
      }) as never;
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      documentOf(
        CATALOG,
        buildThing(createThing({ url: `${CATALOG}#deck-1` }))
          .addIri(RDF.type, SM.Deck)
          .addStringNoLocale(DCTERMS.title, "Capitals")
          .addLiteral(DCTERMS.created, dateTime("300000-01-01T00:00:00Z"))
          .addLiteral(DCTERMS.created, dateTime("2026-01-01T00:00:00Z"))
          .addLiteral(DCTERMS.modified, dateTime("-300000-01-01T00:00:00Z"))
          // A field the repair does not name is not its to change.
          .addLiteral(DCTERMS.issued, dateTime("300000-01-01T00:00:00Z"))
          .build(),
        buildThing(createThing({ url: `${CATALOG}#deck-2` }))
          .addIri(RDF.type, SM.Deck)
          .addLiteral(DCTERMS.created, dateTime("300000-01-01T00:00:00Z"))
          .build(),
      ),
    );
    await repository().applyRepairs([
      {
        ...repair("drop-unreadable-date", `${CATALOG}#deck-1`, 6),
        predicates: [DCTERMS.created, DCTERMS.modified],
      },
      // With no field named, nothing is dropped.
      repair("drop-unreadable-date", `${CATALOG}#deck-2`, 6),
    ]);
    const values = (url: string, predicate: string) =>
      getLiteralAll(getThing(saved(), url)!, predicate).map((literal) => literal.value);
    expect(values(`${CATALOG}#deck-1`, DCTERMS.created)).toEqual(["2026-01-01T00:00:00Z"]);
    expect(values(`${CATALOG}#deck-1`, DCTERMS.modified)).toEqual([]);
    expect(values(`${CATALOG}#deck-1`, DCTERMS.issued)).toEqual(["300000-01-01T00:00:00Z"]);
    expect(getStringNoLocale(getThing(saved(), `${CATALOG}#deck-1`)!, DCTERMS.title)).toBe(
      "Capitals",
    );
    expect(values(`${CATALOG}#deck-2`, DCTERMS.created)).toEqual(["300000-01-01T00:00:00Z"]);
  });

  it("drops an FSRS-6 state's half-written snapshot, its own four terms", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      documentOf(
        REVIEWS,
        buildThing(createThing({ url: `${REVIEWS}#a@fsrs6` }))
          .addIri(RDF.type, SM.ReviewState)
          .addIri(SM.scheduler, SM.fsrs6)
          .addDecimal(SM.previousStability, 2.5)
          .addStringNoLocale(SM.previousDue, "2026-09-20")
          // Not an FSRS-6 term: another app's, it stays.
          .addInteger(SM.previousRepetitions, 3)
          .build(),
      ),
    );
    await repository().applyRepairs([repair("drop-snapshot", `${REVIEWS}#a@fsrs6`, 1, REVIEWS)]);
    const a = getThing(saved(), `${REVIEWS}#a@fsrs6`)!;
    expect(getDecimal(a, SM.previousStability)).toBeNull();
    expect(getStringNoLocale(a, SM.previousDue)).toBeNull();
    expect(getInteger(a, SM.previousRepetitions)).toBe(3);
  });

  it("names an agent after its address, and removes a subject the user gave up on", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      documentOf(
        CATALOG,
        buildThing(createThing({ url: `${CATALOG}#agent-x` }))
          .addIri(RDF.type, "http://xmlns.com/foaf/0.1/Agent")
          .build(),
        buildThing(createThing({ url: "https://alice.example/profile/card" }))
          .addIri(RDF.type, "http://xmlns.com/foaf/0.1/Agent")
          .build(),
        buildThing(createThing({ url: `${CATALOG}#broken` }))
          .addIri(RDF.type, SM.Deck)
          .build(),
      ),
    );
    await repository().applyRepairs([
      repair("name-agent", `${CATALOG}#agent-x`, 1),
      repair("name-agent", "https://alice.example/profile/card", 1),
      repair("remove-subject", `${CATALOG}#broken`),
      repair("describe-deck", `${CATALOG}#gone`),
    ]);
    expect(getStringNoLocale(getThing(saved(), `${CATALOG}#agent-x`)!, FOAF_NAME)).toBe("agent-x");
    expect(
      getStringNoLocale(getThing(saved(), "https://alice.example/profile/card")!, FOAF_NAME),
    ).toBe("https://alice.example/profile/card");
    expect(getThing(saved(), `${CATALOG}#broken`)).toBeNull();
  });

  it("removes a subject from the catalog and its deck group, keeping every other link to it", async () => {
    const deck = `${CATALOG}#deck-1`;
    const agent = `${CATALOG}#agent-x`;
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      documentOf(
        CATALOG,
        buildThing(createThing({ url: `${CATALOG}#catalog` }))
          .addIri(RDF.type, DCAT.Catalog)
          .addUrl(DCTERMS.publisher, agent)
          .addUrl(DCAT.dataset, deck)
          .addUrl(DCAT.dataset, `${CATALOG}#deck-2`)
          .addUrl(DCAT.catalog, `${CATALOG}#group-1`)
          .addUrl(DCAT.catalog, `${CATALOG}#group-2`)
          .build(),
        buildThing(createThing({ url: `${CATALOG}#group-1` }))
          .addIri(RDF.type, SM.DeckGroup)
          .addIri(RDF.type, DCAT.Catalog)
          .addUrl(DCAT.dataset, deck)
          .addUrl(DCAT.catalog, `${CATALOG}#group-2`)
          .build(),
        buildThing(createThing({ url: `${CATALOG}#group-2` }))
          .addIri(RDF.type, SM.DeckGroup)
          .addIri(RDF.type, DCAT.Catalog)
          .build(),
        buildThing(createThing({ url: `${CATALOG}#other` }))
          .addIri(RDF.type, DCAT.Catalog)
          .addUrl(DCAT.dataset, deck)
          .build(),
        buildThing(createThing({ url: deck }))
          .addIri(RDF.type, SM.Deck)
          .addUrl(DCTERMS.creator, agent)
          .build(),
        buildThing(createThing({ url: agent }))
          .addIri(RDF.type, "http://xmlns.com/foaf/0.1/Agent")
          .build(),
      ),
    );
    await repository().applyRepairs([
      repair("remove-subject", deck),
      repair("remove-subject", agent),
      repair("remove-subject", `${CATALOG}#group-2`),
    ]);
    const catalog = getThing(saved(), `${CATALOG}#catalog`)!;
    expect(getUrlAll(catalog, DCAT.dataset)).toEqual([`${CATALOG}#deck-2`]);
    expect(getUrlAll(catalog, DCAT.catalog)).toEqual([`${CATALOG}#group-1`]);
    expect(getUrl(catalog, DCTERMS.publisher)).toBe(agent);
    const group1 = getThing(saved(), `${CATALOG}#group-1`)!;
    expect(getUrlAll(group1, DCAT.dataset)).toEqual([]);
    expect(getUrlAll(group1, DCAT.catalog)).toEqual([]);
    // Only the catalog and the deck groups list the decks.
    expect(getUrlAll(getThing(saved(), `${CATALOG}#other`)!, DCAT.dataset)).toEqual([deck]);
  });

  it("removes a subject from a catalog that lists a member the library takes for no URL, keeping that link", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      (await datasetOfTurtle(
        CATALOG,
        `@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
<#catalog> a dcat:Catalog ; dcat:dataset <#deck-1>, <http://%zz/x>, <urn:x> ; dcat:catalog <#group> .
<#group> a sm:DeckGroup ; dcat:dataset <#deck-1> .
<#deck-1> a sm:Deck .
`,
      )) as never,
    );
    await repository().applyRepairs([repair("remove-subject", `${CATALOG}#deck-1`)]);
    expect(getThing(saved(), `${CATALOG}#deck-1`)).toBeNull();
    const catalog = getThing(saved(), `${CATALOG}#catalog`)!;
    expect(getUrlAll(catalog, DCAT.dataset)).toEqual(["http://%zz/x", "urn:x"]);
    expect(getUrlAll(catalog, DCAT.catalog)).toEqual([`${CATALOG}#group`]);
    expect(getUrlAll(getThing(saved(), `${CATALOG}#group`)!, DCAT.dataset)).toEqual([]);
  });

  // Another app's dataset, described in its own document.
  const FOREIGN_DATASET = "https://pod.example/recipes/index.ttl#cookbook";

  it("drops a catalog's and a deck group's links to decks and groups the document does not describe, never one to another document or to another app's subject", async () => {
    const group = (url: string) =>
      buildThing(createThing({ url }))
        .addIri(RDF.type, SM.DeckGroup)
        .addIri(RDF.type, DCAT.Catalog);
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      documentOf(
        CATALOG,
        buildThing(createThing({ url: `${CATALOG}#catalog` }))
          .addIri(RDF.type, DCAT.Catalog)
          .addUrl(DCAT.dataset, `${CATALOG}#deck-1`)
          .addUrl(DCAT.dataset, `${CATALOG}#deck-old`)
          .addUrl(DCAT.dataset, FOREIGN_DATASET)
          .addUrl(DCAT.dataset, `${CATALOG}#recipes`)
          .addUrl(DCAT.catalog, `${CATALOG}#group-1`)
          .addUrl(DCAT.catalog, `${CATALOG}#group-gone`)
          .addUrl(DCAT.catalog, `${CATALOG}#group-old`)
          .build(),
        group(`${CATALOG}#group-1`)
          .addUrl(DCAT.dataset, `${CATALOG}#deck-1`)
          .addUrl(DCAT.dataset, `${CATALOG}#deck-gone`)
          .addUrl(DCAT.dataset, `${CATALOG}#group-2`)
          .addUrl(DCAT.catalog, `${CATALOG}#group-2`)
          .addUrl(DCAT.catalog, `${CATALOG}#deck-1`)
          .build(),
        group(`${CATALOG}#group-2`).build(),
        buildThing(createThing({ url: `${CATALOG}#deck-1` }))
          .addIri(RDF.type, SM.Deck)
          .addIri(RDF.type, DCAT.Dataset)
          .build(),
        // A deck or group that lost its DCAT class is still one: the catalog keeps it.
        buildThing(createThing({ url: `${CATALOG}#deck-old` }))
          .addIri(RDF.type, SM.Deck)
          .build(),
        buildThing(createThing({ url: `${CATALOG}#group-old` }))
          .addIri(RDF.type, SM.DeckGroup)
          .build(),
        // Another app's dataset, described in this document with a class of its own.
        buildThing(createThing({ url: `${CATALOG}#recipes` }))
          .addIri(RDF.type, "https://schema.org/Dataset")
          .build(),
      ),
    );
    await repository().applyRepairs([
      repair("drop-dangling-members", `${CATALOG}#catalog`, 1),
      repair("drop-dangling-members", `${CATALOG}#group-1`, 1),
    ]);
    const catalog = getThing(saved(), `${CATALOG}#catalog`)!;
    expect(getUrlAll(catalog, DCAT.dataset)).toEqual([
      `${CATALOG}#deck-1`,
      `${CATALOG}#deck-old`,
      FOREIGN_DATASET,
      `${CATALOG}#recipes`,
    ]);
    expect(getUrlAll(catalog, DCAT.catalog)).toEqual([
      `${CATALOG}#group-1`,
      `${CATALOG}#group-old`,
    ]);
    const group1 = getThing(saved(), `${CATALOG}#group-1`)!;
    expect(getUrlAll(group1, DCAT.dataset)).toEqual([`${CATALOG}#deck-1`]);
    expect(getUrlAll(group1, DCAT.catalog)).toEqual([`${CATALOG}#group-2`]);
  });

  it("applies a document's repairs as one at a time would, each to what the ones before it left", async () => {
    const turtle = `@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
<#catalog> a dcat:Catalog ; dcterms:publisher <#pub> ;
  dcat:dataset <#deck-1>, <#deck-2>, <#deck-3> ; dcat:catalog <#group-1>, <#group-2>, <#group-3> .
<#group-1> a sm:DeckGroup, dcat:Catalog ; dcat:dataset <#deck-1>, <#agent>, <#deck-gone> .
<#group-2> a sm:DeckGroup, dcat:Catalog ; dcat:dataset <#deck-2>, <#agent> ; dcat:catalog <#group-3> .
<#group-3> a sm:DeckGroup ; dcat:dataset <#deck-3> .
<#deck-1> a sm:Deck, dcat:Dataset ; dcterms:title "One" .
<#deck-2> a sm:Deck ; dcterms:title "Two" ; dcterms:creator <#agent> .
<#deck-3> a sm:Deck ; dcterms:title "Three" .
<#agent> dcterms:title "Named by deck 2 alone" .
<#pub> dcterms:title "The publisher" .
`;
    const reviews = `@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
<#a> a sm:ReviewState ; sm:due "2026-09-27" ; sm:previousDue "2026-09-20" .
<#b> a sm:ReviewState ; sm:due "2026-09-27" ; sm:previousDue "2026-09-20" .
`;
    const reads: Record<string, string> = { [CATALOG]: turtle, [REVIEWS]: reviews };
    const at = (subject: string, documentUrl = CATALOG) => `${documentUrl}#${subject}`;
    const repairs: Repair[] = [
      // Before deck 2 is removed, the agent it names is Solid Memo's, and no deck: unlinked.
      repair("drop-dangling-members", at("group-1"), 1),
      repair("describe-deck", at("deck-2")),
      repair("drop-snapshot", at("a", REVIEWS), 2, REVIEWS),
      repair("remove-subject", at("deck-2"), 1),
      // After, the agent is another app's: kept.
      repair("drop-dangling-members", at("group-2"), 1),
      repair("describe-deck", at("deck-2")),
      repair("direct-deck", at("deck-1")),
      repair("remove-subject", at("group-3"), 1),
      repair("name-agent", at("pub")),
      repair("drop-snapshot", at("b", REVIEWS), 2, REVIEWS),
      repair("remove-subject", at("deck-1"), 1),
    ];
    const read = async (url: string) => datasetOfTurtle(url, reads[url]);
    vi.mocked(getSolidDatasetOrNull).mockImplementation(read as never);
    await repository().applyRepairs(repairs);
    const together = [saved(0), saved(1)];

    // One repair at a time, each from what the one before wrote, read afresh.
    const one: Record<string, Dataset> = {
      [CATALOG]: await read(CATALOG),
      [REVIEWS]: await read(REVIEWS),
    };
    for (const each of repairs) {
      vi.mocked(writeDocument).mockClear();
      const before = one[each.documentUrl];
      vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
        withQuads(datasetFrom(each.documentUrl), toRdfJsDataset(before)) as never,
      );
      await repository().applyRepairs([each]);
      one[each.documentUrl] = saved();
    }

    for (const [index, url] of [CATALOG, REVIEWS].entries()) {
      const original = new Set(lines(toRdfJsDataset(await read(url))));
      const repaired = lines(toRdfJsDataset(together[index]));
      expect(repaired).toEqual(lines(toRdfJsDataset(one[url])));
      // What is written is what changed, as one repair at a time records it.
      const changes = changesOf(together[index])!;
      expect(lines(changes.additions)).toEqual(repaired.filter((line) => !original.has(line)));
      expect(lines(changes.deletions)).toEqual(
        [...original].filter((line) => !repaired.includes(line)).sort(),
      );
    }
    const catalog = getThing(together[0], at("catalog"))!;
    expect(getUrlAll(catalog, DCAT.dataset)).toEqual([at("deck-3")]);
    expect(getUrlAll(catalog, DCAT.catalog)).toEqual([at("group-1"), at("group-2")]);
    expect(getUrlAll(getThing(together[0], at("group-1"))!, DCAT.dataset)).toEqual([]);
    expect(getUrlAll(getThing(together[0], at("group-2"))!, DCAT.dataset)).toEqual([at("agent")]);
    expect(getThing(together[0], at("deck-2"))).toBeNull();
  });

  it("skips a document that is gone", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await repository().applyRepairs([repair("describe-deck", `${CATALOG}#deck-1`)]);
    expect(writeDocument).not.toHaveBeenCalled();
  });
});
