import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildThing,
  createThing,
  getStringNoLocale,
  getStringWithLocale,
  getThing,
  getUrl,
  getUrlAll,
  mockSolidDatasetFrom,
  saveSolidDatasetAt,
  setThing,
  type SolidDataset,
  type ThingPersisted,
} from "@inrupt/solid-client";
import type { Repair } from "@solid-memo/domain/repair";
import { getSolidDatasetOrNull } from "./datasets";
import { createSolidRepairRepository } from "./solidRepairRepository";
import { DCAT, DCTERMS, RDF, SM } from "./vocab";

vi.mock("@inrupt/solid-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@inrupt/solid-client")>();
  return { ...actual, saveSolidDatasetAt: vi.fn() };
});
vi.mock("./datasets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./datasets")>()),
  getSolidDatasetOrNull: vi.fn(),
}));

const CATALOG = "https://pod.example/solid-memo/a/catalog.ttl";
const REVIEWS = "https://pod.example/solid-memo/a/reviews/deck-1.ttl";
const FOAF_NAME = "http://xmlns.com/foaf/0.1/name";

function documentOf(url: string, ...things: ThingPersisted[]): never {
  return things.reduce<SolidDataset>((dataset, thing) => setThing(dataset, thing), mockSolidDatasetFrom(url)) as never;
}

function repository() {
  return createSolidRepairRepository({ fetch: vi.fn() as unknown as typeof fetch });
}

function repair(kind: Repair["kind"], subjectUrl: string, version = 3, documentUrl = CATALOG): Repair {
  return { kind, documentUrl, subjectUrl, version };
}

function saved(index = 0): SolidDataset {
  return vi.mocked(saveSolidDatasetAt).mock.calls[index][1] as SolidDataset;
}

beforeEach(() => {
  vi.mocked(getSolidDatasetOrNull).mockReset();
  vi.mocked(saveSolidDatasetAt).mockReset();
});

describe("applyRepairs", () => {
  it("fills in a deck's description and direction, in the deck's own format, with one write per document", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      documentOf(
        CATALOG,
        buildThing(createThing({ url: `${CATALOG}#deck-1` })).addIri(RDF.type, SM.Deck).addStringNoLocale(DCTERMS.title, "Capitals").addStringNoLocale(SM.direction, "odd").build(),
        buildThing(createThing({ url: `${CATALOG}#deck-2` })).addIri(RDF.type, SM.Deck).build(),
      ),
    );
    await repository().applyRepairs([
      repair("describe-deck", `${CATALOG}#deck-1`),
      repair("direct-deck", `${CATALOG}#deck-1`),
      repair("describe-deck", `${CATALOG}#deck-2`, 2),
      repair("direct-deck", `${CATALOG}#deck-2`, 2),
    ]);
    expect(saveSolidDatasetAt).toHaveBeenCalledOnce();
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
        buildThing(createThing({ url: `${CATALOG}#deck-2` })).addIri(RDF.type, SM.Deck).build(),
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
        buildThing(createThing({ url: `${REVIEWS}#b` })).addIri(RDF.type, SM.ReviewState).addStringNoLocale(SM.due, "soon").build(),
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

  it("names an agent after its address, and removes a subject the user gave up on", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      documentOf(
        CATALOG,
        buildThing(createThing({ url: `${CATALOG}#agent-x` })).addIri(RDF.type, "http://xmlns.com/foaf/0.1/Agent").build(),
        buildThing(createThing({ url: "https://alice.example/profile/card" })).addIri(RDF.type, "http://xmlns.com/foaf/0.1/Agent").build(),
        buildThing(createThing({ url: `${CATALOG}#broken` })).addIri(RDF.type, SM.Deck).build(),
      ),
    );
    await repository().applyRepairs([
      repair("name-agent", `${CATALOG}#agent-x`, 1),
      repair("name-agent", "https://alice.example/profile/card", 1),
      repair("remove-subject", `${CATALOG}#broken`),
      repair("describe-deck", `${CATALOG}#gone`),
    ]);
    expect(getStringNoLocale(getThing(saved(), `${CATALOG}#agent-x`)!, FOAF_NAME)).toBe("agent-x");
    expect(getStringNoLocale(getThing(saved(), "https://alice.example/profile/card")!, FOAF_NAME)).toBe(
      "https://alice.example/profile/card",
    );
    expect(getThing(saved(), `${CATALOG}#broken`)).toBeNull();
  });

  it("removes a subject from the catalogue and its deck group, keeping every other link to it", async () => {
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
        buildThing(createThing({ url: `${CATALOG}#group-2` })).addIri(RDF.type, SM.DeckGroup).addIri(RDF.type, DCAT.Catalog).build(),
        buildThing(createThing({ url: `${CATALOG}#other` })).addIri(RDF.type, DCAT.Catalog).addUrl(DCAT.dataset, deck).build(),
        buildThing(createThing({ url: deck })).addIri(RDF.type, SM.Deck).addUrl(DCTERMS.creator, agent).build(),
        buildThing(createThing({ url: agent })).addIri(RDF.type, "http://xmlns.com/foaf/0.1/Agent").build(),
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
    // Only the catalogue and the deck groups list the decks.
    expect(getUrlAll(getThing(saved(), `${CATALOG}#other`)!, DCAT.dataset)).toEqual([deck]);
  });

  it("drops a catalogue's and a deck group's links to decks and groups the document does not describe", async () => {
    const group = (url: string) => buildThing(createThing({ url })).addIri(RDF.type, SM.DeckGroup).addIri(RDF.type, DCAT.Catalog);
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      documentOf(
        CATALOG,
        buildThing(createThing({ url: `${CATALOG}#catalog` }))
          .addIri(RDF.type, DCAT.Catalog)
          .addUrl(DCAT.dataset, `${CATALOG}#deck-1`)
          .addUrl(DCAT.dataset, `${CATALOG}#deck-old`)
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
        buildThing(createThing({ url: `${CATALOG}#deck-1` })).addIri(RDF.type, SM.Deck).addIri(RDF.type, DCAT.Dataset).build(),
        // A deck or group that lost its DCAT class is still one: the catalogue keeps it.
        buildThing(createThing({ url: `${CATALOG}#deck-old` })).addIri(RDF.type, SM.Deck).build(),
        buildThing(createThing({ url: `${CATALOG}#group-old` })).addIri(RDF.type, SM.DeckGroup).build(),
      ),
    );
    await repository().applyRepairs([
      repair("drop-dangling-members", `${CATALOG}#catalog`, 1),
      repair("drop-dangling-members", `${CATALOG}#group-1`, 1),
    ]);
    const catalog = getThing(saved(), `${CATALOG}#catalog`)!;
    expect(getUrlAll(catalog, DCAT.dataset)).toEqual([`${CATALOG}#deck-1`, `${CATALOG}#deck-old`]);
    expect(getUrlAll(catalog, DCAT.catalog)).toEqual([`${CATALOG}#group-1`, `${CATALOG}#group-old`]);
    const group1 = getThing(saved(), `${CATALOG}#group-1`)!;
    expect(getUrlAll(group1, DCAT.dataset)).toEqual([`${CATALOG}#deck-1`]);
    expect(getUrlAll(group1, DCAT.catalog)).toEqual([`${CATALOG}#group-2`]);
  });

  it("skips a document that is gone", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    await repository().applyRepairs([repair("describe-deck", `${CATALOG}#deck-1`)]);
    expect(saveSolidDatasetAt).not.toHaveBeenCalled();
  });
});
