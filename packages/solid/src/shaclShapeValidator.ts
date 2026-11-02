// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  type Dataset,
  type Subject,
  asUrl,
  datasetFromQuads,
  getThing,
  getThingAll,
  getUrlAll,
  toRdfJsDataset,
} from "./client/rdf";
import type { DatasetCore, Quad } from "@rdfjs/types";
import type { DocumentContext, ShapeValidator } from "@solid-memo/application/ports";
import type { DocumentReport, SubjectReport, Violation } from "@solid-memo/domain/validation";
import {
  instanceUrlOfDeck,
  isDeckDocumentAddress,
  isSameUrl,
} from "@solid-memo/domain/instanceLayout";
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";
import { getSolidDatasetOrNull } from "./datasets";
import { readSince } from "./readSince";
import { isUnreadableDatetime, storedVersionOf, unreadableDatetimes } from "./records";
import type { WriteCheck, WriteContext } from "./writeCheck";
import { foreignSubjects, isDeckBackLink } from "./ownership";
import { RDF, SM, SM_NS } from "./vocab";
import type { ShapeEngine } from "@solid-memo/shacl/engine";
import { coreOnly } from "@solid-memo/shacl/profiles";
import { pickShapes } from "@solid-memo/shacl/registry";
import type { ShapeDescriptor } from "@solid-memo/vocab/shapeDescriptor";
import { createShapeLoader, type ShapeLoader } from "@solid-memo/shacl/shapeLoader";
import { AppError } from "@solid-memo/domain/appError";
import { shown } from "@solid-memo/domain/langText";
import { problem, type ReleaseProblem } from "@solid-memo/domain/release/problems";
import { moved } from "@solid-memo/domain/release/releaseToDraft";
import { ALL_SHAPES } from "@solid-memo/vocab/descriptors.generated";
import { LATEST_VERSION, type ShapeName } from "@solid-memo/vocab/types.generated";
import type { ProfileName } from "@solid-memo/shacl/profiles";
import { getSolidDatasetLinear } from "./client/resources";
import { draftQuads, quadOf, quadsOf, termOf } from "./mappers/releaseDraftMapper";
import { releaseQuadsOf } from "./solidReleaseDraftRepository";

/** The IRIs a subject has as values of a predicate, among its own quads: what pickShapes asks of a subject. */
function iriValuesIn(own: readonly Quad[]): (predicate: string) => string[] {
  return (predicate) =>
    own
      .filter((q) => q.predicate.value === predicate && q.object.termType === "NamedNode")
      .map((q) => q.object.value);
}

export interface ShaclShapeValidatorDeps {
  /** Fetches pod documents (authenticated). */
  fetch: typeof globalThis.fetch;
  /** Fetches the shape documents, the reference data, the profiles and a library's index, all public (plain). */
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
  /** The report on a document already read, as validateDocument makes it of one it reads. */
  validateDataset(url: string, dataset: Dataset, context: DocumentContext): Promise<DocumentReport>;
  over(fetch: typeof globalThis.fetch): ShaclShapeValidator;
};

/** The classes the DCAT-AP profile has something to say about. */
const PROFILED_CLASSES = [
  "http://www.w3.org/ns/dcat#Catalog",
  "http://www.w3.org/ns/dcat#Dataset",
  "http://www.w3.org/ns/dcat#Distribution",
  "http://xmlns.com/foaf/0.1/Agent",
];

/** The links by which a catalog or deck group lists its members. */
const MEMBER_LINKS: readonly (string | undefined)[] = [
  "http://www.w3.org/ns/dcat#dataset",
  "http://www.w3.org/ns/dcat#catalog",
];

/**
 * DCAT-AP's class check on a member a catalog or deck group lists from
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
 * A document's links from a catalog or deck group to a blank node, each
 * as the key memberKey makes of it: gathered once per check, so that
 * isForeignMember looks a result's value up instead of going through
 * the document for each result.
 */
function blankMembers(quads: Iterable<Quad>): Set<string> {
  const links = new Set<string>();
  for (const q of quads) {
    if (q.object.termType === "BlankNode" && MEMBER_LINKS.includes(q.predicate.value)) {
      links.add(memberKey(q.subject.value, q.predicate.value, q.object.value));
    }
  }
  return links;
}

const memberKey = (subject: string, path: string | undefined, value: string) =>
  JSON.stringify([subject, path, value]);

/**
 * A result about a catalog's or deck group's link to a member another
 * app wrote: a subject of the document that is not Solid Memo's, or a
 * blank node (one of `blank`, blankMembers), which Solid Memo never
 * writes. The member is that app's data, and what is wrong with the
 * link is no fault of the catalog's.
 */
function isForeignMember(
  blank: ReadonlySet<string>,
  foreign: ReadonlySet<string>,
  focusNode: string,
  violation: Violation,
): boolean {
  const { path, value } = violation;
  if (!MEMBER_LINKS.includes(path) || value === undefined) return false;
  return foreign.has(value) || blank.has(memberKey(focusNode, path, value));
}

/**
 * What a deck entry of the catalog at `documentUrl` says that makes it
 * a deck Solid Memo cannot use (isDeckInPlace): an entry that is another
 * document's subject, a cards or reviews document at an address no
 * deck's may be (isDeckDocumentAddress: one a request or a server would
 * take elsewhere, another resource's access control or metadata, one of
 * the instance's own documents). Where the documents are is otherwise
 * free. The app leaves such a deck out (mappers/deckMapper.ts toDecks),
 * so the check names it, and a repair may remove the entry, and nothing
 * else.
 */
function placeViolations(thing: Subject, documentUrl: string): Violation[] {
  const instance = instanceUrlOfDeck(documentUrl);
  const misplaced = (value: string, path?: string): Violation => ({
    ...(path === undefined ? {} : { path }),
    message: { en: DECK_PLACE },
    builtIn: true,
    value,
    severity: "violation",
    constraint: "DeckPlace",
  });
  const subject = asUrl(thing);
  return [
    ...(isSameUrl(documentUrlOf(subject), documentUrl) ? [] : [misplaced(subject)]),
    ...[SM.cardsDocument, SM.reviewsDocument].flatMap((path) =>
      getUrlAll(thing, path)
        .filter((url) => !isDeckDocumentAddress(instance, url))
        .map((url) => misplaced(url, path)),
    ),
  ];
}

const DECK_PLACE =
  "This deck's entry is not in its instance's catalog, or it names a document at an address no deck's documents may have, such as another resource's access control or one of the instance's own documents. Solid Memo does not use it.";

/**
 * The dates of a subject the app cannot read: each value of one of its
 * shape's date fields that is an xsd:dateTime readDatetime reads as no
 * date (one past what a JavaScript date holds, or a lexical form it
 * does not read). SHACL may find such a value valid, and the app reads it as
 * absent, so a subject that needs it does not fit its shape. A value
 * the shape's own check already names (one that is no xsd:dateTime at
 * all) is not named again. Wherever the subject is (an instance's, a
 * release's or a draft's), the app reads its dates the same way.
 */
function dateViolations(
  descriptor: ShapeDescriptor,
  unreadable: (predicate: string) => readonly string[],
  found: readonly Violation[],
): Violation[] {
  return descriptor.fields
    .filter((field) => field.kind === "dateTime")
    .flatMap(({ predicate }) => {
      const reported = new Set(found.filter((v) => v.path === predicate).map((v) => v.value));
      return unreadable(predicate)
        .filter((value) => !reported.has(value))
        .map(
          (value): Violation => ({
            path: predicate,
            message: { en: DATE_TIME_RANGE },
            builtIn: true,
            value,
            severity: "violation",
            constraint: "DateTimeRange",
          }),
        );
    });
}

/**
 * A subject stamped with a format version below 1, which no shape has:
 * the app reads it as one that does not fit (records.ts readVersioned),
 * so the check names it as such, not as a newer format left alone.
 */
function formatVersionViolation(version: number): Violation {
  return {
    path: SM.formatVersion,
    message: { en: FORMAT_VERSION_RANGE },
    builtIn: true,
    value: String(version),
    severity: "violation",
    constraint: "FormatVersionRange",
  };
}

/** Each subject's statements, gathered in one pass. */
function statementsBySubject(quads: readonly Quad[]): Map<string, Quad[]> {
  const bySubject = new Map<string, Quad[]>();
  for (const q of quads) {
    const own = bySubject.get(q.subject.value);
    if (own === undefined) bySubject.set(q.subject.value, [q]);
    else own.push(q);
  }
  return bySubject;
}

/**
 * A subject of a class whose shapes have no format of the subject's
 * version, while another of its classes has: the subject is checked as
 * the other, and this class is named, so a second class never stands in
 * for the shape of the first.
 */
function classVersionViolation(shape: ShapeName, version: number): Violation {
  return {
    path: SM.formatVersion,
    message: { en: `${FORMAT_VERSION_CLASS} (${shape})` },
    builtIn: true,
    value: String(version),
    severity: "violation",
    constraint: "FormatVersionClass",
  };
}

const FORMAT_VERSION_CLASS =
  "This subject has more than one Solid Memo class, and one of them has no format of this version, so Solid Memo can't read the subject as that class";

const FORMAT_VERSION_RANGE =
  "No format of Solid Memo has this version: it is below 1, so Solid Memo can't read the subject.";

const DATE_TIME_RANGE =
  "Solid Memo can't read this date: it is too far in the future or the past, or longer than a date-time is, so it reads as no date.";

/**
 * What is wrong with another app's data is reported, never acted on: a
 * warning, so it sets no deck aside and blocks no instance.
 */
function asWarning(violation: Violation): Violation {
  return violation.severity === "violation" ? { ...violation, severity: "warning" } : violation;
}

/**
 * A document's report with DCAT-AP's results on its subjects added, each
 * found by its address: a checked subject's added to its own, an untyped
 * subject's making it a profiled one. Newer data is left alone, and a
 * blank node has no report of its own, nor do its results.
 */
function withProfiled(
  subjects: SubjectReport[],
  bySubject: ReadonlyMap<string, Violation[]>,
  attributed: (subject: string, violations: Violation[]) => Violation[],
  foreign: ReadonlySet<string>,
): void {
  const indexOf = new Map(subjects.map((s, index) => [s.url, index]));
  for (const [subject, found] of bySubject) {
    const index = indexOf.get(subject);
    if (index === undefined) continue;
    const report = subjects[index];
    const violations = attributed(subject, found);
    if (report?.status === "checked") {
      for (const violation of violations) report.violations.push(violation);
    } else if (report?.status === "untyped") {
      subjects[index] = {
        url: subject,
        status: "profiled",
        violations,
        ...(foreign.has(subject) && { foreign: true }),
      };
    }
  }
}

/**
 * The ShapeValidator port over the SHACL engine: every subject of a
 * document with a Solid Memo class is checked against the shape of each
 * of its classes at its stored version, chosen exactly as the app chooses
 * them when reading (registry.pickShapes); a document with DCAT or FOAF
 * subjects is also checked against the DCAT-AP profile, with the
 * reference data beside it (see docs/validation.md). A subject another app wrote is
 * checked too, but marked `foreign`, its results warnings, and so are
 * the results about a catalog's link to a member another app wrote.
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

  /** A subject's results against the shape of each of its classes, with the dates the app can't read that each shape names. */
  async function classViolations(
    data: DatasetCore,
    subject: string,
    descriptors: readonly ShapeDescriptor[],
    unreadable: (predicate: string) => readonly string[],
  ): Promise<Violation[]> {
    const violations: Violation[] = [];
    for (const descriptor of descriptors) {
      const engine = await engineFor(descriptor);
      const found = await engine.validateNode(data, subject, descriptor.shapeIri);
      violations.push(...found, ...dateViolations(descriptor, unreadable, found));
    }
    return violations;
  }

  /**
   * A release's subject, of its own statements, against the library shape
   * of each of its classes (a subject of two is read as both), and whether
   * a class of it has none at its version: one the library reads no
   * subject of.
   */
  async function releaseSubjectViolations(
    release: DatasetCore,
    subject: string,
    own: readonly Quad[],
  ): Promise<{ unshaped: boolean; violations: Violation[] }> {
    const types = own.filter((q) => q.predicate.value === RDF.type).map((q) => q.object.value);
    const version = Number(
      own.find((q) => q.predicate.value === SM_FORMAT_VERSION)?.object.value ?? "1",
    );
    const pick = pickShapes(types, version, "library", iriValuesIn(own));
    if (pick.kind !== "shapes") return { unshaped: true, violations: [] };
    // A date the library's readers cannot read is an error of the release, as one the shape names is.
    const unreadable = (predicate: string) =>
      own
        .filter((q) => q.predicate.value === predicate && isUnreadableDatetime(q.object))
        .map((q) => q.object.value);
    return {
      unshaped: pick.unknown.length > 0,
      violations: await classViolations(release, subject, pick.descriptors, unreadable),
    };
  }

  const profileEngines = new Map<
    ProfileName,
    Promise<{ engine: ShapeEngine; reference: DatasetCore[] }>
  >();
  /** A profile's engine (its SHACL Core shapes), with the reference data its checks look in: made once. */
  function profile(name: ProfileName) {
    let made = profileEngines.get(name);
    if (made === undefined) {
      made = Promise.all([loadEngine(), loader.loadProfile(name), loader.loadReferenceData()]).then(
        ([{ createEngine, mergeDatasets }, shapes, reference]) => ({
          engine: createEngine(
            mergeDatasets(coreOnly(shapes.flatMap((d) => [...(d as Iterable<Quad>)]))),
          ),
          reference,
        }),
      );
      profileEngines.set(name, made);
    }
    return made;
  }
  const dcatAp = () => profile("dcat-ap");

  /**
   * The violations of a release's subjects by the profiles, over the
   * release with the reference data and, for a library, its index.
   */
  async function releaseProfileViolations(
    quads: Quad[],
    index: Quad[],
  ): Promise<{ focusNode: string; violation: Violation }[]> {
    const { mergeDatasets } = await loadEngine();
    const subjects = new Set(quads.map((q) => q.subject.value));
    const found: { focusNode: string; violation: Violation }[] = [];
    for (const [name, beside] of [
      ["dcat-ap", index],
      ["skos", []],
    ] as const) {
      const { engine, reference } = await profile(name);
      for (const { focusNode, ...v } of await engine.validate(
        mergeDatasets(quads, beside, ...(reference as Iterable<Quad>[])),
      )) {
        if (v.severity !== "violation" || !subjects.has(focusNode)) continue;
        found.push({ focusNode, violation: { ...v, profile: name } });
      }
    }
    return found;
  }

  /** The DCAT-AP violations of each subject of the document, by subject. */
  async function profileViolations(data: DatasetCore): Promise<Map<string, Violation[]>> {
    const [{ engine, reference }, { mergeDatasets }] = await Promise.all([dcatAp(), loadEngine()]);
    const subjects = new Set([...(data as Iterable<Quad>)].map((q) => q.subject.value));
    const bySubject = new Map<string, Violation[]>();
    for (const { focusNode, ...violation } of await engine.validate(
      mergeDatasets(data as Iterable<Quad>, ...(reference as Iterable<Quad>[])),
    )) {
      if (
        violation.severity !== "violation" ||
        !subjects.has(focusNode) ||
        isMemberElsewhere(focusNode, violation)
      )
        continue;
      const entry: Violation = { ...violation, profile: "dcat-ap" };
      const held = bySubject.get(focusNode);
      if (held === undefined) bySubject.set(focusNode, [entry]);
      else held.push(entry);
    }
    return bySubject;
  }

  /**
   * Every result about a subject: its own shape's, picked for where the
   * write goes, and DCAT-AP's for a profiled document in an instance. A
   * draft is not held to DCAT-AP yet: it may lack what a published
   * dataset needs (a description), which the release check asks of it.
   */
  async function subjectViolations(
    dataset: Dataset,
    subjects: readonly string[],
    context: WriteContext,
  ): Promise<string[]> {
    const data = toRdfJsDataset(dataset);
    const blank = blankMembers(data as Iterable<Quad>);
    const foreign = foreignSubjects(dataset);
    const counts = (subject: string, v: Violation) =>
      v.severity === "violation" && !isForeignMember(blank, foreign, subject, v);
    const problems: string[] = [];
    const describe = (subject: string, v: Violation) =>
      `<${subject}>${v.path === undefined ? "" : ` (${v.path})`}: ${v.profile === "dcat-ap" ? "DCAT-AP: " : ""}${shown(v.message)}`;
    /** A subject's results against its shape, picked for where the write goes: none when it has no shape. */
    const shapeViolations = async (subject: string): Promise<Violation[]> => {
      const thing = getThing(dataset, subject);
      if (thing === null) return [];
      const version = storedVersionOf(thing);
      const pick = pickShapes(getUrlAll(thing, RDF.type), version, context, (predicate) =>
        getUrlAll(thing, predicate),
      );
      if (pick.kind !== "shapes") return [];
      // The write check leaves dates to the readers: none is named beside the shape's results.
      const found = await classViolations(data, subject, pick.descriptors, () => []);
      return [...pick.unknown.map((shape) => classVersionViolation(shape, version)), ...found];
    };
    for (const subject of subjects) {
      for (const v of await shapeViolations(subject)) {
        if (counts(subject, v)) problems.push(describe(subject, v));
      }
    }
    const profiled =
      context === "pod" &&
      subjects.some((subject) => {
        const thing = getThing(dataset, subject);
        return (
          thing !== null &&
          getUrlAll(thing, RDF.type).some((type) => PROFILED_CLASSES.includes(type))
        );
      });
    if (profiled) {
      const asked = new Set(subjects);
      for (const [subject, violations] of await profileViolations(data)) {
        if (!asked.has(subject)) continue;
        for (const v of violations) if (counts(subject, v)) problems.push(describe(subject, v));
      }
    }
    return problems;
  }

  /**
   * The report on a document: each subject checked against its shape,
   * picked for where the document is (an instance's, or a draft's), and
   * the DCAT-AP profile where it applies, which a draft is not held to yet.
   */
  async function reportOf(
    url: string,
    dataset: Dataset | null,
    context: DocumentContext,
  ): Promise<DocumentReport> {
    if (dataset === null) return { url, status: "missing", subjects: [] };
    const data = toRdfJsDataset(dataset);
    const blank = blankMembers(data as Iterable<Quad>);
    const subjects: SubjectReport[] = [];
    const foreign = foreignSubjects(dataset);
    /** A subject's results: all warnings for another app's subject, and for its links to another app's members. */
    const attributed = (subject: string, violations: Violation[]) =>
      violations.map((v) =>
        foreign.has(subject) || isForeignMember(blank, foreign, subject, v) ? asWarning(v) : v,
      );
    /**
     * A subject's results against the shape of each of its classes, with
     * the dates the app can't read, each class with no format of the
     * subject's version named, and, for a deck in a pod, where it is.
     */
    const shapeViolations = async (
      thing: Subject,
      types: readonly string[],
      version: number,
      descriptors: readonly ShapeDescriptor[],
      unknown: readonly ShapeName[],
    ) => {
      const subject = asUrl(thing);
      const violations = [
        ...unknown.map((shape) => classVersionViolation(shape, version)),
        ...(await classViolations(data, subject, descriptors, (predicate) =>
          unreadableDatetimes(thing, predicate),
        )),
      ];
      if (context === "pod" && types.includes(SM.Deck))
        violations.push(...placeViolations(thing, url));
      return violations;
    };
    for (const thing of getThingAll(dataset)) {
      const subject = asUrl(thing);
      const version = storedVersionOf(thing);
      const types = getUrlAll(thing, RDF.type);
      const pick = pickShapes(types, version, context, (predicate) => getUrlAll(thing, predicate));
      if (pick.kind === "untyped") {
        // The document saying it is a deck's is Solid Memo's, and no stray.
        if (!isDeckBackLink(dataset, thing)) subjects.push({ url: subject, status: "untyped" });
        continue;
      }
      if (pick.kind === "unknown-version" && pick.version >= 1) {
        subjects.push({
          url: subject,
          status: "newer",
          shape: pick.shape,
          version: pick.version,
          latest: pick.latest,
        });
        continue;
      }
      // A version below 1, which no shape has, is read as a subject that does not fit (records.ts readVersioned).
      const checked =
        pick.kind === "shapes"
          ? {
              shape: pick.descriptors[0].shape,
              version,
              violations: await shapeViolations(
                thing,
                types,
                version,
                pick.descriptors,
                pick.unknown,
              ),
            }
          : {
              shape: pick.shape,
              version: pick.version,
              violations: [formatVersionViolation(pick.version)],
            };
      subjects.push({
        url: subject,
        status: "checked",
        ...checked,
        violations: attributed(subject, checked.violations),
        ...(foreign.has(subject) && { foreign: true }),
      });
    }
    const profiled =
      context === "pod" &&
      getThingAll(dataset).some((thing) =>
        getUrlAll(thing, RDF.type).some((type) => PROFILED_CLASSES.includes(type)),
      );
    if (profiled) withProfiled(subjects, await profileViolations(data), attributed, foreign);
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
      return reportOf(url, await getSolidDatasetOrNull(url, podFetch), context);
    },

    validateDataset: reportOf,

    async validateDocumentSince(url, version, context = "pod") {
      const since = await readSince(url, version, podFetch);
      return since.unchanged
        ? since
        : { ...since, value: await reportOf(url, since.value, context) };
    },

    async validateRelease(draft, asUrl, indexUrl) {
      const { mergeDatasets, mapIris } = await loadEngine();
      // The release as assembled at the draft's own address, then every IRI moved where it is published.
      // Quads as the engine reads them (a dataset's: terms that compare), not the plain data a draft's are.
      const assembled = quadsOf(
        datasetFromQuads(releaseQuadsOf(draftQuads(draft), draft.url, new Date().toISOString())),
      );
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
      const bySubject = statementsBySubject(quads);
      for (const subject of shapedSubjectsOf(quads)) {
        const { unshaped, violations } = await releaseSubjectViolations(
          release,
          subject,
          bySubject.get(subject)!,
        );
        if (unshaped) problems.push(problem(back(subject), { code: "unshaped", params: {} }));
        for (const v of violations) {
          problems.push(shapeProblem(subject, v, v.severity === "violation" ? "error" : "warning"));
        }
      }

      // The profiles, over the release with the reference data and, for a library, its index; their violations of the release's subjects.
      // In a pod nothing else is read: a release is whole on its own, its publisher and series described in it (docs/deck-library.md).
      const index =
        indexUrl === undefined
          ? []
          : withSeriesEntry(
              quadsOf(await getSolidDatasetLinear(indexUrl, { fetch: shapesFetch })),
              quads,
              asUrl,
              indexUrl,
            );
      for (const { focusNode, violation } of await releaseProfileViolations(quads, index)) {
        problems.push(shapeProblem(focusNode, violation, "error"));
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
        .filter(
          (q) =>
            q.predicate.value === RDF.type &&
            (q.object.value.startsWith(SM_NS) || SHAPED_CLASSES.has(q.object.value)),
        )
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
function withSeriesEntry(
  index: readonly Quad[],
  release: readonly Quad[],
  asUrl: string,
  indexUrl: string,
): Quad[] {
  const series = release.find(
    (q) => q.subject.value === asUrl && q.predicate.value === `${DCAT_NS}inSeries`,
  )?.object.value;
  if (series === undefined || release.some((q) => q.subject.value === series)) return [...index];
  const link = (subject: string, predicate: string, value: string) =>
    quadOf(subject, predicate, { kind: "iri", value });
  const added = [link(series, `${DCAT_NS}hasVersion`, asUrl)];
  if (!index.some((q) => q.subject.value === series)) {
    const copied = [
      "http://purl.org/dc/terms/title",
      "http://purl.org/dc/terms/description",
      "http://purl.org/dc/terms/publisher",
      `${DCAT_NS}theme`,
      `${DCAT_NS}keyword`,
    ];
    added.push(
      link(indexUrl, `${DCAT_NS}dataset`, series),
      link(series, RDF.type, `${DCAT_NS}DatasetSeries`),
      link(series, RDF.type, `${DCAT_NS}Dataset`),
      quadOf(series, SM_FORMAT_VERSION, {
        kind: "literal",
        value: String(LATEST_VERSION.libraryDeckSeries),
        language: "",
        datatype: XSD_INTEGER,
      }),
      ...release
        .filter((q) => q.subject.value === asUrl && copied.includes(q.predicate.value))
        .map((q) => quadOf(series, q.predicate.value, termOf(q.object))),
      link(series, `${DCAT_NS}first`, asUrl),
      link(series, `${DCAT_NS}last`, asUrl),
      link(series, `${DCAT_NS}hasCurrentVersion`, asUrl),
    );
  }
  return quadsOf(datasetFromQuads([...index, ...added]));
}
