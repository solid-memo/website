// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  type Dataset,
  type Subject,
  createSolidDataset,
  datasetFromQuads,
  getThing,
  getUrlAll,
  setThing,
  toRdfJsDataset,
} from "../client/rdf";
import type { Literal, Quad, Term } from "@rdfjs/types";
import { AppError } from "@solid-memo/domain/appError";
import { isSameUrl } from "@solid-memo/domain/instanceLayout";
import {
  draftDocuments,
  draftDocumentUrl,
  isDraftDocumentName,
} from "@solid-memo/domain/release/draftLayout";
import {
  idIn,
  iriIn,
  NOTHING_PUBLISHED,
  RDF_TYPE,
  SCHEMA_COURSE,
  type DraftNode,
  type DraftTriple,
  type ReleaseDraft,
  unsupportedIdOf,
} from "@solid-memo/domain/release/releaseDraft";
import type { ReleaseTerm } from "@solid-memo/domain/release/releaseModel";
import { isPublishedReleaseUrl } from "@solid-memo/domain/release/releasePlace";
import { rebaseDraft } from "@solid-memo/domain/release/releaseToDraft";
import { migrate } from "@solid-memo/domain/shapes/migrations";
import { DRAFT_DECK_V1, SHAPES } from "@solid-memo/vocab/descriptors.generated";
import type { ShapeDescriptor } from "@solid-memo/vocab/shapeDescriptor";
import type { ShapeName } from "@solid-memo/vocab/types.generated";
import { datetimeOf, readRecord, readVersioned, recordThing } from "../records";
import { DCTERMS, SM } from "../vocab";

/**
 * A release's draft between its documents and the domain's ReleaseDraft
 * (domain/release/releaseDraft.ts, docs/data-model.md "Drafts"):
 *
 * - **Shaped subjects** (the root, agents, the distribution, chapters,
 *   steps, cards, distractors) are read by their shapes, the draft
 *   shapes for the root, chapters and steps, each brought to its latest
 *   format, and written as records (recordThing): what the shape owns is
 *   rewritten, anything else on the subject is kept.
 * - **Every other statement** (how the release was made, its sources
 *   and license, the series it describes, and what a shaped subject says
 *   beyond its shape) is read and written as it is: a raw triple.
 *
 * A subject is named in the draft as a fragment of its release document,
 * and in the pod as a fragment of the document it is kept in
 * (draftDocuments); the IRIs are mapped between the two here.
 */

/** The kinds of shaped subject a draft has besides its root, by the class that marks each. */
const KINDS: readonly {
  list: Exclude<keyof ReleaseDraft, "url" | "course" | "root" | "triples" | "published">;
  shape: ShapeName;
}[] = [
  { list: "agents", shape: "agent" },
  { list: "distributions", shape: "distribution" },
  { list: "chapters", shape: "draftChapter" },
  { list: "steps", shape: "draftStep" },
  { list: "cards", shape: "card" },
  { list: "distractors", shape: "distractor" },
];

const LATEST = (shape: ShapeName): ShapeDescriptor => {
  const versions = SHAPES[shape] as Record<number, ShapeDescriptor>;
  return versions[Math.max(...Object.keys(versions).map(Number))]!;
};

/** A term as the domain keeps it. */
export function termOf(term: Term): ReleaseTerm {
  switch (term.termType) {
    case "Literal":
      return {
        kind: "literal",
        value: term.value,
        language: term.language,
        datatype: term.datatype.value,
      };
    case "BlankNode":
      return { kind: "blank", value: term.value };
    default:
      return { kind: "iri", value: term.value };
  }
}

/** A subject or object of a triple: `_:label` for a blank node. */
function subjectTerm(value: string): Term {
  return (
    value.startsWith("_:")
      ? { termType: "BlankNode", value: value.slice(2) }
      : { termType: "NamedNode", value }
  ) as Term;
}

/** A statement as a quad of the default graph, plain data that datasetFromQuads and turtleOf read. */
export function quadOf(subject: string, predicate: string, object: ReleaseTerm): Quad {
  const term =
    object.kind === "literal"
      ? {
          termType: "Literal",
          value: object.value,
          language: object.language,
          datatype: { termType: "NamedNode", value: object.datatype },
        }
      : subjectTerm(object.kind === "blank" ? `_:${object.value}` : object.value);
  return {
    subject: subjectTerm(subject),
    predicate: { termType: "NamedNode", value: predicate },
    object: term,
    graph: { termType: "DefaultGraph", value: "" },
  } as unknown as Quad;
}

/** A subject's key: its IRI, or `_:label`. */
export function keyOf(term: Term): string {
  return term.termType === "BlankNode" ? `_:${term.value}` : term.value;
}

/** One statement as a string, to compare by. */
export function tripleKey(triple: DraftTriple): string {
  const { object } = triple;
  const value =
    object.kind === "literal"
      ? `"${object.value}"@${object.language.toLowerCase()}^^${object.datatype}`
      : `${object.kind} ${object.value}`;
  return `${triple.subject} ${triple.predicate} ${value}`;
}

/** The quads of a dataset. */
export function quadsOf(dataset: Dataset): Quad[] {
  return [...toRdfJsDataset(dataset)] as Quad[];
}

/**
 * A pod IRI of a draft's container as the draft names it: a fragment of
 * one of its documents as the same fragment of its release document;
 * any other IRI as it is.
 */
export function draftIriOf(container: string, draftUrl: string): (iri: string) => string {
  return (iri) => {
    if (!iri.startsWith(container)) return iri;
    const hash = iri.indexOf("#");
    const name = (hash === -1 ? iri : iri.slice(0, hash)).slice(container.length);
    if (!isDraftDocumentName(name)) return iri;
    return hash === -1 ? draftUrl : `${draftUrl}${iri.slice(hash)}`;
  };
}

/**
 * Whether a subject of the draft's document `document` is named there
 * as the draft writes it (draftEntries): by an IRI draftIriOf leaves as
 * it is, as the release document itself in it, or as a fragment of the
 * document it is in. Any other name of the draft's documents (another
 * document's fragment, or a document other than the release document
 * itself) would be read as one of the draft's own subjects, what it
 * states hidden behind the record read of that subject, and published
 * with it (GHSA-8w75-jg23-rxq5).
 */
export function inPlaceIn(
  container: string,
  draftUrl: string,
): (document: string, iri: string) => boolean {
  const iriOf = draftIriOf(container, draftUrl);
  return (document, iri) => {
    const hash = iri.indexOf("#");
    const named = hash === -1 ? iri : iri.slice(0, hash);
    if (iriOf(iri) === iri && named !== draftUrl) return true;
    return named === document && (hash !== -1 || iri === draftUrl);
  };
}

/**
 * What a release writes of its root itself, in place of what its draft
 * says (releaseQuadsOf): its format, its time of issue and of change,
 * and no sm:releasedAs.
 */
export const UNPUBLISHED_ROOT_PREDICATES: ReadonlySet<string> = new Set([
  SM.formatVersion,
  SM.releasedAs,
  DCTERMS.issued,
  DCTERMS.modified,
]);

const XSD = "http://www.w3.org/2001/XMLSchema#";

/**
 * An xsd:integer's value in one spelling, its sign and digits without
 * the zeros that lead them; null when the lexical form is not an
 * integer's, which the client would read as parseInt does (`"7junk"`
 * as 7, `"0.9"` as 0).
 */
function integerValue(lexical: string): string | null {
  const match = /^([+-]?)(\d+)$/.exec(lexical);
  if (match === null) return null;
  const [, sign, digits] = match as unknown as [string, string, string];
  let start = 0;
  while (start < digits.length - 1 && digits[start] === "0") start++;
  const value = digits.slice(start);
  return sign === "-" && value !== "0" ? `-${value}` : value;
}

/**
 * A term by the value it holds, to compare a stored value with the one
 * a record writes: an integer, a boolean or a date-time in UTC (`Z`)
 * by what it means, when its lexical form is one of its datatype (a
 * date-time's every field in its range, datetimeValue); a text with
 * its language in lower case (as the records read it); anything else,
 * an ill-formed literal or a date-time with an offset too, as it is
 * spelled. The records write a date-time in UTC.
 */
function valueKey(term: Term): string {
  if (term.termType !== "Literal") return JSON.stringify([term.termType, term.value]);
  const datatype = term.datatype.value;
  const value =
    datatype === `${XSD}integer`
      ? integerValue(term.value)
      : datatype === `${XSD}boolean`
        ? ({ true: "true", "1": "true", false: "false", "0": "false" } as Record<string, string>)[
            term.value
          ]
        : datatype === `${XSD}dateTime`
          ? datetimeValue(term)
          : undefined;
  return value === null || value === undefined
    ? JSON.stringify(["Literal", datatype, term.language.toLowerCase(), term.value])
    : JSON.stringify(["value", datatype, value]);
}

/** An xsd:dateTime in UTC, its year, month, day, hour, minute and second. */
const UTC_DATETIME = /^([+-]?\d{4,})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d+)?Z$/;

/**
 * The instant an xsd:dateTime in UTC holds, as toISOString writes it;
 * null when it is not in UTC, or when a field is out of its range
 * (month 13, hour 99), which a date would carry over into the next
 * rather than refuse.
 */
function datetimeValue(term: Literal): string | null {
  const fields = UTC_DATETIME.exec(term.value);
  const date = fields === null ? null : datetimeOf(term);
  if (fields === null || date === null) return null;
  const [, ...stated] = fields.map(Number);
  const read = [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  ];
  return read.every((value, at) => value === stated[at]) ? date.toISOString() : null;
}

const PROBE = "https://solid-memo.com/probe";

/**
 * The first predicate a shaped subject's statements state otherwise
 * than its record writes it, so that what an editor shows and the
 * checks see is not what would be published: a second value of a
 * field of one, a second text in a language, a value of the wrong kind
 * or ill-formed for its datatype, an IRI outside a field's list, any
 * value of a predicate the shape forbids, or a format other than the
 * one it is read in. A stored value is compared with the one the record
 * writes (recordThing) by what it holds (valueKey), and two stored
 * values that hold the same are one too many. Null when the subject
 * states every predicate its shape owns as its record writes it.
 * `kept` are IRIs a predicate's record keeps beyond its fields;
 * `unchecked` are predicates not compared.
 */
function hiddenPredicateOf(
  statements: readonly Quad[],
  descriptor: ShapeDescriptor,
  record: unknown,
  kept: readonly (readonly [string, readonly string[]])[] = [],
  unchecked: ReadonlySet<string> = new Set(),
): string | null {
  const expected = new Map<string, Set<string>>(
    [
      ...descriptor.absent,
      ...descriptor.fields.map((field) => field.predicate),
      SM.formatVersion,
    ].map((predicate) => [predicate, new Set<string>()]),
  );
  for (const quad of quadsOf(
    setThing(createSolidDataset(), recordThing(PROBE, descriptor, record, null)),
  )) {
    expected.get(quad.predicate.value)?.add(valueKey(quad.object));
  }
  for (const [predicate, iris] of kept) {
    expected.set(
      predicate,
      new Set(iris.map((iri) => valueKey({ termType: "NamedNode", value: iri } as Term))),
    );
  }
  const stored = new Map<string, { terms: Set<string>; values: Set<string> }>();
  for (const { predicate, object } of statements) {
    if (!expected.has(predicate.value)) continue;
    const of = stored.get(predicate.value) ?? { terms: new Set(), values: new Set() };
    stored.set(predicate.value, of);
    of.terms.add(JSON.stringify(termOf(object)));
    of.values.add(valueKey(object));
  }
  // A format of 1 goes without saying: a subject that states none is read in it.
  if (descriptor.version === 1 && !stored.has(SM.formatVersion)) {
    expected.delete(SM.formatVersion);
  }
  for (const [predicate, values] of expected) {
    if (unchecked.has(predicate)) continue;
    const of = stored.get(predicate);
    const same =
      (of?.terms.size ?? 0) === values.size &&
      (of?.values.size ?? 0) === values.size &&
      [...values].every((value) => of!.values.has(value));
    if (!same) return predicate;
  }
  return null;
}

/**
 * The draft (or release) at `url` its triples state, every IRI as the
 * draft names it; null when it has no root this app can read (an
 * sm:Deck at `url` with its shape's required fields). The release a
 * draft was published as (`sm:releasedAs`) is kept only at an address
 * a release may have (isPublishedReleaseUrl): the draft is data anyone
 * with write access to its container may have written, and the Studio
 * links that address and asks it whether the release is public. Of
 * several, one at such an address is kept, whichever comes first.
 *
 * With `refuseHidden`, as a draft in the pod is read and published, a
 * shaped subject whose statements state a predicate its shape owns
 * otherwise than its record writes it is refused (draftHiddenValue,
 * hiddenPredicateOf): no editor shows the difference and no check
 * sees it, but it would be published with the release
 * (GHSA-32jq-jh7h-r7v4). So each value of such a predicate that is
 * published holds what its record does. What publishing writes of the
 * root itself is not compared (UNPUBLISHED_ROOT_PREDICATES). A subject
 * stamped with a newer format than this app reads it in is refused as
 * a newer app's (writtenByNewerApp): reloading the page reads it.
 */
export function draftFromQuads(
  quads: readonly Quad[],
  url: string,
  { refuseHidden = false }: { refuseHidden?: boolean } = {},
): ReleaseDraft | null {
  const dataset = datasetFromQuads(quads);
  /** Each subject's statements, by its key. */
  const statements = new Map<string, Quad[]>();
  for (const quad of quads) {
    const key = keyOf(quad.subject);
    const of = statements.get(key);
    if (of === undefined) statements.set(key, [quad]);
    else of.push(quad);
  }
  /** Refuse a subject whose record does not keep what it states (hiddenPredicateOf), when asked to. */
  const refuse = (
    subject: string,
    descriptor: ShapeDescriptor,
    record: unknown,
    kept?: readonly (readonly [string, readonly string[]])[],
    unchecked?: ReadonlySet<string>,
  ) => {
    if (!refuseHidden) return;
    const predicate = hiddenPredicateOf(
      statements.get(subject)!,
      descriptor,
      record,
      kept,
      unchecked,
    );
    if (predicate !== null) throw new AppError("draftHiddenValue", { subject, predicate });
  };
  /** For each shaped subject, the predicates its shape owns, and the types. */
  const owned = new Map<string, { predicates: Set<string>; types: Set<string> }>();
  const own = (
    subject: string,
    descriptor: ShapeDescriptor,
    types: readonly string[] = [],
    predicates: readonly string[] = [],
  ) =>
    owned.set(subject, {
      predicates: new Set([
        ...descriptor.fields.map((field) => field.predicate),
        ...descriptor.absent,
        SM.formatVersion,
        ...predicates,
      ]),
      types: new Set([descriptor.targetClass, ...descriptor.additionalTypes, ...types]),
    });

  const rootThing = getThing(dataset, url);
  const rootTypes = rootThing === null ? [] : getUrlAll(rootThing, RDF_TYPE);
  const read =
    rootThing === null || !rootTypes.includes(SM.Deck)
      ? null
      : readRecord(rootThing, DRAFT_DECK_V1);
  if (read === null) return null;
  // Of every sm:releasedAs the draft states, one at a release's address, whatever their order.
  const { releasedAs: _first, ...rest } = read;
  const releasedAs = getUrlAll(rootThing!, SM.releasedAs).find(isPublishedReleaseUrl);
  const root = releasedAs === undefined ? rest : { ...rest, releasedAs };
  refuse(url, DRAFT_DECK_V1, read, [], UNPUBLISHED_ROOT_PREDICATES);
  own(url, DRAFT_DECK_V1, [SCHEMA_COURSE]);

  const nodes: Record<string, DraftNode<unknown>[]> = Object.fromEntries(
    KINDS.map(({ list }) => [list, []]),
  );
  for (const subject of statements.keys()) {
    const id = idIn({ url }, subject);
    if (id === null) continue;
    const thing = getThing(dataset, subject) as Subject;
    const types = getUrlAll(thing, RDF_TYPE);
    const kinds = KINDS.filter(({ shape }) => types.includes(LATEST(shape).targetClass));
    if (kinds.length !== 1) continue;
    const { list, shape } = kinds[0]!;
    const read = readVersioned(thing, shape);
    if (read === null) continue;
    // Read in the latest format this app knows, a newer one would be published in that one: the reload message, not a value to remove.
    if (refuseHidden && read.storedVersion > read.record.version) {
      throw new AppError("writtenByNewerApp", {
        url: subject,
        version: read.storedVersion,
        writes: read.record.version,
      });
    }
    const descriptor = (SHAPES[shape] as Record<number, ShapeDescriptor>)[read.record.version]!;
    const data = migrate(shape, read.record, { subject });
    // What a card stamped below format 7 is about (`dcterms:subject`, as a
    // release compiled from linked data states it on format-4 cards) goes
    // into its record, not the raw triples: the latest card shape writes
    // it, once, and the release diff and a learner's upgrade compare it.
    if (shape === "card" && read.record.version < 7) {
      const about = getUrlAll(thing, DCTERMS.subject);
      refuse(subject, descriptor, read.record.data, [[DCTERMS.subject, about]]);
      own(subject, descriptor, [], [DCTERMS.subject]);
      nodes[list]!.push({ id, data: { ...data, subject: about } });
      continue;
    }
    refuse(subject, descriptor, read.record.data);
    own(subject, descriptor);
    nodes[list]!.push({ id, data });
  }
  const triples = quads
    .filter((quad) => {
      const shaped = owned.get(keyOf(quad.subject));
      if (shaped === undefined) return true;
      if (quad.predicate.value === RDF_TYPE) return !shaped.types.has(quad.object.value);
      return !shaped.predicates.has(quad.predicate.value);
    })
    .map(
      (quad): DraftTriple => ({
        subject: keyOf(quad.subject),
        predicate: quad.predicate.value,
        object: termOf(quad.object),
      }),
    );
  return {
    url,
    course: rootTypes.includes(SCHEMA_COURSE),
    root,
    ...(nodes as unknown as Pick<
      ReleaseDraft,
      "agents" | "distributions" | "chapters" | "steps" | "cards" | "distractors"
    >),
    triples,
    published: NOTHING_PUBLISHED,
  };
}

/** One subject of a draft as its document in the pod holds it: its record, when its shape describes it, and its other statements. */
export interface DraftEntry {
  /** The document it is kept in. */
  document: string;
  /** Its IRI there (`_:label` for a blank node). */
  subject: string;
  shaped?: { descriptor: ShapeDescriptor; record: unknown };
  raw: DraftTriple[];
}

/**
 * Every subject of the draft, by its IRI in the draft, as the pod keeps
 * it: in the document draftDocuments puts it in, at that document's IRI,
 * with every IRI it names mapped the same way. A chapter's document is
 * named after its id, so a draft with an id no draft can have (DRAFT_ID)
 * is refused (draftIdUnsupported): its documents might not be in its
 * container. A statement that one of its documents itself (`<>`, spelled
 * any way a request sends it) is dcterms:isPartOf something is left out:
 * it is what the release the draft was made from said, and to a deck
 * it would say the document is the deck's to write (ownsDocument).
 */
export function draftEntries(draft: ReleaseDraft): Map<string, DraftEntry> {
  const unsupported = unsupportedIdOf(draft);
  if (unsupported !== null) throw new AppError("draftIdUnsupported", { id: unsupported });
  const places = draftDocuments(draft);
  const documentOf = (iri: string) =>
    draftDocumentUrl(draft.url, places.get(iri) ?? { kind: "release" });
  const podIri = (iri: string) => {
    const id = idIn(draft, iri);
    return id === null ? iri : `${documentOf(iri)}#${id}`;
  };
  const pod = rebaseDraft(draft, draft.url, podIri);
  const entries = new Map<string, DraftEntry>();
  entries.set(draft.url, {
    document: draft.url,
    subject: draft.url,
    shaped: { descriptor: DRAFT_DECK_V1, record: pod.root },
    raw: draft.course
      ? [{ subject: draft.url, predicate: RDF_TYPE, object: { kind: "iri", value: SCHEMA_COURSE } }]
      : [],
  });
  for (const { list, shape } of KINDS) {
    (draft[list] as readonly DraftNode<unknown>[]).forEach((node, at) => {
      const iri = iriIn(draft, node.id);
      entries.set(iri, {
        document: documentOf(iri),
        subject: podIri(iri),
        shaped: {
          descriptor: LATEST(shape),
          record: (pod[list] as readonly DraftNode<unknown>[])[at]!.data,
        },
        raw: [],
      });
    });
  }
  draft.triples.forEach((triple, at) => {
    const key = triple.subject;
    const subject = key.startsWith("_:") ? key : podIri(key);
    const document = entries.get(key)?.document ?? documentOf(key);
    if (triple.predicate === DCTERMS.isPartOf && isSameUrl(subject, document)) return;
    let entry = entries.get(key);
    if (entry === undefined) {
      entry = { document, subject, raw: [] };
      entries.set(key, entry);
    }
    entry.raw.push(pod.triples[at]!);
  });
  return entries;
}

/**
 * The draft's statements, every subject at its IRI in the draft: each
 * record as its shape writes it, and every other statement as it is.
 * What its documents hold together, but named as in its release.
 */
export function draftQuads(draft: ReleaseDraft): Quad[] {
  const root: DraftEntry = {
    document: draft.url,
    subject: draft.url,
    shaped: { descriptor: DRAFT_DECK_V1, record: draft.root },
    raw: draft.course
      ? [{ subject: draft.url, predicate: RDF_TYPE, object: { kind: "iri", value: SCHEMA_COURSE } }]
      : [],
  };
  const nodes = KINDS.flatMap(({ list, shape }) =>
    (draft[list] as readonly DraftNode<unknown>[]).map(
      (node): DraftEntry => ({
        document: draft.url,
        subject: iriIn(draft, node.id),
        shaped: { descriptor: LATEST(shape), record: node.data },
        raw: [],
      }),
    ),
  );
  return [
    ...[root, ...nodes].flatMap(entryQuads),
    ...draft.triples.map((triple) => quadOf(triple.subject, triple.predicate, triple.object)),
  ];
}

/** A subject as the quads its document holds of it, written new. */
export function entryQuads(entry: DraftEntry): Quad[] {
  const shaped =
    entry.shaped === undefined
      ? []
      : quadsOf(
          setThing(
            createSolidDataset(),
            recordThing(entry.subject, entry.shaped.descriptor, entry.shaped.record, null),
          ),
        );
  return [
    ...shaped,
    ...entry.raw.map((triple) => quadOf(triple.subject, triple.predicate, triple.object)),
  ];
}

/** Whether two entries say the same of their subject, in the same place. */
export function sameEntry(a: DraftEntry, b: DraftEntry): boolean {
  const triples = (entry: DraftEntry) => entry.raw.map(tripleKey).sort().join("\n");
  return (
    a.document === b.document &&
    a.subject === b.subject &&
    JSON.stringify(a.shaped?.record) === JSON.stringify(b.shaped?.record) &&
    triples(a) === triples(b)
  );
}
