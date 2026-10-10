import {
  asUrl,
  getThing,
  getThingAll,
  getUrlAll,
  toRdfJsDataset,
  type SolidDataset,
} from "@inrupt/solid-client";
import type { DatasetCore, Quad } from "@rdfjs/types";
import type { DocumentContext, ShapeValidator } from "@solid-memo/application/ports";
import type { DocumentReport, SubjectReport, Violation } from "@solid-memo/domain/validation";
import { getSolidDatasetOrNull } from "./datasets";
import { readSince } from "./readSince";
import { storedVersionOf } from "./records";
import type { WriteCheck, WriteContext } from "./writeCheck";
import { foreignSubjects } from "./ownership";
import { RDF, SM_NS } from "./vocab";
import type { ShapeEngine } from "@solid-memo/shacl/engine";
import { coreOnly } from "@solid-memo/shacl/profiles";
import { pickShape } from "@solid-memo/shacl/registry";
import type { ShapeDescriptor } from "@solid-memo/vocab/shapeDescriptor";
import { createShapeLoader, type ShapeLoader } from "@solid-memo/shacl/shapeLoader";
import { AppError } from "@solid-memo/domain/appError";
import { shown } from "@solid-memo/domain/langText";
import { problem, type ReleaseProblem } from "@solid-memo/domain/release/problems";
import { moved } from "@solid-memo/domain/release/releaseToDraft";
import { ALL_SHAPES } from "@solid-memo/vocab/descriptors.generated";
import { LATEST_VERSION } from "@solid-memo/vocab/types.generated";
import type { ProfileName } from "@solid-memo/shacl/profiles";
import { getSolidDatasetLinear } from "./linearDataset";
import { datasetOf, draftQuads, quadOf, quadsOf, termOf } from "./mappers/releaseDraftMapper";
import { releaseQuadsOf } from "./solidReleaseDraftRepository";

export interface ShaclShapeValidatorDeps {
  /** Fetches pod documents (authenticated). */
  fetch: typeof globalThis.fetch;
  /** Fetches the shape documents, the reference data, the profiles, a library's index and a release checked on its own, all public (plain). */
  shapesFetch: typeof globalThis.fetch;
  /** Where the shapes are published (SHAPES_BASE). */
  shapesBaseUrl: string;
  /** Where the vocabulary is published (VOCAB_BASE), the reference data with it. */
  vocabBaseUrl: string;
  /** Where the site publishes the vendored profiles. */
  vendorBaseUrl: string;
  /**
   * Loads the engine module. A dynamic import by default, so the SHACL
   * library ships in its own chunk and is fetched only when a validation
   * is asked for.
   */
  loadEngine?: () => Promise<{
    createEngine(shapes: DatasetCore): ShapeEngine;
    mergeDatasets(...parts: Iterable<Quad>[]): DatasetCore;
    mapIris(data: DatasetCore, map: (iri: string) => string): DatasetCore;
  }>;
  loader?: ShapeLoader;
}

/**
 * The ShapeValidator, with the check of subjects before they are written
 * (WriteCheck), and `over`: the same validator, its shapes and engines,
 * over the documents of another fetch (a Studio trial's pod, say).
 */
export type ShaclShapeValidator = ShapeValidator & {
  checkSubjects: WriteCheck;
  over(fetch: typeof globalThis.fetch): ShaclShapeValidator;
};

/** The classes the DCAT-AP profile has something to say about. */
const PROFILED_CLASSES = [
  "http://www.w3.org/ns/dcat#Catalog",
  "http://www.w3.org/ns/dcat#Dataset",
  "http://www.w3.org/ns/dcat#Distribution",
  "http://xmlns.com/foaf/0.1/Agent",
];

/** The links by which a catalogue or deck group lists its members. */
const MEMBER_LINKS: readonly (string | undefined)[] = ["http://www.w3.org/ns/dcat#dataset", "http://www.w3.org/ns/dcat#catalog"];

/**
 * DCAT-AP's class check on a member a catalogue or deck group lists from
 * another document (a dataset another app added): the member's class is
 * stated where it is described, which this document cannot show, so the
 * check says nothing about it. A member of the same document is still
 * held to its class.
 */
function isMemberElsewhere(focusNode: string, violation: Violation): boolean {
  return (
    violation.constraint === "Class" &&
    MEMBER_LINKS.includes(violation.path) &&
    violation.value !== undefined &&
    violation.value.split("#")[0] !== focusNode.split("#")[0]
  );
}

/**
 * A result about a catalogue's or deck group's link to a member another
 * app wrote: a subject of the document that is not Solid Memo's, or a
 * blank node, which Solid Memo never writes. The member is that app's
 * data, and what is wrong with the link is no fault of the catalogue's.
 */
function isForeignMember(
  quads: readonly Quad[],
  foreign: ReadonlySet<string>,
  focusNode: string,
  violation: Violation,
): boolean {
  const { path, value } = violation;
  if (!MEMBER_LINKS.includes(path) || value === undefined) return false;
  return (
    foreign.has(value) ||
    quads.some(
      (q) =>
        q.subject.value === focusNode &&
        q.predicate.value === path &&
        q.object.termType === "BlankNode" &&
        q.object.value === value,
    )
  );
}

/**
 * What is wrong with another app's data is reported, never acted on: a
 * warning, so it sets no deck aside and blocks no instance.
 */
function asWarning(violation: Violation): Violation {
  return violation.severity === "violation" ? { ...violation, severity: "warning" } : violation;
}

/**
 * The ShapeValidator port over the SHACL engine: every subject of a
 * document with a Solid Memo class is checked against the shape of its
 * class and stored version, chosen exactly as the app chooses it when
 * reading (registry.pickShape); a document with DCAT or FOAF subjects is
 * also checked against the DCAT-AP profile, with the reference data
 * beside it (see docs/validation.md). A subject another app wrote is
 * checked too, but marked `foreign`, its results warnings, and so are
 * the results about a catalogue's link to a member another app wrote.
 */
export function createShaclShapeValidator({
  fetch,
  shapesFetch,
  shapesBaseUrl,
  vocabBaseUrl,
  vendorBaseUrl,
  loadEngine = () => import("@solid-memo/shacl/engine"),
  loader = createShapeLoader({ fetch: shapesFetch, shapesBaseUrl, vocabBaseUrl, vendorBaseUrl }),
}: ShaclShapeValidatorDeps): ShaclShapeValidator {
  const engines = new Map<string, Promise<ShapeEngine>>();

  function engineFor(descriptor: ShapeDescriptor): Promise<ShapeEngine> {
    let engine = engines.get(descriptor.shapeDocument);
    if (engine === undefined) {
      engine = Promise.all([loadEngine(), loader.load(descriptor)]).then(
        ([{ createEngine }, shapes]) => createEngine(shapes),
      );
      engines.set(descriptor.shapeDocument, engine);
    }
    return engine;
  }

  const profileEngines = new Map<ProfileName, Promise<{ engine: ShapeEngine; reference: DatasetCore[] }>>();
  /** A profile's engine (its SHACL Core shapes), with the reference data its checks look in: made once. */
  function profile(name: ProfileName) {
    let made = profileEngines.get(name);
    if (made === undefined) {
      made = Promise.all([loadEngine(), loader.loadProfile(name), loader.loadReferenceData()]).then(
        ([{ createEngine, mergeDatasets }, shapes, reference]) => ({
          engine: createEngine(mergeDatasets(coreOnly(shapes.flatMap((d) => [...(d as Iterable<Quad>)])))),
          reference,
        }),
      );
      profileEngines.set(name, made);
    }
    return made;
  }
  const dcatAp = () => profile("dcat-ap");

  /** The DCAT-AP violations of each subject of the document, by subject. */
  async function profileViolations(data: DatasetCore): Promise<Map<string, Violation[]>> {
    const [{ engine, reference }, { mergeDatasets }] = await Promise.all([dcatAp(), loadEngine()]);
    const subjects = new Set([...(data as Iterable<Quad>)].map((q) => q.subject.value));
    const bySubject = new Map<string, Violation[]>();
    for (const { focusNode, ...violation } of await engine.validate(
      mergeDatasets(data as Iterable<Quad>, ...(reference as Iterable<Quad>[])),
    )) {
      if (violation.severity !== "violation" || !subjects.has(focusNode) || isMemberElsewhere(focusNode, violation)) continue;
      bySubject.set(focusNode, [...(bySubject.get(focusNode) ?? []), { ...violation, profile: "dcat-ap" }]);
    }
    return bySubject;
  }

  /**
   * Every result about a subject: its own shape's, picked for where the
   * write goes, and DCAT-AP's for a profiled document in an instance. A
   * draft is not held to DCAT-AP yet: it may lack what a published
   * dataset needs (a description), which the release check asks of it.
   */
  async function subjectViolations(dataset: SolidDataset, subjects: readonly string[], context: WriteContext): Promise<string[]> {
    const data = toRdfJsDataset(dataset);
    const quads = [...(data as Iterable<Quad>)];
    const foreign = foreignSubjects(dataset);
    const counts = (subject: string, v: Violation) =>
      v.severity === "violation" && !isForeignMember(quads, foreign, subject, v);
    const problems: string[] = [];
    const describe = (subject: string, v: Violation) =>
      `<${subject}>${v.path === undefined ? "" : ` (${v.path})`}: ${v.profile === "dcat-ap" ? "DCAT-AP: " : ""}${shown(v.message)}`;
    for (const subject of subjects) {
      const thing = getThing(dataset, subject);
      if (thing === null) continue;
      const pick = pickShape(getUrlAll(thing, RDF.type), storedVersionOf(thing), context);
      if (pick.kind !== "shape") continue;
      const engine = await engineFor(pick.descriptor);
      for (const v of await engine.validateNode(data, subject, pick.descriptor.shapeIri)) {
        if (counts(subject, v)) problems.push(describe(subject, v));
      }
    }
    const profiled = context === "pod" && subjects.some((subject) => {
      const thing = getThing(dataset, subject);
      return thing !== null && getUrlAll(thing, RDF.type).some((type) => PROFILED_CLASSES.includes(type));
    });
    if (profiled) {
      for (const [subject, violations] of await profileViolations(data)) {
        if (!subjects.includes(subject)) continue;
        problems.push(...violations.filter((v) => counts(subject, v)).map((v) => describe(subject, v)));
      }
    }
    return problems;
  }

  /**
   * The report on a document: each subject checked against its shape,
   * picked for where the document is (an instance's, or a draft's), and
   * the DCAT-AP profile where it applies, which a draft is not held to yet.
   */
  async function reportOf(url: string, dataset: SolidDataset | null, context: DocumentContext): Promise<DocumentReport> {
    if (dataset === null) return { url, status: "missing", subjects: [] };
    const data = toRdfJsDataset(dataset);
    const quads = [...(data as Iterable<Quad>)];
    const subjects: SubjectReport[] = [];
    const foreign = foreignSubjects(dataset);
    /** A subject's results: all warnings for another app's subject, and for its links to another app's members. */
    const attributed = (subject: string, violations: Violation[]) =>
      violations.map((v) => (foreign.has(subject) || isForeignMember(quads, foreign, subject, v) ? asWarning(v) : v));
    for (const thing of getThingAll(dataset)) {
      const subject = asUrl(thing);
      const version = storedVersionOf(thing);
      const pick = pickShape(getUrlAll(thing, RDF.type), version, context);
      if (pick.kind === "untyped") {
        subjects.push({ url: subject, status: "untyped" });
        continue;
      }
      if (pick.kind === "unknown-version") {
        subjects.push({
          url: subject,
          status: "newer",
          shape: pick.shape,
          version: pick.version,
          latest: pick.latest,
        });
        continue;
      }
      const engine = await engineFor(pick.descriptor);
      const violations = await engine.validateNode(data, subject, pick.descriptor.shapeIri);
      subjects.push({
        url: subject,
        status: "checked",
        shape: pick.descriptor.shape,
        version: pick.descriptor.version,
        violations: attributed(subject, violations),
        ...(foreign.has(subject) && { foreign: true }),
      });
    }
    const profiled =
      context === "pod" &&
      getThingAll(dataset).some((thing) => getUrlAll(thing, RDF.type).some((type) => PROFILED_CLASSES.includes(type)));
    if (profiled) {
      for (const [subject, found] of await profileViolations(data)) {
        const index = subjects.findIndex((s) => s.url === subject);
        const report = subjects[index];
        const violations = attributed(subject, found);
        // Every subject already has a report: newer data is left alone,
        // an untyped subject becomes a profiled one.
        if (report?.status === "checked") report.violations.push(...violations);
        else if (report?.status === "untyped") {
          subjects[index] = { url: subject, status: "profiled", violations, ...(foreign.has(subject) && { foreign: true }) };
        }
      }
    }
    return { url, status: "checked", subjects };
  }

  /** The validator over the pod documents `podFetch` reads. */
  const over = (podFetch: typeof globalThis.fetch): ShaclShapeValidator => ({
    over,

    async checkSubjects(dataset, subjects, context) {
      const problems = await subjectViolations(dataset, subjects, context);
      if (problems.length > 0) {
        throw new AppError("dataNotConforming", { problems: problems.join("\n  ") });
      }
    },

    async validateDocument(url, context = "pod"): Promise<DocumentReport> {
      // A release is public: read as anyone reads it, as a library's index is, with no login sent to its host.
      return reportOf(url, await getSolidDatasetOrNull(url, context === "library" ? shapesFetch : podFetch), context);
    },

    async validateDocumentSince(url, version, context = "pod") {
      const since = await readSince(url, version, podFetch);
      return since.unchanged ? since : { ...since, value: await reportOf(url, since.value, context) };
    },

    async validateRelease(draft, asUrl, indexUrl) {
      const { mergeDatasets, mapIris } = await loadEngine();
      // The release as assembled at the draft's own address, then every IRI moved where it is published.
      // Quads as the engine reads them (a dataset's: terms that compare), not the plain data a draft's are.
      const assembled = quadsOf(datasetOf(releaseQuadsOf(draftQuads(draft), draft.url, new Date().toISOString())));
      const release = mapIris(mergeDatasets(assembled), (iri) => moved(iri, draft.url, asUrl));
      const quads = [...(release as Iterable<Quad>)];
      const back = (iri: string) => moved(iri, asUrl, draft.url);
      const problems: ReleaseProblem[] = [];
      const shapeProblem = (focus: string, v: Violation, severity: "error" | "warning") =>
        problem(
          back(focus),
          {
            code: "shape",
            params: {
              message: v.message,
              constraint: v.constraint,
              ...(v.builtIn === true ? { builtIn: true as const } : {}),
              ...(v.value === undefined ? {} : { value: back(v.value) }),
              ...(v.profile === undefined ? {} : { profile: v.profile }),
            },
          },
          { severity, ...(v.path === undefined ? {} : { field: v.path }) },
        );

      // Each subject of a Solid Memo class, or of another class a shape describes, against its library shape.
      // Each subject's statements, so a release of thousands of cards is read in one pass.
      const bySubject = new Map<string, Quad[]>();
      for (const q of quads) {
        const own = bySubject.get(q.subject.value);
        if (own === undefined) bySubject.set(q.subject.value, [q]);
        else own.push(q);
      }
      for (const subject of shapedSubjectsOf(quads)) {
        const own = bySubject.get(subject)!;
        const types = own.filter((q) => q.predicate.value === RDF.type).map((q) => q.object.value);
        const version = Number(own.find((q) => q.predicate.value === SM_FORMAT_VERSION)?.object.value ?? "1");
        const pick = pickShape(types, version, "library");
        if (pick.kind !== "shape") {
          problems.push(problem(back(subject), { code: "unshaped", params: {} }));
          continue;
        }
        const engine = await engineFor(pick.descriptor);
        for (const v of await engine.validateNode(release, subject, pick.descriptor.shapeIri)) {
          problems.push(shapeProblem(subject, v, v.severity === "violation" ? "error" : "warning"));
        }
      }

      // The profiles, over the release with the reference data and, for a library, its index; their violations of the release's subjects.
      // In a pod nothing else is read: a release is whole on its own, its publisher and series described in it (docs/deck-library.md).
      const index = indexUrl === undefined ? [] : withSeriesEntry(quadsOf(await getSolidDatasetLinear(indexUrl, { fetch: shapesFetch })), quads, asUrl, indexUrl);
      const subjects = new Set(quads.map((q) => q.subject.value));
      for (const [name, beside] of [["dcat-ap", index], ["skos", []]] as const) {
        const { engine, reference } = await profile(name);
        for (const { focusNode, ...v } of await engine.validate(mergeDatasets(quads, beside, ...(reference as Iterable<Quad>[])))) {
          if (v.severity !== "violation" || !subjects.has(focusNode)) continue;
          problems.push(shapeProblem(focusNode, { ...v, profile: name }, "error"));
        }
      }
      // A shape may say the same twice (a count, and a count of English text): once.
      const seen = new Set<string>();
      return problems.filter((one) => {
        const key = JSON.stringify(one);
        return !seen.has(key) && seen.add(key) !== undefined;
      });
    },
  });
  return over(fetch);
}

const SM_FORMAT_VERSION = `${SM_NS}formatVersion`;
const DCAT_NS = "http://www.w3.org/ns/dcat#";
const XSD_INTEGER = "http://www.w3.org/2001/XMLSchema#integer";

/** The classes Solid Memo's shapes are picked by: its own, and the DCAT and FOAF ones it writes. */
const SHAPED_CLASSES = new Set(ALL_SHAPES.map((d) => d.targetClass));

/**
 * The subjects of a release a shape is picked for, as the library's
 * command picks them: one with a Solid Memo type, or of a class a shape
 * describes (an agent, a distribution, a series).
 */
function shapedSubjectsOf(quads: readonly Quad[]): string[] {
  return [
    ...new Set(
      quads
        .filter((q) => q.predicate.value === RDF.type && (q.object.value.startsWith(SM_NS) || SHAPED_CLASSES.has(q.object.value)))
        .map((q) => q.subject.value),
    ),
  ];
}

/**
 * A library's index with the release `asUrl` in it, as the index the
 * library's command writes would have it (docs/deck-library.md): the
 * series the release names, when the release does not describe it
 * itself, one of its versions; described as a new deck's, from the
 * release, when the index lists it not yet.
 */
function withSeriesEntry(index: readonly Quad[], release: readonly Quad[], asUrl: string, indexUrl: string): Quad[] {
  const series = release.find((q) => q.subject.value === asUrl && q.predicate.value === `${DCAT_NS}inSeries`)?.object.value;
  if (series === undefined || release.some((q) => q.subject.value === series)) return [...index];
  const link = (subject: string, predicate: string, value: string) => quadOf(subject, predicate, { kind: "iri", value });
  const added = [link(series, `${DCAT_NS}hasVersion`, asUrl)];
  if (!index.some((q) => q.subject.value === series)) {
    const copied = ["http://purl.org/dc/terms/title", "http://purl.org/dc/terms/description", "http://purl.org/dc/terms/publisher", `${DCAT_NS}theme`, `${DCAT_NS}keyword`];
    added.push(
      link(indexUrl, `${DCAT_NS}dataset`, series),
      link(series, RDF.type, `${DCAT_NS}DatasetSeries`),
      link(series, RDF.type, `${DCAT_NS}Dataset`),
      quadOf(series, SM_FORMAT_VERSION, { kind: "literal", value: String(LATEST_VERSION.libraryDeckSeries), language: "", datatype: XSD_INTEGER }),
      ...release.filter((q) => q.subject.value === asUrl && copied.includes(q.predicate.value)).map((q) => quadOf(series, q.predicate.value, termOf(q.object))),
      link(series, `${DCAT_NS}first`, asUrl),
      link(series, `${DCAT_NS}last`, asUrl),
      link(series, `${DCAT_NS}hasCurrentVersion`, asUrl),
    );
  }
  return quadsOf(datasetOf([...index, ...added]));
}
