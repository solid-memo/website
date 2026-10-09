import {
  asUrl,
  getThing,
  getThingAll,
  getUrlAll,
  toRdfJsDataset,
  type SolidDataset,
} from "@inrupt/solid-client";
import type { DatasetCore, Quad } from "@rdfjs/types";
import type { ShapeValidator } from "@solid-memo/application/ports";
import type { DocumentReport, SubjectReport, Violation } from "@solid-memo/domain/validation";
import { getSolidDatasetOrNull } from "./datasets";
import { readSince } from "./readSince";
import { storedVersionOf } from "./records";
import type { WriteCheck } from "./writeCheck";
import { RDF } from "./vocab";
import type { ShapeEngine } from "@solid-memo/shacl/engine";
import { coreOnly } from "@solid-memo/shacl/profiles";
import { pickShape } from "@solid-memo/shacl/registry";
import type { ShapeDescriptor } from "@solid-memo/vocab/shapeDescriptor";
import { createShapeLoader, type ShapeLoader } from "@solid-memo/shacl/shapeLoader";
import { AppError } from "@solid-memo/domain/appError";
import { shown } from "@solid-memo/domain/langText";

export interface ShaclShapeValidatorDeps {
  /** Fetches pod documents (authenticated). */
  fetch: typeof globalThis.fetch;
  /** Fetches the shape documents, the reference data and the profiles, all public (plain). */
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
  }>;
  loader?: ShapeLoader;
}

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
 * The ShapeValidator port over the SHACL engine: every subject of a
 * document with a Solid Memo class is checked against the shape of its
 * class and stored version, chosen exactly as the app chooses it when
 * reading (registry.pickShape); a document with DCAT or FOAF subjects is
 * also checked against the DCAT-AP profile, with the reference data
 * beside it (see docs/validation.md).
 */
export function createShaclShapeValidator({
  fetch,
  shapesFetch,
  shapesBaseUrl,
  vocabBaseUrl,
  vendorBaseUrl,
  loadEngine = () => import("@solid-memo/shacl/engine"),
  loader = createShapeLoader({ fetch: shapesFetch, shapesBaseUrl, vocabBaseUrl, vendorBaseUrl }),
}: ShaclShapeValidatorDeps): ShapeValidator & { checkSubjects: WriteCheck } {
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

  let profileEngine: Promise<{ engine: ShapeEngine; reference: DatasetCore[] }> | undefined;
  function dcatAp() {
    profileEngine ??= Promise.all([
      loadEngine(),
      loader.loadProfile("dcat-ap"),
      loader.loadReferenceData(),
    ]).then(([{ createEngine, mergeDatasets }, shapes, reference]) => ({
      engine: createEngine(mergeDatasets(coreOnly(shapes.flatMap((d) => [...(d as Iterable<Quad>)])))),
      reference,
    }));
    return profileEngine;
  }

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

  /** Every result about a subject: its own shape's, and DCAT-AP's for a profiled document. */
  async function subjectViolations(dataset: SolidDataset, subjects: readonly string[]): Promise<string[]> {
    const data = toRdfJsDataset(dataset);
    const problems: string[] = [];
    const describe = (subject: string, v: Violation) =>
      `<${subject}>${v.path === undefined ? "" : ` (${v.path})`}: ${v.profile === "dcat-ap" ? "DCAT-AP: " : ""}${shown(v.message)}`;
    for (const subject of subjects) {
      const thing = getThing(dataset, subject);
      if (thing === null) continue;
      const pick = pickShape(getUrlAll(thing, RDF.type), storedVersionOf(thing), "pod");
      if (pick.kind !== "shape") continue;
      const engine = await engineFor(pick.descriptor);
      for (const v of await engine.validateNode(data, subject, pick.descriptor.shapeIri)) {
        if (v.severity === "violation") problems.push(describe(subject, v));
      }
    }
    const profiled = subjects.some((subject) => {
      const thing = getThing(dataset, subject);
      return thing !== null && getUrlAll(thing, RDF.type).some((type) => PROFILED_CLASSES.includes(type));
    });
    if (profiled) {
      for (const [subject, violations] of await profileViolations(data)) {
        if (!subjects.includes(subject)) continue;
        problems.push(...violations.map((v) => describe(subject, v)));
      }
    }
    return problems;
  }

  /** The report on a document: each subject checked against its shape, the DCAT-AP profile where it applies. */
  async function reportOf(url: string, dataset: SolidDataset | null): Promise<DocumentReport> {
    if (dataset === null) return { url, status: "missing", subjects: [] };
    const data = toRdfJsDataset(dataset);
    const subjects: SubjectReport[] = [];
    for (const thing of getThingAll(dataset)) {
      const subject = asUrl(thing);
      const version = storedVersionOf(thing);
      const pick = pickShape(getUrlAll(thing, RDF.type), version, "pod");
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
      subjects.push({
        url: subject,
        status: "checked",
        shape: pick.descriptor.shape,
        version: pick.descriptor.version,
        violations: await engine.validateNode(data, subject, pick.descriptor.shapeIri),
      });
    }
    const profiled = getThingAll(dataset).some((thing) =>
      getUrlAll(thing, RDF.type).some((type) => PROFILED_CLASSES.includes(type)),
    );
    if (profiled) {
      for (const [subject, violations] of await profileViolations(data)) {
        const index = subjects.findIndex((s) => s.url === subject);
        const report = subjects[index];
        // Every subject already has a report: newer data is left alone,
        // an untyped subject becomes a profiled one.
        if (report?.status === "checked") report.violations.push(...violations);
        else if (report?.status === "untyped") subjects[index] = { url: subject, status: "profiled", violations };
      }
    }
    return { url, status: "checked", subjects };
  }

  return {
    async checkSubjects(dataset, subjects) {
      const problems = await subjectViolations(dataset, subjects);
      if (problems.length > 0) {
        throw new AppError("dataNotConforming", { problems: problems.join("\n  ") });
      }
    },

    async validateDocument(url): Promise<DocumentReport> {
      return reportOf(url, await getSolidDatasetOrNull(url, fetch));
    },

    async validateDocumentSince(url, version) {
      const since = await readSince(url, version, fetch);
      return since.unchanged ? since : { ...since, value: await reportOf(url, since.value) };
    },
  };
}
