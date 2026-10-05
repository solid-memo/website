import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/pod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildThing,
  createThing,
  mockSolidDatasetFrom,
  setThing,
  type ThingBuilder,
  type ThingPersisted,
} from "@inrupt/solid-client";
import { getSolidDatasetOrNull } from "./datasets";
import { DCTERMS, RDF, SM } from "./vocab";
import type { ShapeEngine } from "@solid-memo/shacl/engine";
import { createShaclShapeValidator } from "./shaclShapeValidator";
import type { ShapeLoader } from "@solid-memo/shacl/shapeLoader";

vi.mock("./datasets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./datasets")>()),
  getSolidDatasetOrNull: vi.fn(),
}));

const DOC = "https://pod.example/solid-memo/a/catalog.ttl";

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
  const validator = createShaclShapeValidator({
    fetch: vi.fn() as unknown as typeof fetch,
    shapesFetch: vi.fn() as unknown as typeof fetch,
    ...SHAPE_SOURCES,
    loadEngine: async () => ({ createEngine, mergeDatasets: (...parts) => parts.flatMap((p) => [...p]) as never }),
    loader,
  });
  return { validator, validateNode, validate, createEngine, loader };
}

beforeEach(() => {
  vi.mocked(getSolidDatasetOrNull).mockReset();
});

describe("createShaclShapeValidator", () => {
  it("loads the engine and the shapes from the shapes' pod itself by default", async () => {
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
      "https://pod.solid-memo.com/shapes/deck/v2#inPod",
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
      { url: `${DOC}#note`, status: "profiled", violations: [profiled] },
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
    await expect(validator.checkSubjects(dataset, [`${DOC}#deck-1`])).rejects.toThrow(
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
        validator.checkSubjects(deck((t) => t.addStringNoLocale(DCTERMS.description, "Capitals.")), [`${DOC}#deck-1`, `${DOC}#gone`]),
      ).resolves.toBeUndefined();
    });

    it("refuses a write that breaks a shape or DCAT-AP, naming every problem", async () => {
      await expect(validator.checkSubjects(deck((t) => t), [`${DOC}#deck-1`])).rejects.toThrow(
        [
          "Solid Memo did not save this: it is not in the format Solid Memo expects. Nothing was changed. Reload the page and try again.",
          `problems: <${DOC}#deck-1> (${DCTERMS.description}): A format-3 deck has a description, as DCAT-AP asks of every dataset.`,
          `  <${DOC}#deck-1> (${DCTERMS.description}): DCAT-AP: Less than 1 values`,
        ].join("\n"),
      );
    });

    it("checks only the subjects a write touches, leaving untyped and newer ones alone", async () => {
      const dataset = setThing(
        setThing(deck((t) => t), buildThing(createThing({ url: `${DOC}#note` })).addStringNoLocale(DCTERMS.title, "x").build()),
        buildThing(createThing({ url: `${DOC}#future` })).addIri(RDF.type, SM.Deck).addInteger(SM.formatVersion, 9).build(),
      );
      await expect(validator.checkSubjects(dataset, [`${DOC}#note`, `${DOC}#future`])).resolves.toBeUndefined();
    });
  });
});
