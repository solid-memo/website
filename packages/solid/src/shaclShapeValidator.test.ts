import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/sources";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildThing,
  createThing,
  fromRdfJsDataset,
  getThing,
  mockSolidDatasetFrom,
  setThing,
  toRdfJsDataset,
  type SolidDataset,
  type ThingBuilder,
  type ThingPersisted,
} from "@inrupt/solid-client";
import { getSolidDatasetOrNull } from "./datasets";
import { DCAT, DCTERMS, RDF, SM } from "./vocab";
import { withCatalog } from "./mappers/deckMapper";
import { toReviewStateThing } from "./mappers/reviewStateMapper";
import type { ShapeEngine } from "@solid-memo/shacl/engine";
import { createShaclShapeValidator } from "./shaclShapeValidator";
import { courseDraft, DRAFT, of } from "@solid-memo/domain/testing/releaseDraft";
import type { ShapeLoader } from "@solid-memo/shacl/shapeLoader";
import { draftUrlOf } from "@solid-memo/domain/release/draftLayout";
import { nextVersionDraft } from "@solid-memo/domain/release/releaseVersion";
import { DECKS, draftPod, INSTANCE } from "./testing/releaseDrafts";

vi.mock("./datasets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./datasets")>()),
  getSolidDatasetOrNull: vi.fn(),
}));

const DOC = "https://pod.example/solid-memo/a/catalog.ttl";

/** The dataset with a catalogue's link to a blank-node member, `[ a dcat:Dataset ]`, as another app may write one: Solid Memo never does. */
function withBlankMember(dataset: SolidDataset, catalogue: string, label: string): SolidDataset {
  const term = (termType: string, value: string) => ({ termType, value });
  const graph = term("DefaultGraph", "");
  const quads = [
    ...toRdfJsDataset(dataset),
    { subject: term("NamedNode", catalogue), predicate: term("NamedNode", DCAT.dataset), object: term("BlankNode", label), graph },
    { subject: term("BlankNode", label), predicate: term("NamedNode", RDF.type), object: term("NamedNode", DCAT.Dataset), graph },
  ];
  return fromRdfJsDataset({ [Symbol.iterator]: () => quads[Symbol.iterator]() } as never);
}

function catalog() {
  let dataset = mockSolidDatasetFrom(DOC);
  dataset = setThing(
    dataset,
    buildThing(createThing({ url: `${DOC}#deck-1` }))
      .addIri(RDF.type, SM.Deck)
      .addStringNoLocale(DCTERMS.title, "Capitals")
      .addInteger(SM.formatVersion, 2)
      .build(),
  );
  dataset = setThing(
    dataset,
    buildThing(createThing({ url: `${DOC}#deck-2` }))
      .addIri(RDF.type, SM.Deck)
      .addInteger(SM.formatVersion, 9)
      .build(),
  );
  dataset = setThing(
    dataset,
    buildThing(createThing({ url: `${DOC}#note` })).addStringNoLocale(DCTERMS.title, "x").build(),
  );
  return dataset;
}

function makeValidator() {
  const validateNode = vi.fn(async (_data: unknown, focus: string) =>
    focus.endsWith("deck-1")
      ? [{ path: SM.cardsDocument, message: { en: "Less than 1 values" }, severity: "violation" as const, constraint: "MinCount" }]
      : [],
  );
  const validate = vi.fn(async () => [] as Awaited<ReturnType<ShapeEngine["validate"]>>);
  const createEngine = vi.fn((): ShapeEngine => ({ validateNode, validate }));
  const loader: ShapeLoader = {
    load: vi.fn(async () => ({ size: 0 }) as never),
    loadProfile: vi.fn(async () => []),
    loadReferenceData: vi.fn(async () => []),
  };
  const publicFetch = vi.fn() as unknown as typeof fetch;
  const validator = createShaclShapeValidator({
    fetch: vi.fn() as unknown as typeof fetch,
    shapesFetch: publicFetch,
    ...SHAPE_SOURCES,
    loadEngine: async () => ({ createEngine, mergeDatasets: (...parts) => parts.flatMap((p) => [...p]) as never, mapIris: (data) => data }),
    loader,
  });
  return { validator, validateNode, validate, createEngine, loader, publicFetch };
}

beforeEach(() => {
  vi.mocked(getSolidDatasetOrNull).mockReset();
});

describe("createShaclShapeValidator", () => {
  it("loads the engine and the published shapes itself by default", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(catalog());
    const validator = createShaclShapeValidator({
      fetch: vi.fn() as unknown as typeof fetch,
      shapesFetch,
      ...SHAPE_SOURCES,
    });
    const report = await validator.validateDocument(DOC);
    expect(report.subjects[0]).toMatchObject({
      status: "checked",
      shape: "deck",
      version: 2,
      violations: [
        expect.objectContaining({ path: SM.cardsDocument, constraint: "MinCount" }),
        expect.objectContaining({ path: SM.direction, constraint: "MinCount" }),
        expect.objectContaining({ path: SM.reviewsDocument, constraint: "MinCount" }),
      ],
    });
  });

  it("is the same validator over another fetch's documents: its shapes and engines made once", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(catalog());
    const { validator, loader, createEngine } = makeValidator();
    const other = vi.fn() as unknown as typeof fetch;
    const trial = validator.over(other);
    await validator.validateDocument(DOC);
    expect((await trial.validateDocument(DOC)).status).toBe("checked");
    expect(vi.mocked(getSolidDatasetOrNull).mock.calls.at(-1)![1]).toBe(other);
    expect(loader.load).toHaveBeenCalledOnce();
    expect(createEngine).toHaveBeenCalledOnce();
  });

  it("reads a release checked on its own as anyone does, against the library's shapes, with no profile", async () => {
    const release = "https://alice.example/releases/capitals/v1.ttl";
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(
        mockSolidDatasetFrom(release),
        buildThing(createThing({ url: release })).addIri(RDF.type, SM.Deck).addIri(RDF.type, DCAT.Dataset).addInteger(SM.formatVersion, 6).build(),
      ),
    );
    const { validator, validateNode, validate, publicFetch } = makeValidator();
    const report = await validator.validateDocument(release, "library");
    expect(vi.mocked(getSolidDatasetOrNull).mock.calls[0]![1]).toBe(publicFetch);
    expect(report.subjects).toEqual([{ url: release, status: "checked", shape: "libraryDeck", version: 6, violations: [] }]);
    expect(validateNode).toHaveBeenCalledOnce();
    expect(validate).not.toHaveBeenCalled();
  });

  it("reports a missing document as missing, without loading anything", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(null);
    const { validator, loader } = makeValidator();
    await expect(validator.validateDocument(DOC)).resolves.toEqual({
      url: DOC,
      status: "missing",
      subjects: [],
    });
    expect(loader.load).not.toHaveBeenCalled();
  });

  it("checks each subject against the shape of its class and version", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(catalog());
    const { validator, validateNode, createEngine, loader } = makeValidator();
    await expect(validator.validateDocument(DOC)).resolves.toEqual({
      url: DOC,
      status: "checked",
      subjects: [
        {
          url: `${DOC}#deck-1`,
          status: "checked",
          shape: "deck",
          version: 2,
          violations: [
            { path: SM.cardsDocument, message: { en: "Less than 1 values" }, severity: "violation", constraint: "MinCount" },
          ],
        },
        { url: `${DOC}#deck-2`, status: "newer", shape: "deck", version: 9, latest: 6 },
        { url: `${DOC}#note`, status: "untyped" },
      ],
    });
    expect(validateNode).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      `${DOC}#deck-1`,
      "https://solid-memo.com/ns/shapes/deck/v2.ttl#inPod",
    );
    expect(loader.load).toHaveBeenCalledOnce();
    await validator.validateDocument(DOC);
    expect(loader.load).toHaveBeenCalledOnce();
    expect(createEngine).toHaveBeenCalledOnce();
  });

  it("checks a document with DCAT or FOAF subjects against DCAT-AP too, merging what it finds by subject", async () => {
    const DCAT_DATASET = "http://www.w3.org/ns/dcat#Dataset";
    let dataset = catalog();
    dataset = setThing(dataset, buildThing(createThing({ url: `${DOC}#deck-1` }))
      .addIri(RDF.type, SM.Deck).addIri(RDF.type, DCAT_DATASET)
      .addStringNoLocale(DCTERMS.title, "Capitals").addInteger(SM.formatVersion, 2).build());
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(dataset);
    const { validator, validate } = makeValidator();
    const violation = (focusNode: string, severity: "violation" | "warning" = "violation") => ({
      focusNode,
      path: DCTERMS.description,
      message: { en: "Less than 1 values" },
      severity,
      constraint: "MinCount",
    });
    validate.mockResolvedValue([
      violation(`${DOC}#deck-1`),
      violation(`${DOC}#deck-2`),
      violation(`${DOC}#note`),
      violation(`${DOC}#licence`, "warning"),
      violation("https://elsewhere.example/#x"),
    ]);
    const report = await validator.validateDocument(DOC);
    const profiled = { path: DCTERMS.description, message: { en: "Less than 1 values" }, severity: "violation", constraint: "MinCount", profile: "dcat-ap" };
    expect(report.subjects).toEqual([
      expect.objectContaining({ url: `${DOC}#deck-1`, status: "checked", violations: [expect.anything(), profiled] }),
      { url: `${DOC}#deck-2`, status: "newer", shape: "deck", version: 9, latest: 6 },
      { url: `${DOC}#note`, status: "profiled", violations: [{ ...profiled, severity: "warning" }], foreign: true },
    ]);
  });

  it("reports what another app wrote — no Solid Memo class, format stamp or link from a subject of Solid Memo's — with warnings only", async () => {
    const FOAF_AGENT = "http://xmlns.com/foaf/0.1/Agent";
    let dataset = mockSolidDatasetFrom(DOC);
    for (const [id, stamped] of [["agent-mine", true], ["agent-theirs", false]] as const) {
      const agent = buildThing(createThing({ url: `${DOC}#${id}` })).addIri(RDF.type, FOAF_AGENT);
      dataset = setThing(dataset, (stamped ? agent.addInteger(SM.formatVersion, 1) : agent).build());
    }
    dataset = setThing(dataset, buildThing(createThing({ url: `${DOC}#stamped` })).addIri(RDF.type, "http://www.w3.org/ns/dcat#Dataset").addInteger(SM.formatVersion, 1).build());
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(dataset);
    const { validator, validateNode, validate } = makeValidator();
    const nameless = { path: "http://xmlns.com/foaf/0.1/name", message: { en: "Less than 1 values" }, severity: "violation" as const, constraint: "MinCount" };
    const odd = { message: { en: "odd" }, severity: "info" as const, constraint: "Pattern" };
    validateNode.mockResolvedValue([nameless, odd] as never);
    validate.mockResolvedValue([
      { focusNode: `${DOC}#agent-mine`, ...nameless },
      { focusNode: `${DOC}#agent-theirs`, ...nameless },
      { focusNode: `${DOC}#stamped`, ...nameless },
    ]);
    const profiled = { ...nameless, profile: "dcat-ap" };
    const warning = { ...nameless, severity: "warning" };
    expect((await validator.validateDocument(DOC)).subjects).toEqual([
      { url: `${DOC}#agent-mine`, status: "checked", shape: "agent", version: 1, violations: [nameless, odd, profiled] },
      {
        url: `${DOC}#agent-theirs`,
        status: "checked",
        shape: "agent",
        version: 1,
        violations: [warning, odd, { ...warning, profile: "dcat-ap" }],
        foreign: true,
      },
      { url: `${DOC}#stamped`, status: "profiled", violations: [profiled] },
    ]);
  });

  it("holds a catalogue and its publisher that lost their stamps as Solid Memo's, warning only about its links to another app's members", async () => {
    const alice = "https://alice.example/profile/card#me";
    let dataset = mockSolidDatasetFrom(DOC);
    for (const thing of [
      // Another app rewrote the catalogue and its publisher without the triples it does not know, sm:formatVersion among them.
      buildThing(createThing({ url: `${DOC}#catalog` })).addIri(RDF.type, DCAT.Catalog).addUrl(DCTERMS.publisher, alice)
        .addUrl(DCAT.dataset, `${DOC}#recipes`).addUrl(DCAT.dataset, `${DOC}#deck-gone`),
      buildThing(createThing({ url: alice })).addIri(RDF.type, "http://xmlns.com/foaf/0.1/Agent"),
      // Another app's dataset, described beside the decks with a class of its own.
      buildThing(createThing({ url: `${DOC}#recipes` })).addIri(RDF.type, "https://schema.org/Dataset"),
    ]) {
      dataset = setThing(dataset, thing.build());
    }
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(withBlankMember(dataset, `${DOC}#catalog`, "theirs") as never);
    const { validator, validateNode, validate } = makeValidator();
    const result = (constraint: string, path: string, value?: string) => ({
      path,
      message: { en: constraint },
      severity: "violation" as const,
      constraint,
      ...(value === undefined ? {} : { value }),
    });
    const untitled = result("MinCount", DCTERMS.title);
    validateNode.mockResolvedValue([untitled] as never);
    const members = [
      result("Class", DCAT.dataset, `${DOC}#recipes`),
      result("NodeKind", DCAT.dataset, "theirs"),
      // A link to nothing the document describes, and one to a blank node another subject names, are the catalogue's own.
      result("Class", DCAT.dataset, `${DOC}#deck-gone`),
      result("NodeKind", DCAT.dataset, "elsewhere"),
      result("MinCount", DCAT.dataset),
    ];
    validate.mockResolvedValue(members.map((member) => ({ focusNode: `${DOC}#catalog`, ...member })));
    const [recipes, theirs, ...own] = members.map((member) => ({ ...member, profile: "dcat-ap" }));
    expect((await validator.validateDocument(DOC)).subjects).toEqual([
      {
        url: `${DOC}#catalog`,
        status: "checked",
        shape: "catalog",
        version: 1,
        violations: [untitled, { ...recipes, severity: "warning" }, { ...theirs, severity: "warning" }, ...own],
      },
      { url: alice, status: "checked", shape: "agent", version: 1, violations: [untitled] },
      { url: `${DOC}#recipes`, status: "untyped" },
    ]);
  });

  it("holds a DCAT deck to DCAT-AP with the site's own profile and reference data", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(
        mockSolidDatasetFrom(DOC),
        buildThing(createThing({ url: `${DOC}#deck-1` }))
          .addIri(RDF.type, SM.Deck)
          .addIri(RDF.type, "http://www.w3.org/ns/dcat#Dataset")
          .addStringNoLocale(DCTERMS.title, "Capitals")
          .addIri("http://www.w3.org/ns/dcat#theme", "https://example.com/not-a-concept")
          .addInteger(SM.formatVersion, 2)
          .build(),
      ),
    );
    const validator = createShaclShapeValidator({
      fetch: vi.fn() as unknown as typeof fetch,
      shapesFetch,
      ...SHAPE_SOURCES,
    });
    const report = await validator.validateDocument(DOC);
    const deck = report.subjects[0] as { violations: { path?: string; profile?: string }[] };
    expect(deck.violations.filter((v) => v.profile === "dcat-ap").map((v) => v.path).sort()).toEqual([
      DCTERMS.description,
      "http://www.w3.org/ns/dcat#theme",
    ]);
    await validator.validateDocument(DOC);
  }, 30_000);

  it("finds nothing wrong with a deck's documents as the app writes them, another scheduler's state warned about only", async () => {
    const CARDS = "https://pod.example/solid-memo/a/decks/deck-1.ttl";
    const REVIEWS = "https://pod.example/solid-memo/a/reviews/deck-1.ttl";
    const cards = [
      // The document itself, part of its deck: no class, so no shape and nothing to check.
      buildThing(createThing({ url: CARDS })).addIri(DCTERMS.isPartOf, `${DOC}#deck-1`).build(),
      buildThing(createThing({ url: `${CARDS}#card-1` }))
        .addIri(RDF.type, SM.Card)
        .addInteger(SM.formatVersion, 5)
        .addStringWithLocale(SM.front, "Water", "en")
        .addStringWithLocale(SM.back, "水", "ja")
        .addIri(SM.distractor, `${CARDS}#card-1-d1`)
        .addIri("https://schema.org/suggestedAnswer", `${CARDS}#card-1-d1`)
        .build(),
      buildThing(createThing({ url: `${CARDS}#card-1-d1` }))
        .addIri(RDF.type, SM.Distractor)
        .addIri(RDF.type, "https://schema.org/Answer")
        .addInteger(SM.formatVersion, 1)
        .addStringWithLocale(SM.distractorText, "火", "ja")
        .build(),
    ].reduce<SolidDataset>((dataset, thing) => setThing(dataset, thing), mockSolidDatasetFrom(CARDS));
    const state = {
      cardId: "card-1",
      direction: "front-to-back" as const,
      easeFactor: 2.5,
      intervalDays: 1,
      repetitions: 1,
      due: "2026-09-22",
      firstReviewedAt: "2026-09-21T10:00:00.000Z",
      lastReviewedAt: "2026-09-21T10:00:00.000Z",
      formatVersion: 2,
    };
    const documents = { id: "deck-1", cardsDocumentUrl: CARDS, reviewsDocumentUrl: REVIEWS };
    const reviews = [
      toReviewStateThing(documents, state, null, `${REVIEWS}#card-1`),
      // Another app's name for a state of the card's other direction: it names its card.
      toReviewStateThing(documents, { ...state, direction: "back-to-front" }, null, `${REVIEWS}#state-7f3a`),
      // Another scheduler's state: none of SM-2's fields.
      buildThing(createThing({ url: `${REVIEWS}#fsrs-1` }))
        .addIri(RDF.type, SM.ReviewState)
        .addIri(SM.reviewOf, `${CARDS}#card-1`)
        .addIri(SM.scheduler, "https://fsrs.example/ns#fsrs")
        .build(),
    ].reduce<SolidDataset>((dataset, thing) => setThing(dataset, thing), mockSolidDatasetFrom(REVIEWS));
    vi.mocked(getSolidDatasetOrNull).mockImplementation(async (url) => (url === CARDS ? cards : reviews) as never);
    const validator = createShaclShapeValidator({
      fetch: vi.fn() as unknown as typeof fetch,
      shapesFetch,
      ...SHAPE_SOURCES,
    });
    const cardsReport = await validator.validateDocument(CARDS);
    expect(cardsReport.subjects.find((subject) => subject.url === CARDS)).toEqual({ url: CARDS, status: "untyped" });
    expect(cardsReport.subjects.flatMap((subject) => ("violations" in subject ? subject.violations : []))).toEqual([]);
    const reviewsReport = await validator.validateDocument(REVIEWS);
    const results = reviewsReport.subjects.flatMap((subject) => ("violations" in subject ? subject.violations : []));
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((v) => v.severity === "warning")).toBe(true);
    expect(reviewsReport.subjects.find((subject) => subject.url === `${REVIEWS}#fsrs-1`)).toMatchObject({ foreign: true });
  }, 30_000);

  it("checks a write with the engine it has: pathless results named by subject, warnings and results about other subjects passed over", async () => {
    const { validator, validateNode, validate } = makeValidator();
    validateNode.mockResolvedValue([
      { message: { en: "Each side needs text or a picture." }, severity: "violation", constraint: "Or" },
      { path: SM.front, message: { en: "odd" }, severity: "warning", constraint: "Pattern" },
    ] as never);
    validate.mockResolvedValue([
      { focusNode: `${DOC}#other`, message: { en: "x" }, severity: "violation", constraint: "MinCount" },
    ]);
    const dataset = setThing(
      setThing(
        mockSolidDatasetFrom(DOC),
        buildThing(createThing({ url: `${DOC}#deck-1` }))
          .addIri(RDF.type, SM.Deck)
          .addIri(RDF.type, "http://www.w3.org/ns/dcat#Dataset")
          .addInteger(SM.formatVersion, 3)
          .build(),
      ),
      buildThing(createThing({ url: `${DOC}#other` })).addStringNoLocale(DCTERMS.title, "x").build(),
    );
    await expect(validator.checkSubjects(dataset, [`${DOC}#deck-1`], "pod")).rejects.toThrow(
      `Solid Memo did not save this: it is not in the format Solid Memo expects. Nothing was changed. Reload the page and try again.\nproblems: <${DOC}#deck-1>: Each side needs text or a picture.`,
    );
  });

  describe("checkSubjects", () => {
    const validator = createShaclShapeValidator({
      fetch: vi.fn() as unknown as typeof fetch,
      shapesFetch,
      ...SHAPE_SOURCES,
    });
    type Builder = ThingBuilder<ThingPersisted>;
    const deck = (build: (t: Builder) => Builder) =>
      setThing(
        mockSolidDatasetFrom(DOC),
        build(
          buildThing(createThing({ url: `${DOC}#deck-1` }))
            .addIri(RDF.type, SM.Deck)
            .addIri(RDF.type, "http://www.w3.org/ns/dcat#Dataset")
            .addStringNoLocale(DCTERMS.title, "Capitals")
            .addIri(SM.studyDirection, SM.bidirectional)
            .addIri(SM.cardsDocument, "https://pod.example/d.ttl")
            .addIri(SM.reviewsDocument, "https://pod.example/r.ttl")
            .addInteger(SM.formatVersion, 3),
        ).build(),
      );

    it("lets a write through when what it touches conforms", async () => {
      await expect(
        validator.checkSubjects(deck((t) => t.addStringNoLocale(DCTERMS.description, "Capitals.")), [`${DOC}#deck-1`, `${DOC}#gone`], "pod"),
      ).resolves.toBeUndefined();
    });

    it("refuses a write that breaks a shape or DCAT-AP, naming every problem", async () => {
      await expect(validator.checkSubjects(deck((t) => t), [`${DOC}#deck-1`], "pod")).rejects.toThrow(
        [
          "Solid Memo did not save this: it is not in the format Solid Memo expects. Nothing was changed. Reload the page and try again.",
          `problems: <${DOC}#deck-1> (${DCTERMS.description}): A format-3 deck has a description, as DCAT-AP asks of every dataset.`,
          `  <${DOC}#deck-1> (${DCTERMS.description}): DCAT-AP: Less than 1 values`,
        ].join("\n"),
      );
    });

    it("holds a catalogue's members of its own document to their class, not those another document describes or another app wrote", async () => {
      const written = withCatalog(mockSolidDatasetFrom(DOC), DOC, {
        title: "Main",
        description: "My decks.",
        publisher: { webId: "https://alice.example/profile/card#me", name: "Alice" },
      });
      const listing = (member: string) =>
        setThing(written, buildThing(getThing(written, `${DOC}#catalog`)!).addIri(DCAT.dataset, member).build());
      await expect(
        validator.checkSubjects(listing("https://pod.example/recipes/index.ttl#cookbook"), [`${DOC}#catalog`], "pod"),
      ).resolves.toBeUndefined();
      // Another app's members of this document: one it described with a class of its own, and a blank node.
      const theirs = setThing(
        listing(`${DOC}#recipes`),
        buildThing(createThing({ url: `${DOC}#recipes` })).addIri(RDF.type, "https://schema.org/Dataset").build(),
      );
      await expect(validator.checkSubjects(theirs, [`${DOC}#catalog`], "pod")).resolves.toBeUndefined();
      await expect(validator.checkSubjects(withBlankMember(written, `${DOC}#catalog`, "theirs"), [`${DOC}#catalog`], "pod")).resolves.toBeUndefined();
      await expect(validator.checkSubjects(listing(`${DOC}#deck-gone`), [`${DOC}#catalog`], "pod")).rejects.toThrow(
        `<${DOC}#catalog> (${DCAT.dataset}): DCAT-AP:`,
      );
    }, 30_000);

    it("holds a draft to the draft shapes and not yet to DCAT-AP, and an instance's deck to the pod's", async () => {
      const draft = setThing(
        mockSolidDatasetFrom(DOC),
        buildThing(createThing({ url: DOC }))
          .addIri(RDF.type, SM.Deck)
          .addIri(RDF.type, "http://www.w3.org/ns/dcat#Dataset")
          .addInteger(SM.formatVersion, 1)
          .addIri(SM.studyDirection, SM.frontToBack)
          .build(),
      );
      await expect(validator.checkSubjects(draft, [DOC], "draft")).resolves.toBeUndefined();
      await expect(validator.checkSubjects(draft, [DOC], "pod")).rejects.toThrow(`<${DOC}> (${DCTERMS.title}):`);
      const released = setThing(draft, buildThing(getThing(draft, DOC)!).addStringNoLocale(SM.releasedAs, "v1.ttl").build());
      await expect(validator.checkSubjects(released, [DOC], "draft")).rejects.toThrow(
        `<${DOC}> (${SM.releasedAs}): A released draft names the one release it was published as, an IRI.`,
      );
    });

    it("checks a draft's document against the draft shapes, without DCAT-AP, when told it is a draft's", async () => {
      const draft = setThing(
        mockSolidDatasetFrom(DOC),
        buildThing(createThing({ url: DOC }))
          .addIri(RDF.type, SM.Deck)
          .addIri(RDF.type, "http://www.w3.org/ns/dcat#Dataset")
          .addInteger(SM.formatVersion, 1)
          .addIri(SM.studyDirection, SM.frontToBack)
          .build(),
      );
      vi.mocked(getSolidDatasetOrNull).mockResolvedValue(draft);
      const asDraft = await validator.validateDocument(DOC, "draft");
      expect(asDraft.subjects).toEqual([expect.objectContaining({ shape: "draftDeck", violations: [] })]);
      const asPod = await validator.validateDocument(DOC);
      expect(asPod.subjects).toEqual([expect.objectContaining({ shape: "deck", violations: expect.arrayContaining([expect.anything()]) })]);
    }, 30_000);

    it("checks only the subjects a write touches, leaving untyped and newer ones alone", async () => {
      const dataset = setThing(
        setThing(deck((t) => t), buildThing(createThing({ url: `${DOC}#note` })).addStringNoLocale(DCTERMS.title, "x").build()),
        buildThing(createThing({ url: `${DOC}#future` })).addIri(RDF.type, SM.Deck).addInteger(SM.formatVersion, 9).build(),
      );
      await expect(validator.checkSubjects(dataset, [`${DOC}#note`, `${DOC}#future`], "pod")).resolves.toBeUndefined();
    });
  });
});

describe("validateRelease", () => {
  const INDEX = "https://site.example/decks/index.ttl";
  const AT = "https://site.example/decks/solid/v2.ttl";
  const INDEX_TURTLE = `@base <${INDEX}> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
<> a dcat:Catalog ; dcterms:title "Library"@en ; dcterms:description "Decks."@en ; dcterms:publisher <#pub> ; dcat:dataset <#listed> .
<#pub> a foaf:Agent ; foaf:name "Publisher" .
<#listed> a dcat:DatasetSeries , dcat:Dataset ; dcterms:title "Listed"@en .
`;
  /** The site's documents, and the library's index. */
  const siteFetch = (async (input: RequestInfo | URL) =>
    String(input) === INDEX ? new Response(INDEX_TURTLE, { headers: { "content-type": "text/turtle" } }) : shapesFetch(input)) as typeof globalThis.fetch;
  const validator = createShaclShapeValidator({ fetch: siteFetch, shapesFetch: siteFetch, ...SHAPE_SOURCES });
  const DCTERMS_NS = "http://purl.org/dc/terms/";
  const DCAT_NS = "http://www.w3.org/ns/dcat#";
  const brief = (problems: Awaited<ReturnType<typeof validator.validateRelease>>) =>
    problems.map((p) => [p.severity, p.code, p.subject, p.field, "profile" in p.params ? p.params.profile : undefined]);

  it("checks a draft as the release it will be against the library shapes and DCAT-AP, each result once, in the draft's names", async () => {
    const draft = courseDraft();
    const found = await validator.validateRelease(draft, draft.url);
    expect(brief(found)).toEqual(
      expect.arrayContaining([
        ["error", "shape", DRAFT, `${DCTERMS_NS}publisher`, undefined],
        ["error", "shape", DRAFT, `${DCAT_NS}theme`, undefined],
        ["error", "shape", DRAFT, `${DCTERMS_NS}description`, "dcat-ap"],
        ["error", "shape", of("series"), `${DCTERMS_NS}description`, undefined],
      ]),
    );
    expect(new Set(found.map((p) => JSON.stringify(p))).size).toBe(found.length);
    expect(found.find((p) => p.field === `${DCTERMS_NS}publisher`)!.params).toEqual({
      message: { en: "A library deck names its publisher, a foaf:Agent.", sv: "En bibliotekskortlek anger sin utgivare, en foaf:Agent." },
      constraint: "MinCount",
    });
  }, 60_000);

  it("names a subject typed with a Solid Memo term no shape describes, and a value a result is about", async () => {
    const base = courseDraft();
    const draft = {
      ...base,
      root: { ...base.root, publisher: of("me") },
      triples: [...base.triples, { subject: of("odd"), predicate: RDF.type, object: { kind: "iri" as const, value: "https://solid-memo.com/ns/vocab/v1.ttl#Nothing" } }],
    };
    const found = await validator.validateRelease(draft, AT);
    expect(found).toContainEqual({ severity: "error", subject: of("odd"), code: "unshaped", params: {} });
    expect(found.find((p) => p.field === `${DCTERMS_NS}publisher`)!.params).toMatchObject({ value: of("me"), profile: "dcat-ap", constraint: "Class", builtIn: true });
  }, 60_000);

  it("checks a release for a library with its index beside it, the series it names a version of it, described when the index has it not", async () => {
    const base = courseDraft();
    const inLibrary = (series: string, publisher = `${INDEX}#pub`) => ({ ...base, root: { ...base.root, inSeries: series, isVersionOf: series, publisher } });
    // Without the index, nothing beside the release describes its series and publisher: their class is not checked.
    const without = brief(await validator.validateRelease(inLibrary(`${INDEX}#solid`), AT));
    expect(without.filter(([, , , field]) => field === `${DCAT_NS}inSeries` || field === `${DCTERMS_NS}publisher`)).toEqual([]);
    // With it, they are: a publisher the index describes as something else is not one.
    const wrong = brief(await validator.validateRelease(inLibrary(`${INDEX}#solid`, `${INDEX}#listed`), AT, INDEX));
    expect(wrong).toContainEqual(["error", "shape", DRAFT, `${DCTERMS_NS}publisher`, "dcat-ap"]);
    for (const series of [`${INDEX}#solid`, `${INDEX}#listed`]) {
      const found = brief(await validator.validateRelease(inLibrary(series), AT, INDEX));
      expect(found.filter(([, , , field]) => field === `${DCAT_NS}inSeries` || field === `${DCTERMS_NS}publisher`)).toEqual([]);
      expect(found.every(([, , subject]) => (subject as string).startsWith(DRAFT))).toBe(true);
    }
    // A release that describes its series itself has no need of the index's.
    const own = await validator.validateRelease(base, AT, INDEX);
    expect(brief(own)).toContainEqual(["error", "shape", of("series"), `${DCTERMS_NS}description`, undefined]);
  }, 60_000);

  it.each(["capitals-of-the-world/v1.ttl", "solid-fundamentals/v1.ttl"])(
    "finds nothing wrong with the next version of decks/%s, in a pod or for the library, its publisher and series described in the index",
    async (path) => {
      const pod = await draftPod();
      const release = await pod.repository.readRelease(`${DECKS}${path}`);
      const name = path.split("/")[0]!;
      const draft = nextVersionDraft(release, draftUrlOf(INSTANCE, name, 2));
      expect(await pod.validator.validateRelease(draft, draft.url)).toEqual([]);
      expect(await pod.validator.validateRelease(draft, `${DECKS}${name}/v2.ttl`, `${DECKS}index.ttl`)).toEqual([]);
    },
    120_000,
  );

  it("keeps a shape's warning a warning, and a result about no field the subject's", async () => {
    const warning = { message: { en: "Careful." }, severity: "warning" as const, constraint: "Node" };
    const engine: ShapeEngine = { validateNode: vi.fn(async () => [warning]), validate: vi.fn(async () => []) };
    const loader: ShapeLoader = { load: vi.fn(async () => ({ size: 0 }) as never), loadProfile: vi.fn(async () => []), loadReferenceData: vi.fn(async () => []) };
    const faked = createShaclShapeValidator({
      fetch: vi.fn() as unknown as typeof fetch,
      shapesFetch: vi.fn() as unknown as typeof fetch,
      ...SHAPE_SOURCES,
      loadEngine: async () => ({ createEngine: () => engine, mergeDatasets: (...parts) => parts.flatMap((p) => [...p]) as never, mapIris: (data) => data }),
      loader,
    });
    const found = await faked.validateRelease(courseDraft(), DRAFT);
    expect(found).toContainEqual({ severity: "warning", subject: DRAFT, code: "shape", params: { message: { en: "Careful." }, constraint: "Node" } });
  });
});
