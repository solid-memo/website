// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/testing/shapeSources";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildThing,
  createThing,
  type Dataset,
  fromRdfJsDataset,
  getThing,
  setThing,
  type SubjectBuilder,
  toRdfJsDataset,
} from "./client/rdf";
import { datasetFrom } from "./testing/datasets";
import { getSolidDatasetOrNull } from "./datasets";
import { DCAT, DCTERMS, RDF, SM } from "./vocab";
import { withCatalog } from "./mappers/deckMapper";
import { toFsrsStateThing, toReviewStateThing } from "./mappers/reviewStateMapper";
import type { ShapeEngine } from "@solid-memo/shacl/engine";
import { createShaclShapeValidator } from "./shaclShapeValidator";
import { courseDraft, DRAFT, of } from "@solid-memo/domain/testing/releaseDraft";
import type { ReleaseTerm } from "@solid-memo/domain/release/releaseModel";
import type { ShapeLoader } from "@solid-memo/shacl/shapeLoader";
import { draftUrlOf } from "@solid-memo/domain/release/draftLayout";
import { nextVersionDraft } from "@solid-memo/domain/release/releaseVersion";
import { DECKS, draftPod, INSTANCE, quadsOfTurtle } from "./testing/releaseDrafts";
import { subclassCycle, subclassDiamond } from "@solid-memo/shacl/testing/subclassTangle";
import { growthAsync } from "@solid-memo/domain/testing/growth";
import { gradePrompt } from "@solid-memo/domain/grading";
import type { FsrsState, ReviewState } from "@solid-memo/domain/review";

vi.mock("./datasets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./datasets")>()),
  getSolidDatasetOrNull: vi.fn(),
}));

const DOC = "https://pod.example/solid-memo/a/catalog.ttl";
const XSD_DATETIME = "http://www.w3.org/2001/XMLSchema#dateTime";
const XSD_STRING = "http://www.w3.org/2001/XMLSchema#string";

/** An xsd:dateTime literal of this lexical form, valid or not. */
function dateTime(value: string): never {
  return {
    termType: "Literal",
    value,
    language: "",
    datatype: { termType: "NamedNode", value: XSD_DATETIME },
  } as never;
}

/** The dataset with a catalog's link to a blank-node member, `[ a dcat:Dataset ]`, as another app may write one: Solid Memo never does. */
function withBlankMember(dataset: Dataset, catalog: string, label: string): Dataset {
  const term = (termType: string, value: string) => ({ termType, value });
  const graph = term("DefaultGraph", "");
  const quads = [
    ...toRdfJsDataset(dataset),
    {
      subject: term("NamedNode", catalog),
      predicate: term("NamedNode", DCAT.dataset),
      object: term("BlankNode", label),
      graph,
    },
    {
      subject: term("BlankNode", label),
      predicate: term("NamedNode", RDF.type),
      object: term("NamedNode", DCAT.Dataset),
      graph,
    },
  ];
  return fromRdfJsDataset({ [Symbol.iterator]: () => quads[Symbol.iterator]() } as never);
}

/** The dataset with more values of a subject's property, each a literal of this datatype. */
function withLiterals(
  dataset: Dataset,
  subject: string,
  predicate: string,
  datatype: string,
  values: readonly string[],
): Dataset {
  const term = (termType: string, value: string) => ({ termType, value });
  const graph = term("DefaultGraph", "");
  const quads = [
    ...toRdfJsDataset(dataset),
    ...values.map((value) => ({
      subject: term("NamedNode", subject),
      predicate: term("NamedNode", predicate),
      object: { ...term("Literal", value), language: "", datatype: term("NamedNode", datatype) },
      graph,
    })),
  ];
  return fromRdfJsDataset({ [Symbol.iterator]: () => quads[Symbol.iterator]() } as never);
}

/** The dataset with `count` more of a catalog's links, each to a literal, which is not a member. */
function withMemberLiterals(dataset: Dataset, catalog: string, count: number): Dataset {
  const values = Array.from({ length: count }, (_, i) => `v${i}`);
  return withLiterals(dataset, catalog, DCAT.dataset, XSD_STRING, values);
}

/** A catalog another app rewrote without its stamp: still Solid Memo's, held to the catalog shape and DCAT-AP. */
function unstampedCatalog(): Dataset {
  return setThing(
    datasetFrom(DOC),
    buildThing(createThing({ url: `${DOC}#catalog` }))
      .addIri(RDF.type, DCAT.Catalog)
      .build(),
  );
}

/** A result about a catalog's link to `value`, which is not a member of the document. */
function memberResult(value: string) {
  return {
    path: DCAT.dataset,
    message: { en: "Value does not have class dcat:Dataset" },
    severity: "violation" as const,
    constraint: "Class",
    value,
  };
}

/**
 * rdfs:subClassOf statements a document may make under a deck's classes
 * (sm:Deck, which Solid Memo's shapes ask of a deck, and dcat:Dataset,
 * which DCAT-AP targets): a cycle and a diamond 30 layers deep under each.
 */
function subclassStatements(iri: (name: string) => string): [string, string, string][] {
  return [SM.Deck, DCAT.Dataset].flatMap((cls, i) => [
    ...subclassCycle(cls, (name) => iri(`c${i}-${name}`)),
    ...subclassDiamond(cls, (name) => iri(`c${i}-${name}`)),
  ]);
}

/** The dataset with these statements of IRIs added. */
function withStatements(dataset: Dataset, statements: [string, string, string][]): Dataset {
  const term = (termType: string, value: string) => ({ termType, value });
  const graph = term("DefaultGraph", "");
  const quads = [
    ...toRdfJsDataset(dataset),
    ...statements.map(([s, p, o]) => ({
      subject: term("NamedNode", s),
      predicate: term("NamedNode", p),
      object: term("NamedNode", o),
      graph,
    })),
  ];
  return fromRdfJsDataset({ [Symbol.iterator]: () => quads[Symbol.iterator]() } as never);
}

function catalog() {
  let dataset = datasetFrom(DOC);
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
    buildThing(createThing({ url: `${DOC}#note` }))
      .addStringNoLocale(DCTERMS.title, "x")
      .build(),
  );
  return dataset;
}

function makeValidator() {
  const validateNode = vi.fn(async (_data: unknown, focus: string) =>
    focus.endsWith("deck-1")
      ? [
          {
            path: SM.cardsDocument,
            message: { en: "Less than 1 values" },
            severity: "violation" as const,
            constraint: "MinCount",
          },
        ]
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
    loadEngine: async () => ({
      createEngine,
      mergeDatasets: (...parts) => parts.flatMap((p) => [...p]) as never,
      mapIris: (data) => data,
    }),
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

  it("checks a release as it was read, against the library's shapes, with no profile, reading nothing itself", async () => {
    const release = "https://alice.example/releases/capitals/v1.ttl";
    const dataset = setThing(
      datasetFrom(release),
      buildThing(createThing({ url: release }))
        .addIri(RDF.type, SM.Deck)
        .addIri(RDF.type, DCAT.Dataset)
        .addInteger(SM.formatVersion, 6)
        .build(),
    );
    const { validator, validateNode, validate, publicFetch } = makeValidator();
    const report = await validator.validateDataset(release, dataset, "library");
    expect(getSolidDatasetOrNull).not.toHaveBeenCalled();
    expect(publicFetch).not.toHaveBeenCalledWith(release, expect.anything());
    expect(report.subjects).toEqual([
      { url: release, status: "checked", shape: "libraryDeck", version: 6, violations: [] },
    ]);
    expect(validateNode).toHaveBeenCalledOnce();
    expect(validate).not.toHaveBeenCalled();
  });

  it("names a deck whose entry or documents no deck's may have, and only it", async () => {
    const instance = "https://pod.example/solid-memo/a/";
    const entry = (url: string, cards: string, reviews: string) =>
      buildThing(createThing({ url }))
        .addIri(RDF.type, SM.Deck)
        .addInteger(SM.formatVersion, 6)
        .addIri(SM.cardsDocument, cards)
        .addIri(SM.reviewsDocument, reviews)
        .build();
    const elsewhere = "https://pod.example/profile/card";
    const climbing = `${instance}reviews/%2e%2e/%2e%2e/private/diary.ttl`;
    const other = "https://pod.example/solid-memo/b/catalog.ttl#deck-4";
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      [
        entry(`${DOC}#deck-1`, `${instance}decks/deck-1.ttl`, `${instance}reviews/deck-1.ttl`),
        entry(`${DOC}#deck-2`, elsewhere, `${instance}reviews/deck-2.ttl`),
        entry(`${DOC}#deck-3`, `${instance}decks/deck-3.ttl`, climbing),
        entry(`${DOC}#deck-5`, `${instance}decks/deck-5.ttl.acl`, `${instance}meta.ttl`),
        entry(
          other,
          "https://pod.example/solid-memo/b/decks/deck-4.ttl",
          `${instance}reviews/x.ttl`,
        ),
      ].reduce(setThing, datasetFrom(DOC)),
    );
    const { validator } = makeValidator();
    const report = await validator.validateDocument(DOC);
    const placed = Object.fromEntries(
      report.subjects.map((subject) => [
        subject.url,
        subject.status === "checked"
          ? subject.violations
              .filter((v) => v.constraint === "DeckPlace")
              .map((v) => [v.path ?? null, v.value, v.severity, v.builtIn])
          : [],
      ]),
    );
    expect(placed).toEqual({
      [`${DOC}#deck-1`]: [],
      // Read wherever it is: whether it may be written is what the document says.
      [`${DOC}#deck-2`]: [],
      [`${DOC}#deck-3`]: [[SM.reviewsDocument, climbing, "violation", true]],
      [`${DOC}#deck-5`]: [
        [SM.cardsDocument, `${instance}decks/deck-5.ttl.acl`, "violation", true],
        [SM.reviewsDocument, `${instance}meta.ttl`, "violation", true],
      ],
      [other]: [[null, other, "violation", true]],
    });
    // A draft's deck is a draft's: where its documents are is the draft's layout.
    const draft = await validator.validateDocument(DOC, "draft");
    expect(
      draft.subjects.flatMap((subject) =>
        subject.status === "checked" ? subject.violations.map((v) => v.constraint) : [],
      ),
    ).not.toContain("DeckPlace");
  });

  it("names no deck of an instance whose address is spelled otherwise than a request sends it", async () => {
    const instance = "https://Pod.example/kortlekar-å/";
    const doc = `${instance}catalog.ttl`;
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(
        datasetFrom(doc),
        buildThing(createThing({ url: "https://pod.example/kortlekar-%C3%A5/catalog.ttl#deck-1" }))
          .addIri(RDF.type, SM.Deck)
          .addInteger(SM.formatVersion, 6)
          .addIri(SM.cardsDocument, `${instance}decks/deck-1.ttl`)
          .addIri(SM.reviewsDocument, "https://pod.example/kortlekar-%C3%A5/reviews/deck-1.ttl")
          .build(),
      ),
    );
    const { validator } = makeValidator();
    const report = await validator.validateDocument(doc);
    expect(
      report.subjects.flatMap((subject) =>
        subject.status === "checked" ? subject.violations.map((v) => v.constraint) : [],
      ),
    ).not.toContain("DeckPlace");
  });

  it("names a date the app cannot read, which SHACL finds valid, wherever the subject is, as a warning only another app's", async () => {
    // Past what a JavaScript date holds either way; the last moment it holds.
    const [far, before, last] = [
      "300000-01-01T00:00:00Z",
      "-300000-01-01T00:00:00Z",
      "275760-09-13T00:00:00Z",
    ];
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      [
        buildThing(createThing({ url: `${DOC}#deck-1` }))
          .addIri(RDF.type, SM.Deck)
          .addInteger(SM.formatVersion, 6)
          .addLiteral(DCTERMS.created, dateTime(far))
          .addLiteral(DCTERMS.modified, dateTime(last)),
        buildThing(createThing({ url: `${DOC}#state` }))
          .addIri(RDF.type, SM.ReviewState)
          .addInteger(SM.formatVersion, 2)
          .addLiteral(SM.lastReviewedAt, dateTime(before)),
        buildThing(createThing({ url: `${DOC}#it` }))
          .addIri(RDF.type, SM.Instance)
          .addInteger(SM.formatVersion, 2)
          .addLiteral(DCTERMS.created, dateTime(far)),
        buildThing(createThing({ url: `${DOC}#card` }))
          .addIri(RDF.type, SM.Card)
          .addInteger(SM.formatVersion, 7)
          .addLiteral(DCTERMS.created, dateTime("soon")),
        buildThing(createThing({ url: `${DOC}#card-2` }))
          .addIri(RDF.type, SM.Card)
          .addInteger(SM.formatVersion, 7)
          .addLiteral(DCTERMS.created, dateTime("T2026-01-01T00:00:00Z")),
        // Another app's catalog: no stamp, and nothing of Solid Memo's names it.
        buildThing(createThing({ url: `${DOC}#theirs` }))
          .addIri(RDF.type, DCAT.Catalog)
          .addLiteral(DCTERMS.modified, dateTime(far)),
      ]
        .map((builder) => builder.build())
        .reduce(setThing, datasetFrom(DOC)),
    );
    const validator = createShaclShapeValidator({
      fetch: vi.fn() as unknown as typeof fetch,
      shapesFetch,
      ...SHAPE_SOURCES,
    });
    const dates = async (context?: "library") =>
      Object.fromEntries(
        (context === undefined
          ? await validator.validateDocument(DOC)
          : await validator.validateDataset(
              DOC,
              (await vi.mocked(getSolidDatasetOrNull).mock.results[0]!.value)!,
              context,
            )
        ).subjects.map((subject) => [
          subject.url,
          subject.status === "checked"
            ? subject.violations
                .filter((v) => v.path === DCTERMS.created || v.constraint === "DateTimeRange")
                .map((v) => [v.constraint, v.path, v.value, v.severity, v.builtIn])
            : [],
        ]),
      );
    expect(await dates()).toEqual({
      [`${DOC}#deck-1`]: [["DateTimeRange", DCTERMS.created, far, "violation", true]],
      [`${DOC}#state`]: [["DateTimeRange", SM.lastReviewedAt, before, "violation", true]],
      [`${DOC}#it`]: [["DateTimeRange", DCTERMS.created, far, "violation", true]],
      // Named once, by the shape: what is no date-time at all is no date of the far past or future.
      [`${DOC}#card`]: [["Datatype", DCTERMS.created, "soon", "violation", true]],
      // One the library throws on is the shape's too, and does not stop the check.
      [`${DOC}#card-2`]: [
        ["Datatype", DCTERMS.created, "T2026-01-01T00:00:00Z", "violation", true],
      ],
      [`${DOC}#theirs`]: [["DateTimeRange", DCTERMS.modified, far, "warning", true]],
    });
    // A release reads its dates as an instance does.
    expect((await dates("library"))[`${DOC}#deck-1`]).toEqual([
      ["DateTimeRange", DCTERMS.created, far, "violation", true],
    ]);
  }, 60_000);

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
            {
              path: SM.cardsDocument,
              message: { en: "Less than 1 values" },
              severity: "violation",
              constraint: "MinCount",
            },
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

  it("reports a subject stamped with a version below 1 as not fitting its shape, as the app reads it, not as newer", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(
        datasetFrom(DOC),
        buildThing(createThing({ url: `${DOC}#deck-0` }))
          .addIri(RDF.type, SM.Deck)
          .addInteger(SM.formatVersion, 0)
          .build(),
      ),
    );
    const { validator, validateNode } = makeValidator();
    await expect(validator.validateDocument(DOC)).resolves.toEqual({
      url: DOC,
      status: "checked",
      subjects: [
        {
          url: `${DOC}#deck-0`,
          status: "checked",
          shape: "deck",
          version: 0,
          violations: [
            {
              path: SM.formatVersion,
              message: { en: expect.stringContaining("below 1") },
              builtIn: true,
              value: "0",
              severity: "violation",
              constraint: "FormatVersionRange",
            },
          ],
        },
      ],
    });
    expect(validateNode).not.toHaveBeenCalled();
  });

  it("checks a document with DCAT or FOAF subjects against DCAT-AP too, merging what it finds by subject", async () => {
    const DCAT_DATASET = "http://www.w3.org/ns/dcat#Dataset";
    let dataset = catalog();
    dataset = setThing(
      dataset,
      buildThing(createThing({ url: `${DOC}#deck-1` }))
        .addIri(RDF.type, SM.Deck)
        .addIri(RDF.type, DCAT_DATASET)
        .addStringNoLocale(DCTERMS.title, "Capitals")
        .addInteger(SM.formatVersion, 2)
        .build(),
    );
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
    const profiled = {
      path: DCTERMS.description,
      message: { en: "Less than 1 values" },
      severity: "violation",
      constraint: "MinCount",
      profile: "dcat-ap",
    };
    expect(report.subjects).toEqual([
      expect.objectContaining({
        url: `${DOC}#deck-1`,
        status: "checked",
        violations: [expect.anything(), profiled],
      }),
      { url: `${DOC}#deck-2`, status: "newer", shape: "deck", version: 9, latest: 6 },
      {
        url: `${DOC}#note`,
        status: "profiled",
        violations: [{ ...profiled, severity: "warning" }],
        foreign: true,
      },
    ]);
  });

  it("reports what another app wrote — no Solid Memo class, format stamp or link from a subject of Solid Memo's — with warnings only", async () => {
    const FOAF_AGENT = "http://xmlns.com/foaf/0.1/Agent";
    let dataset = datasetFrom(DOC);
    for (const [id, stamped] of [
      ["agent-mine", true],
      ["agent-theirs", false],
    ] as const) {
      const agent = buildThing(createThing({ url: `${DOC}#${id}` })).addIri(RDF.type, FOAF_AGENT);
      dataset = setThing(
        dataset,
        (stamped ? agent.addInteger(SM.formatVersion, 1) : agent).build(),
      );
    }
    dataset = setThing(
      dataset,
      buildThing(createThing({ url: `${DOC}#stamped` }))
        .addIri(RDF.type, "http://www.w3.org/ns/dcat#Dataset")
        .addInteger(SM.formatVersion, 1)
        .build(),
    );
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(dataset);
    const { validator, validateNode, validate } = makeValidator();
    const nameless = {
      path: "http://xmlns.com/foaf/0.1/name",
      message: { en: "Less than 1 values" },
      severity: "violation" as const,
      constraint: "MinCount",
    };
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
      {
        url: `${DOC}#agent-mine`,
        status: "checked",
        shape: "agent",
        version: 1,
        violations: [nameless, odd, profiled],
      },
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

  it("holds a catalog and its publisher that lost their stamps as Solid Memo's, warning only about its links to another app's members", async () => {
    const alice = "https://alice.example/profile/card#me";
    let dataset = datasetFrom(DOC);
    for (const thing of [
      // Another app rewrote the catalog and its publisher without the triples it does not know, sm:formatVersion among them.
      buildThing(createThing({ url: `${DOC}#catalog` }))
        .addIri(RDF.type, DCAT.Catalog)
        .addUrl(DCTERMS.publisher, alice)
        .addUrl(DCAT.dataset, `${DOC}#recipes`)
        .addUrl(DCAT.dataset, `${DOC}#deck-gone`),
      buildThing(createThing({ url: alice })).addIri(RDF.type, "http://xmlns.com/foaf/0.1/Agent"),
      // Another app's dataset, described beside the decks with a class of its own.
      buildThing(createThing({ url: `${DOC}#recipes` })).addIri(
        RDF.type,
        "https://schema.org/Dataset",
      ),
    ]) {
      dataset = setThing(dataset, thing.build());
    }
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      withBlankMember(dataset, `${DOC}#catalog`, "theirs") as never,
    );
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
      // A link to nothing the document describes, and one to a blank node another subject names, are the catalog's own.
      result("Class", DCAT.dataset, `${DOC}#deck-gone`),
      result("NodeKind", DCAT.dataset, "elsewhere"),
      result("MinCount", DCAT.dataset),
    ];
    validate.mockResolvedValue([
      ...members.map((member) => ({ focusNode: `${DOC}#catalog`, ...member })),
      // What DCAT-AP says of the blank node itself: it has no report.
      { focusNode: "theirs", ...result("MinCount", DCTERMS.title) },
    ]);
    const [recipes, theirs, ...own] = members.map((member) => ({ ...member, profile: "dcat-ap" }));
    expect((await validator.validateDocument(DOC)).subjects).toEqual([
      {
        url: `${DOC}#catalog`,
        status: "checked",
        shape: "catalog",
        version: 1,
        violations: [
          untitled,
          { ...recipes, severity: "warning" },
          { ...theirs, severity: "warning" },
          ...own,
        ],
      },
      { url: alice, status: "checked", shape: "agent", version: 1, violations: [untitled] },
      { url: `${DOC}#recipes`, status: "untyped" },
    ]);
  });

  it("reports many links of a catalog that are not members in time that grows with them, not their square", async () => {
    // Eight times the links must take less than four times as long as an
    // eighth of them done eight times over (testing.md).
    const ratio = await growthAsync(
      (count) => {
        const dataset = withMemberLiterals(unstampedCatalog(), `${DOC}#catalog`, count);
        const results = Array.from({ length: count }, (_, i) => memberResult(`v${i}`));
        const { validator, validateNode, validate } = makeValidator();
        validateNode.mockResolvedValue(results as never);
        validate.mockResolvedValue(results.map((r) => ({ focusNode: `${DOC}#catalog`, ...r })));
        return () => {
          vi.mocked(getSolidDatasetOrNull).mockResolvedValueOnce(dataset as never);
          return validator.validateDocument(DOC);
        };
      },
      2000,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("reports many dates of a catalog the app cannot read, which the shape names too, in time that grows with them, not their square", async () => {
    const ratio = await growthAsync(
      (count) => {
        const far = Array.from({ length: count }, (_, i) => `${300_000 + i}-01-01T00:00:00Z`);
        const dataset = withLiterals(
          unstampedCatalog(),
          `${DOC}#catalog`,
          DCTERMS.modified,
          XSD_DATETIME,
          far,
        );
        const { validator, validateNode } = makeValidator();
        validateNode.mockResolvedValue(
          far.map((value) => ({
            path: DCTERMS.modified,
            message: { en: "Value does not have datatype xsd:dateTime" },
            severity: "violation" as const,
            constraint: "Datatype",
            value,
          })) as never,
        );
        return () => {
          vi.mocked(getSolidDatasetOrNull).mockResolvedValueOnce(dataset as never);
          return validator.validateDocument(DOC);
        };
      },
      2000,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("holds a DCAT deck to DCAT-AP with the site's own profile and reference data", async () => {
    vi.mocked(getSolidDatasetOrNull).mockResolvedValue(
      setThing(
        datasetFrom(DOC),
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
    expect(
      deck.violations
        .filter((v) => v.profile === "dcat-ap")
        .map((v) => v.path)
        .sort(),
    ).toEqual([DCTERMS.description, "http://www.w3.org/ns/dcat#theme"]);
    await validator.validateDocument(DOC);
  });

  it("finds nothing wrong with a deck's documents as the app writes them, another scheduler's state warned about only", async () => {
    const CARDS = "https://pod.example/solid-memo/a/decks/deck-1.ttl";
    const REVIEWS = "https://pod.example/solid-memo/a/reviews/deck-1.ttl";
    const cards = [
      // The document itself, part of its deck: no class, so no shape and nothing to check.
      buildThing(createThing({ url: CARDS }))
        .addIri(DCTERMS.isPartOf, `${DOC}#deck-1`)
        .build(),
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
    ].reduce<Dataset>((dataset, thing) => setThing(dataset, thing), datasetFrom(CARDS));
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
      toReviewStateThing(
        documents,
        { ...state, direction: "back-to-front" },
        null,
        `${REVIEWS}#state-7f3a`,
      ),
      // This app's FSRS-6 state of the card: checked against its own shape, and conforming.
      toFsrsStateThing(
        documents,
        {
          cardId: "card-1",
          direction: "front-to-back",
          stability: 2.3,
          difficulty: 2.1,
          due: "2026-09-23",
          firstReviewedAt: state.firstReviewedAt,
          lastReviewedAt: state.lastReviewedAt,
          formatVersion: 1,
        },
        null,
        `${REVIEWS}#card-1@fsrs6`,
      ),
      // Another scheduler's state: none of SM-2's fields.
      buildThing(createThing({ url: `${REVIEWS}#fsrs-1` }))
        .addIri(RDF.type, SM.ReviewState)
        .addIri(SM.reviewOf, `${CARDS}#card-1`)
        .addIri(SM.scheduler, "https://fsrs.example/ns#fsrs")
        .build(),
    ].reduce<Dataset>((dataset, thing) => setThing(dataset, thing), datasetFrom(REVIEWS));
    vi.mocked(getSolidDatasetOrNull).mockImplementation(
      async (url) => (url === CARDS ? cards : reviews) as never,
    );
    const validator = createShaclShapeValidator({
      fetch: vi.fn() as unknown as typeof fetch,
      shapesFetch,
      ...SHAPE_SOURCES,
    });
    const cardsReport = await validator.validateDocument(CARDS);
    // The document saying it is the deck's is Solid Memo's, and listed as no stray.
    expect(cardsReport.subjects.find((subject) => subject.url === CARDS)).toBeUndefined();
    expect(
      cardsReport.subjects.flatMap((subject) =>
        "violations" in subject ? subject.violations : [],
      ),
    ).toEqual([]);
    const reviewsReport = await validator.validateDocument(REVIEWS);
    const results = reviewsReport.subjects.flatMap((subject) =>
      "violations" in subject ? subject.violations : [],
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((v) => v.severity === "warning")).toBe(true);
    expect(
      reviewsReport.subjects.find((subject) => subject.url === `${REVIEWS}#fsrs-1`),
    ).toMatchObject({ foreign: true });
    const own = reviewsReport.subjects.find((subject) => subject.url === `${REVIEWS}#card-1@fsrs6`);
    expect(own).toMatchObject({ status: "checked", shape: "fsrsReviewState", violations: [] });
    expect(own).not.toHaveProperty("foreign");
  });

  it("checks a write with the engine it has: pathless results named by subject, warnings and results about other subjects passed over", async () => {
    const { validator, validateNode, validate } = makeValidator();
    validateNode.mockResolvedValue([
      {
        message: { en: "Each side needs text or a picture." },
        severity: "violation",
        constraint: "Or",
      },
      { path: SM.front, message: { en: "odd" }, severity: "warning", constraint: "Pattern" },
    ] as never);
    validate.mockResolvedValue([
      {
        focusNode: `${DOC}#other`,
        message: { en: "x" },
        severity: "violation",
        constraint: "MinCount",
      },
    ]);
    const dataset = setThing(
      setThing(
        datasetFrom(DOC),
        buildThing(createThing({ url: `${DOC}#deck-1` }))
          .addIri(RDF.type, SM.Deck)
          .addIri(RDF.type, "http://www.w3.org/ns/dcat#Dataset")
          .addInteger(SM.formatVersion, 3)
          .build(),
      ),
      buildThing(createThing({ url: `${DOC}#other` }))
        .addStringNoLocale(DCTERMS.title, "x")
        .build(),
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
    type Builder = SubjectBuilder;
    const deck = (build: (t: Builder) => Builder) =>
      setThing(
        datasetFrom(DOC),
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
        validator.checkSubjects(
          deck((t) => t.addStringNoLocale(DCTERMS.description, "Capitals.")),
          [`${DOC}#deck-1`, `${DOC}#gone`],
          "pod",
        ),
      ).resolves.toBeUndefined();
    });

    it("refuses a write that breaks a shape or DCAT-AP, naming every problem", async () => {
      await expect(
        validator.checkSubjects(
          deck((t) => t),
          [`${DOC}#deck-1`],
          "pod",
        ),
      ).rejects.toThrow(
        [
          "Solid Memo did not save this: it is not in the format Solid Memo expects. Nothing was changed. Reload the page and try again.",
          `problems: <${DOC}#deck-1> (${DCTERMS.description}): A format-3 deck has a description, as DCAT-AP asks of every dataset.`,
          `  <${DOC}#deck-1> (${DCTERMS.description}): DCAT-AP: Less than 1 values`,
        ].join("\n"),
      );
    });

    it("holds a catalog's members of its own document to their class, not those another document describes or another app wrote", async () => {
      const written = withCatalog(datasetFrom(DOC), DOC, {
        title: "Main",
        description: "My decks.",
        publisher: { webId: "https://alice.example/profile/card#me", name: "Alice" },
      });
      const listing = (member: string) =>
        setThing(
          written,
          buildThing(getThing(written, `${DOC}#catalog`)!)
            .addIri(DCAT.dataset, member)
            .build(),
        );
      await expect(
        validator.checkSubjects(
          listing("https://pod.example/recipes/index.ttl#cookbook"),
          [`${DOC}#catalog`],
          "pod",
        ),
      ).resolves.toBeUndefined();
      // Another app's members of this document: one it described with a class of its own, and a blank node.
      const theirs = setThing(
        listing(`${DOC}#recipes`),
        buildThing(createThing({ url: `${DOC}#recipes` }))
          .addIri(RDF.type, "https://schema.org/Dataset")
          .build(),
      );
      await expect(
        validator.checkSubjects(theirs, [`${DOC}#catalog`], "pod"),
      ).resolves.toBeUndefined();
      await expect(
        validator.checkSubjects(
          withBlankMember(written, `${DOC}#catalog`, "theirs"),
          [`${DOC}#catalog`],
          "pod",
        ),
      ).resolves.toBeUndefined();
      await expect(
        validator.checkSubjects(listing(`${DOC}#deck-gone`), [`${DOC}#catalog`], "pod"),
      ).rejects.toThrow(`<${DOC}#catalog> (${DCAT.dataset}): DCAT-AP:`);
    });

    it("refuses a catalog with many links that are not members in time that grows with them, not their square", async () => {
      const ratio = await growthAsync(
        (count) => {
          const dataset = withMemberLiterals(unstampedCatalog(), `${DOC}#catalog`, count);
          const results = Array.from({ length: count }, (_, i) => memberResult(`v${i}`));
          const { validator, validateNode, validate } = makeValidator();
          validateNode.mockResolvedValue(results as never);
          validate.mockResolvedValue(results.map((r) => ({ focusNode: `${DOC}#catalog`, ...r })));
          return () =>
            validator.checkSubjects(dataset, [`${DOC}#catalog`], "pod").catch(() => undefined);
        },
        4000,
        8,
      );
      expect(ratio).toBeLessThan(4);
    });

    it("holds a draft to the draft shapes and not yet to DCAT-AP, and an instance's deck to the pod's", async () => {
      const draft = setThing(
        datasetFrom(DOC),
        buildThing(createThing({ url: DOC }))
          .addIri(RDF.type, SM.Deck)
          .addIri(RDF.type, "http://www.w3.org/ns/dcat#Dataset")
          .addInteger(SM.formatVersion, 1)
          .addIri(SM.studyDirection, SM.frontToBack)
          .build(),
      );
      await expect(validator.checkSubjects(draft, [DOC], "draft")).resolves.toBeUndefined();
      await expect(validator.checkSubjects(draft, [DOC], "pod")).rejects.toThrow(
        `<${DOC}> (${DCTERMS.title}):`,
      );
      const released = setThing(
        draft,
        buildThing(getThing(draft, DOC)!).addStringNoLocale(SM.releasedAs, "v1.ttl").build(),
      );
      await expect(validator.checkSubjects(released, [DOC], "draft")).rejects.toThrow(
        `<${DOC}> (${SM.releasedAs}): A released draft names the one release it was published as, an IRI.`,
      );
    });

    it("checks a draft's document against the draft shapes, without DCAT-AP, when told it is a draft's", async () => {
      const draft = setThing(
        datasetFrom(DOC),
        buildThing(createThing({ url: DOC }))
          .addIri(RDF.type, SM.Deck)
          .addIri(RDF.type, "http://www.w3.org/ns/dcat#Dataset")
          .addInteger(SM.formatVersion, 1)
          .addIri(SM.studyDirection, SM.frontToBack)
          .build(),
      );
      vi.mocked(getSolidDatasetOrNull).mockResolvedValue(draft);
      const asDraft = await validator.validateDocument(DOC, "draft");
      expect(asDraft.subjects).toEqual([
        expect.objectContaining({ shape: "draftDeck", violations: [] }),
      ]);
      const asPod = await validator.validateDocument(DOC);
      expect(asPod.subjects).toEqual([
        expect.objectContaining({
          shape: "deck",
          violations: expect.arrayContaining([expect.anything()]),
        }),
      ]);
    });

    it("stays bounded over a document's own rdfs:subClassOf statements, in a write and a document's check alike", async () => {
      const draft = setThing(
        datasetFrom(DOC),
        buildThing(createThing({ url: DOC }))
          .addIri(RDF.type, SM.Deck)
          .addIri(RDF.type, DCAT.Dataset)
          .addInteger(SM.formatVersion, 1)
          .addIri(SM.studyDirection, SM.frontToBack)
          .build(),
      );
      const tangled = withStatements(
        draft,
        subclassStatements((name) => `${DOC}#${name}`),
      );
      await expect(validator.checkSubjects(tangled, [DOC], "draft")).resolves.toBeUndefined();
      await expect(validator.checkSubjects(tangled, [DOC], "pod")).rejects.toThrow(
        `<${DOC}> (${DCTERMS.title}):`,
      );
      vi.mocked(getSolidDatasetOrNull).mockResolvedValue(tangled as never);
      const checked = async (as?: "draft") =>
        (await validator.validateDocument(DOC, as)).subjects.filter(
          (subject) => subject.status === "checked",
        );
      expect(await checked("draft")).toEqual([
        expect.objectContaining({ shape: "draftDeck", violations: [] }),
      ]);
      const asPod = await checked();
      vi.mocked(getSolidDatasetOrNull).mockResolvedValue(draft);
      expect(asPod).toEqual(await checked());
    }, 10_000);

    it("checks a release from a link as it would without the release's own rdfs:subClassOf statements", async () => {
      const release = "https://alice.example/releases/capitals/v1.ttl";
      const plain = setThing(
        datasetFrom(release),
        buildThing(createThing({ url: release }))
          .addIri(RDF.type, SM.Deck)
          .addIri(RDF.type, DCAT.Dataset)
          .addInteger(SM.formatVersion, 6)
          .build(),
      );
      const checked = async (dataset: Dataset) => {
        return (await validator.validateDataset(release, dataset, "library")).subjects.filter(
          (subject) => subject.status === "checked",
        );
      };
      const expected = await checked(plain);
      expect(expected).toEqual([
        expect.objectContaining({
          shape: "libraryDeck",
          violations: expect.arrayContaining([expect.anything()]),
        }),
      ]);
      expect(
        await checked(
          withStatements(
            plain,
            subclassStatements((name) => `${release}#${name}`),
          ),
        ),
      ).toEqual(expected);
    }, 10_000);

    describe("a grade of review states another app wrote out of range", () => {
      const REVIEWS = "https://pod.example/solid-memo/a/reviews/deck-1.ttl";
      const documents = {
        id: "deck-1",
        cardsDocumentUrl: "https://pod.example/solid-memo/a/decks/deck-1.ttl",
        reviewsDocumentUrl: REVIEWS,
      };
      const key = { cardId: "card-1", direction: "front-to-back" } as const;
      const lastReviewedAt = new Date(2026, 9, 2, 12).toISOString();
      const sm2: ReviewState = {
        ...key,
        easeFactor: 2.5,
        intervalDays: 6,
        repetitions: 2,
        due: "0",
        firstReviewedAt: new Date(2026, 8, 20, 12).toISOString(),
        lastReviewedAt,
        formatVersion: 2,
      };
      const fsrs: FsrsState = {
        ...key,
        stability: 0,
        difficulty: 50,
        due: "soon",
        firstReviewedAt: sm2.firstReviewedAt,
        lastReviewedAt,
        formatVersion: 1,
      };
      const scheduling = { scheduler: "fsrs6", dayBoundaryHour: 4, desiredRetention: 0.9 } as const;

      // Each value a valid lexical form the reader takes: graded, the states
      // and their snapshots are still written as the shapes allow.
      it.each([
        ["an earlier day", sm2, fsrs, new Date(2026, 9, 5, 12)],
        [
          "the same day, their snapshots out of range too",
          { ...sm2, previous: { ...sm2, due: "0" } },
          { ...fsrs, previous: { ...fsrs, stability: -5 } },
          new Date(2026, 9, 2, 18),
        ],
      ] as const)("passes the write check, graded on %s", async (_, before, beforeFsrs, now) => {
        const graded = gradePrompt(
          key,
          { sm2: before, fsrs: beforeFsrs },
          { grade: 4, mode: "recall" },
          now,
          scheduling,
        );
        const dataset = [
          toReviewStateThing(documents, graded.sm2, null, `${REVIEWS}#card-1`),
          toFsrsStateThing(documents, graded.fsrs!, null, `${REVIEWS}#card-1@fsrs6`),
        ].reduce<Dataset>((data, thing) => setThing(data, thing), datasetFrom(REVIEWS));
        await expect(
          validator.checkSubjects(dataset, [`${REVIEWS}#card-1`, `${REVIEWS}#card-1@fsrs6`], "pod"),
        ).resolves.toBeUndefined();
      });
    });

    it("checks only the subjects a write touches, leaving untyped and newer ones alone", async () => {
      const dataset = setThing(
        setThing(
          deck((t) => t),
          buildThing(createThing({ url: `${DOC}#note` }))
            .addStringNoLocale(DCTERMS.title, "x")
            .build(),
        ),
        buildThing(createThing({ url: `${DOC}#future` }))
          .addIri(RDF.type, SM.Deck)
          .addInteger(SM.formatVersion, 9)
          .build(),
      );
      await expect(
        validator.checkSubjects(dataset, [`${DOC}#note`, `${DOC}#future`], "pod"),
      ).resolves.toBeUndefined();
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
    String(input) === INDEX
      ? new Response(INDEX_TURTLE, { headers: { "content-type": "text/turtle" } })
      : shapesFetch(input)) as typeof globalThis.fetch;
  const validator = createShaclShapeValidator({
    fetch: siteFetch,
    shapesFetch: siteFetch,
    ...SHAPE_SOURCES,
  });
  const DCTERMS_NS = "http://purl.org/dc/terms/";
  const DCAT_NS = "http://www.w3.org/ns/dcat#";
  const brief = (problems: Awaited<ReturnType<typeof validator.validateRelease>>) =>
    problems.map((p) => [
      p.severity,
      p.code,
      p.subject,
      p.field,
      "profile" in p.params ? p.params.profile : undefined,
    ]);

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
      message: {
        en: "A library deck names its publisher, a foaf:Agent.",
        sv: "En bibliotekskortlek anger sin utgivare, en foaf:Agent.",
      },
      constraint: "MinCount",
    });
  }, 60_000);

  it("names a subject typed with a Solid Memo term no shape describes, and a value a result is about", async () => {
    const base = courseDraft();
    const draft = {
      ...base,
      root: { ...base.root, publisher: of("me") },
      triples: [
        ...base.triples,
        {
          subject: of("odd"),
          predicate: RDF.type,
          object: { kind: "iri" as const, value: "https://solid-memo.com/ns/vocab/v1.ttl#Nothing" },
        },
      ],
    };
    const found = await validator.validateRelease(draft, AT);
    expect(found).toContainEqual({
      severity: "error",
      subject: of("odd"),
      code: "unshaped",
      params: {},
    });
    expect(found.find((p) => p.field === `${DCTERMS_NS}publisher`)!.params).toMatchObject({
      value: of("me"),
      profile: "dcat-ap",
      constraint: "Class",
      builtIn: true,
    });
  }, 60_000);

  it("checks a draft as it would without the draft's own rdfs:subClassOf statements", async () => {
    const draft = courseDraft();
    const tangle = subclassStatements(of);
    const tangled = {
      ...draft,
      triples: [
        ...draft.triples,
        ...tangle.map(([subject, predicate, object]) => ({
          subject,
          predicate,
          object: { kind: "iri" as const, value: object },
        })),
      ],
    };
    const classes = new Set(tangle.map(([subject]) => subject));
    const found = await validator.validateRelease(tangled, draft.url);
    expect(found.filter((p) => !classes.has(p.subject))).toEqual(
      await validator.validateRelease(draft, draft.url),
    );
  }, 60_000);

  it("names a date of the release its readers cannot read as an error, and a value no date-time at all once", async () => {
    const base = courseDraft();
    const created = (value: string) => ({
      subject: of("card-1"),
      predicate: DCTERMS.created,
      object: { kind: "literal" as const, value, language: "", datatype: XSD_DATETIME },
    });
    const draft = {
      ...base,
      triples: [
        ...base.triples,
        {
          subject: of("card-1"),
          predicate: RDF.type,
          object: { kind: "iri" as const, value: SM.Card },
        },
        created("300000-01-01T00:00:00Z"),
        created("soon"),
      ],
    };
    const dates = (await validator.validateRelease(draft, AT))
      .filter((p) => p.subject === of("card-1") && p.field === DCTERMS.created)
      .map((p) => [
        p.severity,
        "constraint" in p.params ? p.params.constraint : undefined,
        "value" in p.params ? p.params.value : undefined,
      ]);
    expect(dates).toEqual(
      expect.arrayContaining([
        ["error", "DateTimeRange", "300000-01-01T00:00:00Z"],
        ["error", "Datatype", "soon"],
      ]),
    );
    expect(dates.filter(([, , value]) => value === "soon")).toHaveLength(1);
  }, 60_000);

  it("checks a review state in a release against the shape its scheduler picks, an IRI only", async () => {
    const base = courseDraft();
    const state = (name: string, scheduler: ReleaseTerm) => [
      {
        subject: of(name),
        predicate: RDF.type,
        object: { kind: "iri" as const, value: SM.ReviewState },
      },
      { subject: of(name), predicate: SM.scheduler, object: scheduler },
    ];
    const draft = {
      ...base,
      triples: [
        ...base.triples,
        ...state("fsrs", { kind: "iri", value: SM.fsrs6 }),
        ...state("text", {
          kind: "literal",
          value: SM.fsrs6,
          language: "",
          datatype: "http://www.w3.org/2001/XMLSchema#string",
        }),
      ],
    };
    const found = await validator.validateRelease(draft, AT);
    const fields = (name: string) =>
      found.filter((p) => p.subject === of(name)).map((p) => p.field);
    expect(fields("fsrs")).toContain(SM.stability);
    expect(fields("text")).not.toContain(SM.stability);
    expect(fields("text")).toContain(SM.easeFactor);
  }, 60_000);

  it("checks a release for a library with its index beside it, the series it names a version of it, described when the index has it not", async () => {
    const base = courseDraft();
    const inLibrary = (series: string, publisher = `${INDEX}#pub`) => ({
      ...base,
      root: { ...base.root, inSeries: series, isVersionOf: series, publisher },
    });
    const links = (found: ReturnType<typeof brief>) =>
      found.filter(
        ([, , , field]) => field === `${DCAT_NS}inSeries` || field === `${DCTERMS_NS}publisher`,
      );
    // Without the index, nothing beside the release describes its series and publisher, and nothing is read for them: a release in a pod is whole on its own, or they are none.
    const reads = vi.fn(siteFetch);
    const alone = createShaclShapeValidator({ fetch: reads, shapesFetch: reads, ...SHAPE_SOURCES });
    expect(links(brief(await alone.validateRelease(inLibrary(`${INDEX}#listed`), AT)))).toEqual([
      ["error", "shape", DRAFT, `${DCTERMS_NS}publisher`, "dcat-ap"],
      ["error", "shape", DRAFT, `${DCAT_NS}inSeries`, "dcat-ap"],
    ]);
    expect(reads.mock.calls.map(([input]) => String(input))).not.toContain(INDEX);
    // With it, they are: a publisher the index describes as something else is not one.
    const wrong = brief(
      await validator.validateRelease(inLibrary(`${INDEX}#solid`, `${INDEX}#listed`), AT, INDEX),
    );
    expect(wrong).toContainEqual(["error", "shape", DRAFT, `${DCTERMS_NS}publisher`, "dcat-ap"]);
    for (const series of [`${INDEX}#solid`, `${INDEX}#listed`]) {
      const found = brief(await validator.validateRelease(inLibrary(series), AT, INDEX));
      expect(
        found.filter(
          ([, , , field]) => field === `${DCAT_NS}inSeries` || field === `${DCTERMS_NS}publisher`,
        ),
      ).toEqual([]);
      expect(found.every(([, , subject]) => (subject as string).startsWith(DRAFT))).toBe(true);
    }
    // A release that describes its series itself has no need of the index's.
    const own = await validator.validateRelease(base, AT, INDEX);
    expect(brief(own)).toContainEqual([
      "error",
      "shape",
      of("series"),
      `${DCTERMS_NS}description`,
      undefined,
    ]);
  }, 60_000);

  // A deck and a course, each the latest of its series; small ones, for each is checked whole, five times over.
  it.each(["greek-alphabet/v2.ttl", "getting-started/v5.ttl"])(
    "finds nothing wrong with the next version of decks/%s, in a pod, where it is published and as published, alone, or for the library: it describes its publisher and series as the index does",
    async (path) => {
      const pod = await draftPod();
      const release = await pod.repository.readRelease(`${DECKS}${path}`);
      const [name, file] = path.split("/") as [string, string];
      const version = Number(file.slice(1, -".ttl".length));
      const url = draftUrlOf(INSTANCE, name, version + 1);
      // The draft as the Studio makes it, written in the pod and read back, as the pod answers.
      const datasets = await vi.importActual<typeof import("./datasets")>("./datasets");
      vi.mocked(getSolidDatasetOrNull).mockImplementation(datasets.getSolidDatasetOrNull);
      await pod.repository.create(
        INSTANCE,
        nextVersionDraft(release, url, await pod.repository.readLinked(release)),
      );
      const { draft } = await pod.repository.read(url);
      const published = `${INSTANCE}releases/${name}/v${version + 1}.ttl`;
      expect(await pod.validator.validateRelease(draft, draft.url)).toEqual([]);
      expect(await pod.validator.validateRelease(draft, published)).toEqual([]);
      expect(
        await pod.validator.validateRelease(
          draft,
          `${DECKS}${name}/v${version + 1}.ttl`,
          `${DECKS}index.ttl`,
        ),
      ).toEqual([]);
      // The document published, and downloaded, read back as it is, with nothing of the library's to read beside it.
      const turtle = await pod.repository.assemble(url, published, "2026-10-10T00:00:00Z");
      const quads = await quadsOfTurtle(turtle, published);
      for (const iri of [
        `${DECKS}index.ttl#${name}`,
        `${DECKS}index.ttl#solid-memo`,
        `${DECKS}${path}`,
      ]) {
        expect(quads.some((quad) => quad.subject.value === iri)).toBe(true);
      }
      const offline = (async (input: RequestInfo | URL) =>
        String(input).startsWith(DECKS)
          ? new Response("gone", { status: 404 })
          : shapesFetch(input)) as typeof globalThis.fetch;
      const alone = createShaclShapeValidator({
        fetch: offline,
        shapesFetch: offline,
        ...SHAPE_SOURCES,
      });
      const read = await pod.repository.parseRelease(turtle, "turtle");
      expect(read.url).toBe(published);
      expect(await alone.validateRelease(read, published)).toEqual([]);
      // Its publisher and series are held to their class: named as something it does not describe, they are none.
      const elsewhere = {
        ...draft,
        root: {
          ...draft.root,
          publisher: `${DECKS}index.ttl#nobody`,
          inSeries: `${DECKS}index.ttl#nothing`,
        },
      };
      expect(brief(await alone.validateRelease(elsewhere, elsewhere.url))).toEqual(
        expect.arrayContaining([
          ["error", "shape", url, `${DCTERMS_NS}publisher`, "dcat-ap"],
          ["error", "shape", url, `${DCAT_NS}inSeries`, "dcat-ap"],
        ]),
      );
    },
    120_000,
  );

  it("keeps a shape's warning a warning, and a result about no field the subject's", async () => {
    const warning = {
      message: { en: "Careful." },
      severity: "warning" as const,
      constraint: "Node",
    };
    const engine: ShapeEngine = {
      validateNode: vi.fn(async () => [warning]),
      validate: vi.fn(async () => []),
    };
    const loader: ShapeLoader = {
      load: vi.fn(async () => ({ size: 0 }) as never),
      loadProfile: vi.fn(async () => []),
      loadReferenceData: vi.fn(async () => []),
    };
    const faked = createShaclShapeValidator({
      fetch: vi.fn() as unknown as typeof fetch,
      shapesFetch: vi.fn() as unknown as typeof fetch,
      ...SHAPE_SOURCES,
      loadEngine: async () => ({
        createEngine: () => engine,
        mergeDatasets: (...parts) => parts.flatMap((p) => [...p]) as never,
        mapIris: (data) => data,
      }),
      loader,
    });
    const found = await faked.validateRelease(courseDraft(), DRAFT);
    expect(found).toContainEqual({
      severity: "warning",
      subject: DRAFT,
      code: "shape",
      params: { message: { en: "Careful." }, constraint: "Node" },
    });
  });
});
