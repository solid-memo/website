import { readdir, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { readVersioned, recordThing } from "./records";
import { LATEST_VERSION, type ShapeName } from "@solid-memo/vocab/types.generated";
import { MIGRATIONS, migrate, stepFor } from "@solid-memo/domain/shapes/migrations";
import { toRdfJsDataset, mockSolidDatasetFrom, setThing, buildThing, createThing, getSolidDataset, getThingAll, getUrlAll } from "@inrupt/solid-client";
import { createEngine, mergeDatasets } from "@solid-memo/shacl/engine";
import { coreOnly, PROFILES, REFERENCE_DATA } from "@solid-memo/shacl/profiles";
import { datasetFromTurtle, turtleFetch } from "@solid-memo/shacl/testing/turtle";
import { withCatalog, withDeck } from "./mappers/deckMapper";
import type { Deck } from "@solid-memo/domain/deck";
import { createShapeLoader } from "@solid-memo/shacl/shapeLoader";
import { SHAPES } from "@solid-memo/vocab/descriptors.generated";
import { RDF, SM, SM_NS } from "./vocab";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/sources";
import { VOCAB_ROOT } from "@solid-memo/vocab/tooling/root";

const EDUC = "http://publications.europa.eu/resource/authority/data-theme/EDUC";

/**
 * The shapes, the descriptors and the migrations agree: for every shape
 * version, a record written through its descriptor conforms to the
 * shape, and every migration step's output conforms to the shape it
 * moves to. Shape documents are read from the repository at their
 * published address, as the browser reads them from the site.
 */

const ROOT = VOCAB_ROOT;
const URL_ = "https://pod.example/solid-memo/a/doc.ttl#it";

const loader = createShapeLoader({ fetch: shapesFetch, ...SHAPE_SOURCES });

/** A record of each kind and version that is valid for that version. */
const FIXTURES: Record<ShapeName, Record<number, object>> = {
  instance: {
    1: { title: "Main", created: "2026-09-21T10:00:00.000Z" },
    2: { title: "Main", created: "2026-09-21T10:00:00.000Z", replaces: "https://pod.example/solid-memo/main/", modified: "2026-09-28T10:00:00.000Z" },
  },
  deck: {
    1: { title: "Own", creator: [], cardsDocument: "https://pod.example/d.ttl", reviewsDocument: "https://pod.example/r.ttl" },
    2: { title: "Own", creator: ["Anton"], direction: "bidirectional", cardsDocument: "https://pod.example/d.ttl", reviewsDocument: "https://pod.example/r.ttl", source: "https://solid-memo.com/decks/x/v1.ttl" },
    3: { title: "Own", description: "Mine.", creator: ["https://pod.example/c.ttl#agent-anton"], studyDirection: `${SM_NS}bidirectional`, theme: ["https://solid-memo.com/ns/vocab/topics.ttl#geography"], keyword: ["capitals"], distribution: ["https://pod.example/c.ttl#deck-1-cards"], cardsDocument: "https://pod.example/d.ttl", reviewsDocument: "https://pod.example/r.ttl", source: "https://solid-memo.com/decks/x/v1.ttl" },
    4: { title: { en: "Own", sv: "Egen" }, description: { en: "Mine.", sv: "Min." }, creator: ["https://pod.example/c.ttl#agent-anton"], studyDirection: `${SM_NS}bidirectional`, theme: ["https://solid-memo.com/ns/vocab/topics.ttl#geography"], keyword: ["capitals"], distribution: ["https://pod.example/c.ttl#deck-1-cards"], cardsDocument: "https://pod.example/d.ttl", reviewsDocument: "https://pod.example/r.ttl", source: "https://solid-memo.com/decks/x/v1.ttl" },
    5: { title: { sv: "Egen", ja: "自分の" }, description: { sv: "Min." }, creator: ["https://pod.example/c.ttl#agent-anton"], studyDirection: `${SM_NS}bidirectional`, theme: ["https://solid-memo.com/ns/vocab/topics.ttl#geography"], keyword: ["capitals"], distribution: ["https://pod.example/c.ttl#deck-1-cards"], cardsDocument: "https://pod.example/d.ttl", reviewsDocument: "https://pod.example/r.ttl", source: "https://solid-memo.com/decks/x/v1.ttl" },
    6: { title: { sv: "Egen" }, description: { sv: "Min." }, creator: ["https://pod.example/c.ttl#agent-anton"], studyDirection: `${SM_NS}bidirectional`, theme: ["https://solid-memo.com/ns/vocab/topics.ttl#geography"], keyword: { en: ["capitals", "countries"], sv: ["huvudstäder"], "sv-fi": ["städer"], zxx: ["ISO 3166"], "": ["legacy"] }, distribution: ["https://pod.example/c.ttl#deck-1-cards"], cardsDocument: "https://pod.example/d.ttl", reviewsDocument: "https://pod.example/r.ttl", source: "https://solid-memo.com/decks/x/v1.ttl" },
  },
  libraryDeck: {
    1: { title: "Capitals", creator: [], source: [] },
    2: { title: "Capitals", creator: [], direction: "front-to-back", source: ["https://en.wikipedia.org/"] },
    3: { title: "Capitals", description: "Capitals.", creator: [], publisher: "https://solid-memo.com/decks/index.ttl#solid-memo", studyDirection: `${SM_NS}frontToBack`, theme: [EDUC], keyword: [], language: [], version: "2", versionNotes: "Added Norway.", inSeries: "https://solid-memo.com/decks/index.ttl#x", isVersionOf: "https://solid-memo.com/decks/index.ttl#x", prev: "https://solid-memo.com/decks/x/v1.ttl", previousVersion: "https://solid-memo.com/decks/x/v1.ttl", distribution: ["https://solid-memo.com/decks/x/v2.ttl#turtle"], wasDerivedFrom: ["https://en.wikipedia.org/"] },
    4: { title: { en: "Capitals", sv: "Huvudstäder" }, description: { en: "Capitals.", sv: "Huvudstäder." }, creator: [], publisher: "https://solid-memo.com/decks/index.ttl#solid-memo", studyDirection: `${SM_NS}frontToBack`, theme: [EDUC], keyword: [], language: [], version: "2", versionNotes: "Added Norway.", inSeries: "https://solid-memo.com/decks/index.ttl#x", isVersionOf: "https://solid-memo.com/decks/index.ttl#x", prev: "https://solid-memo.com/decks/x/v1.ttl", previousVersion: "https://solid-memo.com/decks/x/v1.ttl", distribution: ["https://solid-memo.com/decks/x/v2.ttl#turtle"], wasDerivedFrom: ["https://en.wikipedia.org/"] },
    5: { title: { en: "Capitals", sv: "Huvudstäder" }, description: { en: "Capitals.", sv: "Huvudstäder." }, creator: [], publisher: "https://solid-memo.com/decks/index.ttl#solid-memo", studyDirection: `${SM_NS}frontToBack`, theme: [EDUC], keyword: { en: ["capitals", "countries"], sv: ["huvudstäder", "länder"] }, language: [], version: "3", versionNotes: "Keywords tagged with their language.", inSeries: "https://solid-memo.com/decks/index.ttl#x", isVersionOf: "https://solid-memo.com/decks/index.ttl#x", prev: "https://solid-memo.com/decks/x/v2.ttl", previousVersion: "https://solid-memo.com/decks/x/v2.ttl", distribution: ["https://solid-memo.com/decks/x/v3.ttl#turtle"], wasDerivedFrom: ["https://en.wikipedia.org/"] },
  },
  libraryDeckSeries: {
    1: { title: "Capitals", description: "Capitals.", publisher: "https://solid-memo.com/decks/index.ttl#solid-memo", theme: [EDUC], keyword: [], first: "https://solid-memo.com/decks/x/v1.ttl", last: "https://solid-memo.com/decks/x/v2.ttl", hasVersion: ["https://solid-memo.com/decks/x/v1.ttl", "https://solid-memo.com/decks/x/v2.ttl"], hasCurrentVersion: "https://solid-memo.com/decks/x/v2.ttl" },
    2: { title: { en: "Capitals", sv: "Huvudstäder" }, description: { en: "Capitals.", sv: "Huvudstäder." }, publisher: "https://solid-memo.com/decks/index.ttl#solid-memo", theme: [EDUC], keyword: [], first: "https://solid-memo.com/decks/x/v1.ttl", last: "https://solid-memo.com/decks/x/v2.ttl", hasVersion: ["https://solid-memo.com/decks/x/v1.ttl", "https://solid-memo.com/decks/x/v2.ttl"], hasCurrentVersion: "https://solid-memo.com/decks/x/v2.ttl" },
    3: { title: { en: "Capitals", sv: "Huvudstäder" }, description: { en: "Capitals.", sv: "Huvudstäder." }, publisher: "https://solid-memo.com/decks/index.ttl#solid-memo", theme: [EDUC], keyword: { en: ["capitals"], sv: ["huvudstäder", "länder"], "": ["legacy"] }, first: "https://solid-memo.com/decks/x/v1.ttl", last: "https://solid-memo.com/decks/x/v3.ttl", hasVersion: ["https://solid-memo.com/decks/x/v1.ttl", "https://solid-memo.com/decks/x/v2.ttl", "https://solid-memo.com/decks/x/v3.ttl"], hasCurrentVersion: "https://solid-memo.com/decks/x/v3.ttl" },
  },
  catalog: {
    1: { title: "Main", description: "My decks.", publisher: "https://pod.example/profile/card#me", themeTaxonomy: ["https://solid-memo.com/ns/vocab/topics.ttl"], dataset: ["https://pod.example/c.ttl#deck-1"] },
  },
  agent: {
    1: { name: "Anton", mbox: "mailto:anton@example.com" },
  },
  distribution: {
    1: { accessUrl: "https://pod.example/d.ttl", mediaType: "https://www.iana.org/assignments/media-types/text/turtle" },
  },
  answer: {
    1: { deck: "https://pod.example/c.ttl#deck-1", card: "https://pod.example/d.ttl#se", direction: `${SM_NS}backToFront`, grade: 4, answeredAt: "2026-10-03T08:15:30.123Z", studyDay: "2026-10-03", priorIntervalDays: 6, nextIntervalDays: 15 },
  },
  card: {
    1: { front: "Sweden", back: "Stockholm" },
    2: { frontImage: "https://flagcdn.com/se.svg", back: "Sweden" },
    3: { front: "Yugoslavia", frontNote: { en: "Dissolved in 1992." }, backLabel: { en: "Capital" }, back: "Belgrade", backNote: { en: "The capital until 1992." }, deprecated: true },
    // Card format 4 gained the picture descriptions without a version bump: an older reader ignores them.
    4: { front: { en: "Mona Lisa", sv: "Mona Lisa" }, back: { "": "Leonardo da Vinci" }, frontNote: { en: "In the Louvre." }, frontImage: "https://example.org/mona-lisa.jpg", frontImageDescription: { sv: "Ett porträtt av en kvinna med knäppta händer" }, backImage: "https://example.org/leonardo.jpg", backImageDescription: { en: "A drawing of an old man with a long beard", sv: "En teckning av en gammal man med långt skägg" } },
    5: { front: { zxx: "404" }, back: { en: "Not Found", fi: "Ei löydy" }, frontNote: { fi: "HTTP-tilakoodi." }, backLabel: { sv: "Betydelse" }, backNote: { en: "The page is gone.", sv: "The page is gone." } },
  },
  reviewState: {
    1: { easeFactor: 2.5, intervalDays: 1, repetitions: 1, due: "2026-09-22", firstReviewedAt: "2026-09-21T10:00:00.000Z", lastReviewedAt: "2026-09-21T10:00:00.000Z", previousDue: "2026-09-21" },
    2: { easeFactor: 2.5, intervalDays: 1, repetitions: 1, due: "2026-09-22", firstReviewedAt: "2026-09-21T10:00:00.000Z", lastReviewedAt: "2026-09-21T10:00:00.000Z", previousEaseFactor: 2.4, previousIntervalDays: 1, previousRepetitions: 1, previousDue: "2026-09-21", previousLastReviewedAt: "2026-09-20T10:00:00.000Z" },
  },
  preferences: {
    1: { newCardsPerDay: 20 },
    2: { newCardsPerDay: 20, maxReviewsPerDay: 200, dayBoundaryHour: 4, answerScale: "sm2", developerMode: false },
    3: { newCardsPerDay: 20, maxReviewsPerDay: 200, dayBoundaryHour: 4, answerScale: "sm2", developerMode: false, invalidDataPolicy: `${SM_NS}warnOnly` },
    4: { newCardsPerDay: 20, maxReviewsPerDay: 200, dayBoundaryHour: 4, answerScale: "sm2", developerMode: false, invalidDataPolicy: `${SM_NS}warnOnly`, theme: `${SM_NS}darkTheme` },
  },
  documentReceipt: {
    1: { document: "https://pod.example/solid-memo/a/decks/d.ttl", version: '"v1"', conformedTo: "0123abcd", latestFormat: true },
  },
  deckSchedule: {
    1: {
      deck: "https://pod.example/solid-memo/a/catalog.ttl#deck-1",
      cardsVersion: '"c1"',
      reviewsVersion: "absent",
      direction: `${SM_NS}bidirectional`,
      dayBoundaryHour: 4,
      studyDay: "2026-10-01",
      dueOnDay: ["2026-10-01 12", "2026-10-03 1"],
      unreviewed: 466,
      reviewedOnDay: 3,
      introducedOnDay: 1,
    },
  },
};

async function violationsOf(shape: ShapeName, version: number, record: object) {
  const descriptor = (SHAPES[shape] as unknown as Record<number, (typeof SHAPES)["card"][1]>)[version];
  const thing = recordThing(URL_, descriptor, record, null);
  const data = toRdfJsDataset(setThing(mockSolidDatasetFrom("https://pod.example/solid-memo/a/doc.ttl"), thing));
  const engine = createEngine(await loader.load(descriptor));
  return engine.validateNode(data, URL_, descriptor.shapeIri);
}

describe("shapes, descriptors and migrations", () => {
  it("agree: a record written through each descriptor conforms to its shape", async () => {
    for (const shape of Object.keys(LATEST_VERSION) as ShapeName[]) {
      for (let version = 1; version <= LATEST_VERSION[shape]; version += 1) {
        expect(FIXTURES[shape][version], `${shape} v${version} fixture`).toBeDefined();
        await expect(violationsOf(shape, version, FIXTURES[shape][version]), `${shape} v${version}`).resolves.toEqual([]);
      }
    }
  });

  it("agree: every migration step's output conforms to the shape it moves to", async () => {
    for (const step of MIGRATIONS) {
      const migrated = step.up(FIXTURES[step.shape][step.from], { subject: "https://pod.example/x.ttl#it" }) as object;
      await expect(violationsOf(step.shape, step.to, migrated), `${step.shape} ${step.from}→${step.to}`).resolves.toEqual([]);
    }
  });

  it("report a subject that breaks its shape", async () => {
    const thing = buildThing(createThing({ url: URL_ }))
      .addIri(RDF.type, SM.Card)
      .addInteger(SM.formatVersion, 2)
      .addStringNoLocale(SM.frontImage, "https://flagcdn.com/se.svg")
      .build();
    const data = toRdfJsDataset(setThing(mockSolidDatasetFrom("https://pod.example/solid-memo/a/doc.ttl"), thing));
    const engine = createEngine(await loader.load(SHAPES.card[2]));
    const violations = await engine.validateNode(data, URL_, SHAPES.card[2].shapeIri);
    expect(violations.map((v) => v.message)).toEqual([
      { en: "Each side of a card needs text or a picture.", sv: "Varje sida av ett kort behöver text eller en bild." },
      { en: "A picture is an IRI (<https://…>), never a string literal.", sv: "En bild är en IRI (<https://…>), aldrig en strängliteral." },
    ]);
  });
});

describe("format 5 over the format-4 fixtures", () => {
  /** The valid format-4 fixtures of a kind (a pod's decks: library releases have formats of their own). */
  async function validFixtures(dir: string) {
    const names = (await readdir(`${ROOT}fixtures/${dir}/v4/valid`)).filter((name) => !name.startsWith("library-"));
    return Promise.all(
      names.map(async (name) => ({ name: `${dir}/v4/valid/${name}`, turtle: await readFile(`${ROOT}fixtures/${dir}/v4/valid/${name}`, "utf8") })),
    );
  }

  it.each([
    ["card", "card", SM.Card],
    ["deck", "deck", SM.Deck],
  ] as const)("a valid format-4 %s, migrated and written, conforms to format 5 and keeps its text", async (dir, shape, type) => {
    const fixtures = await validFixtures(dir);
    expect(fixtures.length).toBeGreaterThan(0);
    const descriptor = SHAPES[shape][5];
    const engine = createEngine(await loader.load(descriptor));
    for (const { name, turtle } of fixtures) {
      const url = `https://pod.example/${name}`;
      const dataset = await getSolidDataset(url, { fetch: turtleFetch(turtle) });
      const things = getThingAll(dataset).filter((thing) => getUrlAll(thing, RDF.type).includes(type));
      expect(things.length, name).toBeGreaterThan(0);
      for (const thing of things) {
        const read = readVersioned(thing, shape)!;
        expect(read.storedVersion, name).toBe(4);
        const migrated = stepFor(shape, 4).up(read.record.data, { subject: thing.url });
        // Nothing guessed, nothing dropped: the data is the format-4 data, restamped.
        expect(migrated, `${name} ${thing.url}`).toEqual(read.record.data);
        const written = toRdfJsDataset(setThing(dataset, recordThing(thing.url, descriptor, migrated as never, thing)));
        await expect(engine.validateNode(written, thing.url, descriptor.shapeIri), `${name} ${thing.url}`).resolves.toEqual([]);
      }
    }
  });
});

describe("deck format 6 over the format-5 fixtures", () => {
  it("a valid format-5 deck, migrated and written, conforms to format 6, its keywords kept untagged and nothing else changed", async () => {
    const dir = `${ROOT}fixtures/deck/v5/valid`;
    const names = await readdir(dir);
    expect(names.length).toBeGreaterThan(0);
    const descriptor = SHAPES.deck[6];
    const engine = createEngine(await loader.load(descriptor));
    for (const name of names) {
      const url = `https://pod.example/deck/v5/valid/${name}`;
      const dataset = await getSolidDataset(url, { fetch: turtleFetch(await readFile(`${dir}/${name}`, "utf8")) });
      const things = getThingAll(dataset).filter((thing) => getUrlAll(thing, RDF.type).includes(SM.Deck));
      expect(things.length, name).toBeGreaterThan(0);
      for (const thing of things) {
        const read = readVersioned(thing, "deck")!;
        expect(read.storedVersion, name).toBe(5);
        const stored = read.record.data as { keyword: readonly string[] };
        const migrated = migrate("deck", read.record, { subject: thing.url });
        // Nothing guessed: the untagged keywords stay untagged, the rest is the format-5 data.
        expect(stored.keyword, name).toEqual(["capitals"]);
        expect(migrated, `${name} ${thing.url}`).toEqual({ ...stored, keyword: { "": ["capitals"] } });
        const written = toRdfJsDataset(setThing(dataset, recordThing(thing.url, descriptor, migrated, thing)));
        await expect(engine.validateNode(written, thing.url, descriptor.shapeIri), `${name} ${thing.url}`).resolves.toEqual([]);
      }
    }
  });
});

/** A document the profile check loads, from where the app reads it, as an RDF/JS dataset. */
async function sourceDataset(url: string) {
  return datasetFromTurtle(await (await shapesFetch(url)).text(), url);
}

describe("what the app writes, under DCAT-AP", () => {
  it("conforms: a catalog document with its catalogue, a deck, its creators and its distribution", async () => {
    const shapes = await Promise.all(PROFILES["dcat-ap"].map((path) => sourceDataset(`${SHAPE_SOURCES.vendorBaseUrl}${path}`)));
    const engine = createEngine(mergeDatasets(coreOnly(shapes.flatMap((d) => [...d]))));
    const CATALOG = "https://pod.example/solid-memo/a/catalog.ttl";
    const deck: Deck = {
      id: "deck-1",
      url: `${CATALOG}#deck-1`,
      title: { en: "Capitals" },
      cardsDocumentUrl: "https://pod.example/solid-memo/a/decks/deck-1.ttl",
      reviewsDocumentUrl: "https://pod.example/solid-memo/a/reviews/deck-1.ttl",
      createdAt: "2026-09-21T10:00:00.000Z",
      formatVersion: 3,
      direction: "bidirectional",
      authors: ["Anton Wiklund <anton@example.com>", "A friend"],
      license: "https://creativecommons.org/publicdomain/zero/1.0/",
      sourceUrl: "https://solid-memo.com/decks/capitals/v1.ttl",
      themes: ["https://solid-memo.com/ns/vocab/topics.ttl#geography"],
      keywords: { en: ["capitals", "countries"], sv: ["huvudstäder"] },
    };
    const written = toRdfJsDataset(
      withCatalog(withDeck(mockSolidDatasetFrom(CATALOG), deck), CATALOG, {
        title: "Main",
        description: "Flashcard decks of the Solid Memo instance Main.",
        publisher: { webId: "https://alice.example/profile/card#me", name: "Alice" },
      }),
    );
    const reference = await Promise.all(REFERENCE_DATA.map((path) => sourceDataset(`${SHAPE_SOURCES.vocabBaseUrl}${path}`)));
    const licence = await datasetFromTurtle(
      "<https://creativecommons.org/publicdomain/zero/1.0/> a <http://purl.org/dc/terms/LicenseDocument> .",
      CATALOG,
    );
    const data = mergeDatasets(written, ...reference, licence);
    const violations = (await engine.validate(data)).filter((v) => v.severity === "violation");
    expect(violations).toEqual([]);
  });
});
