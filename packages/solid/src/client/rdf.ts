// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  addBoolean as libraryAddBoolean,
  addDatetime as libraryAddDatetime,
  addDecimal as libraryAddDecimal,
  addInteger as libraryAddInteger,
  addLiteral as libraryAddLiteral,
  addStringNoLocale as libraryAddStringNoLocale,
  addStringWithLocale as libraryAddStringWithLocale,
  addUrl as libraryAddUrl,
  asUrl as libraryAsUrl,
  createSolidDataset as libraryCreateSolidDataset,
  createThing as libraryCreateThing,
  fromRdfJsDataset as libraryFromRdfJsDataset,
  getBoolean as libraryGetBoolean,
  getDatetime as libraryGetDatetime,
  getDecimal as libraryGetDecimal,
  getInteger as libraryGetInteger,
  getLiteralAll as libraryGetLiteralAll,
  getPropertyAll as libraryGetPropertyAll,
  getStringByLocaleAll as libraryGetStringByLocaleAll,
  getStringNoLocale as libraryGetStringNoLocale,
  getStringNoLocaleAll as libraryGetStringNoLocaleAll,
  getTermAll as libraryGetTermAll,
  getThing as libraryGetThing,
  getThingAll as libraryGetThingAll,
  getUrl as libraryGetUrl,
  getUrlAll as libraryGetUrlAll,
  removeAll as libraryRemoveAll,
  removeLiteral as libraryRemoveLiteral,
  removeUrl as libraryRemoveUrl,
  setInteger as librarySetInteger,
  setStringNoLocale as librarySetStringNoLocale,
  setUrl as librarySetUrl,
  type SolidDataset,
  type Thing,
  type ThingPersisted,
  toRdfJsDataset as libraryToRdfJsDataset,
  type WithChangeLog,
  type WithServerResourceInfo,
} from "@inrupt/solid-client";
import type { DatasetCore, Literal, Quad, Quad_Object } from "@rdfjs/types";
import { likeDataset, solidDataset, thing } from "./inrupt";
import type {
  Changes,
  Dataset,
  FetchedDataset,
  LanguageString,
  NamedSubject,
  PropertyValue,
  Source,
  Subject,
  SubjectBuilder,
} from "./interface";
import { graphsOf } from "./linearDataset";

/**
 * The app's RDF data model: datasets of subjects, read and built with the
 * operations below, of the types in interface.ts. A thin layer over
 * @inrupt/solid-client, the only implementation so far, so that the rest
 * of the package names no library: a switch of libraries changes this
 * module, not its callers. The operations keep the names the library
 * gives them; their types are the app's own, and every dataset and
 * subject they give is one the library made (inrupt.ts).
 *
 * What the app relies on of them, beyond their names, a second
 * implementation must do alike (the contract in
 * src/testing/contract/rdf.ts, which rdf.test.ts runs against this one):
 *
 * - getThingAll leaves out subjects that are blank nodes; getThing finds
 *   one by its `_:label`.
 * - getThing resolves the IRI of a subject made with createThing({ name })
 *   against the URL the dataset was read from: `#name` in that document.
 * - getDatetime reads any literal its unanchored pattern finds a date-time
 *   in, so it throws on some ("T2026-01-01T00:00:00Z") and gives an
 *   invalid date for one past what a JavaScript date holds; records.ts
 *   readDatetime makes both null. That pattern takes time that grows
 *   with the square of a long literal's length, so readDatetime passes
 *   it only a short literal that is wholly a date-time.
 * - Language tags are lower case wherever a value is read with one
 *   (getStringByLocaleAll, getLiteralAll), however the document spells it.
 * - getDecimal reads a decimal as parseFloat does (`2.50` is 2.5, a value
 *   that is no number null); addDecimal writes a number as JavaScript
 *   spells it (`1`, not `1.0`).
 */

export type {
  Dataset,
  FetchedDataset,
  LanguageString,
  NamedSubject,
  SourcedDataset,
  Subject,
  SubjectBuilder,
} from "./interface";

/**
 * The changes made to a dataset, as setThings and removeThings record
 * them; undefined for a dataset no change was ever made to.
 */
export function changesOf(dataset: Dataset): Changes | undefined {
  return (dataset as Partial<WithChangeLog>).internal_changeLog;
}

/**
 * An empty dataset of the document at `url`, as a read of it as
 * `contentType` begins: sourceOf names the document, and subjects made
 * by name resolve against it. A parser is handed one to resolve the
 * text's relative IRIs against `url` (resources.ts parseQuads).
 */
export function datasetAt(url: string, contentType = "text/turtle"): FetchedDataset {
  const dataset: SolidDataset & WithServerResourceInfo = {
    ...libraryCreateSolidDataset(),
    internal_resourceInfo: { sourceIri: url, isRawData: false, contentType, linkedResources: {} },
  };
  return dataset as unknown as FetchedDataset;
}

/** Where a dataset came from; undefined for one built here and never saved. */
export function sourceOf(dataset: object): Source | undefined {
  const info = (dataset as Partial<WithServerResourceInfo>).internal_resourceInfo;
  return info === undefined ? undefined : { url: info.sourceIri, key: info };
}

/** A dataset of `quads` and nothing else, built in one pass (linearDataset.ts). */
export function datasetFromQuads(quads: Iterable<Quad>): Dataset {
  return Object.freeze({ ...libraryCreateSolidDataset(), graphs: graphsOf(quads) });
}

/**
 * The dataset holding `quads` instead of what it held, from the same
 * document (sourceOf), with no changes: saved, it is written whole.
 */
export function withQuads<T extends Dataset>(dataset: T, quads: Iterable<Quad>): T {
  return likeDataset(
    dataset,
    Object.freeze({
      ...solidDataset(dataset),
      graphs: graphsOf(quads),
      internal_changeLog: { additions: [], deletions: [] },
    }),
  );
}

/** Whether a dataset says nothing of any subject. */
export function isEmptyDataset(dataset: Dataset): boolean {
  return Object.keys(solidDataset(dataset).graphs.default).length === 0;
}

/** Every property of a subject with its values: IRIs first, then literals, language strings and blank nodes. */
export function propertiesOf(subject: Subject): { predicate: string; values: PropertyValue[] }[] {
  return Object.entries(thing(subject).predicates).map(([predicate, objects]) => ({
    predicate,
    values: valuesOf(objects),
  }));
}

function valuesOf(objects: Thing["predicates"][string]): PropertyValue[] {
  const values: PropertyValue[] = [];
  for (const iri of objects.namedNodes ?? []) {
    values.push({ type: "iri", value: iri });
  }
  for (const [dataType, literals] of Object.entries(objects.literals ?? {})) {
    for (const literal of literals) {
      values.push({ type: "literal", value: literal, dataType });
    }
  }
  for (const [language, strings] of Object.entries(objects.langStrings ?? {})) {
    for (const value of strings) {
      values.push({ type: "langString", value, language });
    }
  }
  for (const blankNode of objects.blankNodes ?? []) {
    values.push({
      type: "blankNode",
      value: typeof blankNode === "string" ? blankNode : "[blank node]",
    });
  }
  return values;
}

/** Where the library names a subject that has no URL yet: `<#name>` in the document it is saved to. */
const LOCAL_NODE = "https://inrupt.com/.well-known/sdk-local-node/";

/**
 * The name of a subject made with createThing({ name }) and not saved
 * yet, as a quad of a change names it (`#name` in the document it is
 * saved to); undefined for any other IRI.
 */
export function localNameOf(iri: string): string | undefined {
  return iri.startsWith(LOCAL_NODE) ? iri.slice(LOCAL_NODE.length) : undefined;
}

/** An empty dataset, of no document. */
export function createSolidDataset(): Dataset {
  return libraryCreateSolidDataset();
}

/** The dataset's subject at `url` (a `_:label` for a blank node); null when it says nothing of it. */
export function getThing(dataset: Dataset, url: string): NamedSubject | null {
  return libraryGetThing(solidDataset(dataset), url);
}

/** Every subject of a dataset that has an IRI, blank nodes left out. */
export function getThingAll(dataset: Dataset): NamedSubject[] {
  return libraryGetThingAll(solidDataset(dataset));
}

/**
 * The dataset with `subject` in place of what it said of the same
 * subject, the change recorded (changesOf): as the library's setThing,
 * in time that grows with the subject's values, not their square
 * (setThings).
 */
export function setThing<T extends Dataset>(dataset: T, subject: Subject): T {
  return setThings(dataset, [subject]);
}

/**
 * The dataset with each of `subjects` set in turn, as setThing sets one,
 * each change recorded (changesOf). The library's setThing copies the
 * whole dataset and searches its changes so far at each subject and at
 * each of its triples, so a subject at a time takes time in the square
 * of the subjects, and of one subject's values; here the dataset is
 * copied once and the changes are kept by their quads' keys.
 */
export function setThings<T extends Dataset>(dataset: T, subjects: Iterable<Subject>): T {
  const data = solidDataset(dataset);
  const edit = editOf(data);
  for (const subject of subjects) {
    // At the IRI setThing gives it: one made by name in the document read.
    const iri = resolvedIri(data, subject.url);
    const stored: Thing = Object.freeze({ ...thing(subject), url: iri });
    // In its place, where it was there already, as setThing keeps it.
    edit.deleteQuadsOf(iri);
    for (const quad of quadsOf(iri, stored)) edit.add(quad);
    edit.graph[iri] = stored;
  }
  return likeDataset(dataset, edit.done() ?? data);
}

/**
 * The dataset without what it said of each of `subjects`, each change
 * recorded (changesOf), as the library's removeThing removes one: in
 * time that grows with the subjects and the dataset, not their product
 * (setThings).
 */
export function removeThings<T extends Dataset>(
  dataset: T,
  subjects: Iterable<string | Subject>,
): T {
  const data = solidDataset(dataset);
  const edit = editOf(data);
  for (const subject of subjects) {
    const iri = typeof subject === "string" ? resolvedIri(data, subject) : subject.url;
    edit.deleteQuadsOf(iri);
    delete edit.graph[iri];
  }
  return likeDataset(dataset, edit.done() ?? data);
}

/** Where the library puts a subject by its IRI: one made by name is resolved against a document read. */
function resolvedIri(data: SolidDataset, iri: string): string {
  const name = localNameOf(iri);
  const info = (data as Partial<WithServerResourceInfo>).internal_resourceInfo;
  if (name === undefined || typeof info?.linkedResources !== "object") return iri;
  const url = new URL(info.sourceIri);
  url.hash = name;
  return url.href;
}

/**
 * A subject's quads, as setThing records them among a dataset's changes:
 * in the library's order, without those that name a blank node, which
 * it leaves out. Made by the library's toRdfJsDataset, given back as
 * the list it makes rather than a dataset of it.
 */
function quadsOf(iri: string, stored: Thing): Quad[] {
  const alone = { graphs: { default: { [iri]: stored } } } as unknown as SolidDataset;
  const quads = libraryToRdfJsDataset(alone, {
    datasetFactory: { dataset: (made?: Quad[]) => made as unknown as DatasetCore },
  }) as unknown as Quad[];
  return quads.filter(
    (quad) => quad.subject.termType !== "BlankNode" && quad.object.termType !== "BlankNode",
  );
}

/**
 * Edits of a library dataset, made at once: its default graph copied
 * once, and its changes kept by their quads' keys, a quad added and
 * then deleted (or deleted and then added again) no change, as the
 * library records them. done() gives the dataset edited; undefined
 * when no edit was made, as a dataset no subject was set in or removed
 * from is the same.
 */
function editOf(data: SolidDataset) {
  const graph: Record<string, Thing> = Object.assign(Object.create(null), data.graphs.default);
  const log = (data as Partial<WithChangeLog>).internal_changeLog;
  const additions = new Map((log?.additions ?? []).map((quad) => [quadKey(quad), quad]));
  const deletions = new Map((log?.deletions ?? []).map((quad) => [quadKey(quad), quad]));
  let edited = false;
  return {
    graph,
    add(quad: Quad) {
      const key = quadKey(quad);
      if (!deletions.delete(key)) additions.set(key, quad);
    },
    /** Records the quads of the subject at `iri` deleted; the graph is the caller's to change. */
    deleteQuadsOf(iri: string) {
      edited = true;
      const previous = graph[iri];
      if (previous === undefined) return;
      // Its quads as setThing would have recorded them when it was set.
      for (const quad of quadsOf(iri, previous)) {
        const key = quadKey(quad);
        if (!additions.delete(key)) deletions.set(key, quad);
      }
    },
    done(): SolidDataset | undefined {
      if (!edited) return undefined;
      return Object.freeze({
        ...data,
        graphs: Object.freeze({ ...data.graphs, default: Object.freeze(graph) }),
        internal_changeLog: {
          additions: [...additions.values()],
          deletions: [...deletions.values()],
        },
      });
    },
  };
}

/** A quad's key: two quads are the same (Quad.equals) when their keys are. */
function quadKey(quad: Quad): string {
  const { subject, predicate, object } = quad;
  const literal = object.termType === "Literal" ? [object.datatype.value, object.language] : [];
  return JSON.stringify([
    subject.termType,
    subject.value,
    predicate.value,
    object.termType,
    object.value,
    ...literal,
  ]);
}

/**
 * A subject that says nothing yet: at `url`, or by `name` in the
 * document it is saved to, or local to the dataset it is set in.
 */
export function createThing(options?: { url: string } | { name?: string }): NamedSubject {
  return libraryCreateThing(options);
}

/**
 * A builder of a subject's triples, starting from what `subject` says.
 * Each call is the library's own (its buildThing makes the same calls),
 * but setIriAll, setStringAll and removeLiteralAll, which it has none of: there the
 * property's values are made once, where the library's adds copy them
 * at every value. The library takes its own subjects as values, which
 * every subject here is (inrupt.ts).
 */
export function buildThing(subject: Subject): SubjectBuilder {
  return new Builder(thing(subject));
}

type Predicate = Thing["predicates"][string];

/** A subject with nothing said of it, to see how the library writes one value (setIriAll, setStringAll). */
const PROBE = libraryCreateThing();

const XSD_STRING = "http://www.w3.org/2001/XMLSchema#string";

class Builder implements SubjectBuilder {
  #thing: Thing;

  constructor(subject: Thing) {
    this.#thing = subject;
  }

  #with(change: (subject: Thing) => Thing): this {
    this.#thing = change(this.#thing);
    return this;
  }

  /** The subject with the property's values made by `change` from what they are. */
  #predicate(property: string, change: (predicate: Predicate) => Predicate): this {
    const { [property]: previous = {}, ...others } = this.#thing.predicates;
    const next = Object.fromEntries(
      Object.entries(change(previous)).filter(
        ([, values]) => values !== undefined && Object.keys(values).length > 0,
      ),
    ) as Predicate;
    const predicates = Object.keys(next).length === 0 ? others : { ...others, [property]: next };
    return this.#with((subject) =>
      Object.freeze({ ...subject, predicates: Object.freeze(predicates) }),
    );
  }

  addIri(property: string, value: string | Subject): this {
    return this.#with((subject) => libraryAddUrl(subject, property, iriOf(value)));
  }

  addUrl(property: string, value: string | Subject): this {
    return this.addIri(property, value);
  }

  addBoolean(property: string, value: boolean): this {
    return this.#with((subject) => libraryAddBoolean(subject, property, value));
  }

  addDatetime(property: string, value: Date): this {
    return this.#with((subject) => libraryAddDatetime(subject, property, value));
  }

  addDecimal(property: string, value: number): this {
    return this.#with((subject) => libraryAddDecimal(subject, property, value));
  }

  addInteger(property: string, value: number): this {
    return this.#with((subject) => libraryAddInteger(subject, property, value));
  }

  addLiteral(property: string, value: Literal): this {
    return this.#with((subject) => libraryAddLiteral(subject, property, value));
  }

  addStringNoLocale(property: string, value: string): this {
    return this.#with((subject) => libraryAddStringNoLocale(subject, property, value));
  }

  addStringWithLocale(property: string, value: string, locale: string): this {
    return this.#with((subject) => libraryAddStringWithLocale(subject, property, value, locale));
  }

  setIri(property: string, value: string | Subject): this {
    return this.#with((subject) => librarySetUrl(subject, property, iriOf(value)));
  }

  setInteger(property: string, value: number): this {
    return this.#with((subject) => librarySetInteger(subject, property, value));
  }

  setStringNoLocale(property: string, value: string): this {
    return this.#with((subject) => librarySetStringNoLocale(subject, property, value));
  }

  removeAll(property: string): this {
    return this.#with((subject) => libraryRemoveAll(subject, property));
  }

  removeLiteral(property: string, value: Literal): this {
    return this.#with((subject) => libraryRemoveLiteral(subject, property, value));
  }

  removeUrl(property: string, value: string | Subject): this {
    return this.#with((subject) => libraryRemoveUrl(subject, property, iriOf(value)));
  }

  setIriAll(property: string, values: readonly string[]): this {
    // Each as the library's add writes it, which refuses one that is no URL.
    const iris = new Set(
      values.map(
        (value) => libraryAddUrl(PROBE, property, value).predicates[property].namedNodes![0],
      ),
    );
    return this.#predicate(property, (previous) => ({ ...previous, namedNodes: [...iris] }));
  }

  setStringAll(property: string, values: readonly LanguageString[]): this {
    // Each as the library's adds write it: a language in lower case.
    const strings = new Set<string>();
    const byLanguage = new Map<string, Set<string>>();
    for (const { value, language } of values) {
      if (language === "") {
        const written = libraryAddStringNoLocale(PROBE, property, value).predicates[property];
        strings.add(written.literals![XSD_STRING][0]);
        continue;
      }
      const written = libraryAddStringWithLocale(PROBE, property, value, language).predicates[
        property
      ];
      const [[tag, [text]]] = Object.entries(written.langStrings!);
      const texts = byLanguage.get(tag);
      if (texts === undefined) byLanguage.set(tag, new Set([text]));
      else texts.add(text);
    }
    return this.#predicate(property, (previous) => {
      const literals = { ...previous.literals };
      delete literals[XSD_STRING];
      if (strings.size > 0) literals[XSD_STRING] = [...strings];
      const langStrings = Object.fromEntries(
        [...byLanguage].map(([tag, texts]) => [tag, [...texts]]),
      );
      return { ...previous, literals, langStrings };
    });
  }

  removeLiteralAll(property: string, datatype: string, values: readonly string[]): this {
    const removed = new Set(values);
    // Each datatype where it was, as removeLiteral keeps it.
    return this.#predicate(property, (previous) => ({
      ...previous,
      literals: Object.fromEntries(
        Object.entries(previous.literals ?? {})
          .map(([type, kept]) => [
            type,
            type === datatype ? kept.filter((value) => !removed.has(value)) : kept,
          ])
          .filter(([, kept]) => kept.length > 0),
      ),
    }));
  }

  build(): NamedSubject {
    return this.#thing as ThingPersisted;
  }
}

/** A value as the library takes it: an IRI, or one of its own subjects. */
function iriOf(value: string | Subject): string | Thing {
  return typeof value === "string" ? value : thing(value);
}

/** A subject's IRI; throws for one made by name and not saved yet, which has none. */
export function asUrl(subject: Subject): string {
  return libraryAsUrl(thing(subject) as ThingPersisted);
}

/** Every IRI the subject has for the property. */
export function getUrlAll(subject: Subject, property: string): string[] {
  return libraryGetUrlAll(thing(subject), property);
}

/** An IRI the subject has for the property; null when it has none. */
export function getUrl(subject: Subject, property: string): string | null {
  return libraryGetUrl(thing(subject), property);
}

/** The subject without the IRI `value` for the property. */
export function removeUrl(subject: Subject, property: string, value: string): NamedSubject {
  return libraryRemoveUrl(thing(subject), property, value);
}

/** A string without a language the subject has for the property; null when it has none. */
export function getStringNoLocale(subject: Subject, property: string): string | null {
  return libraryGetStringNoLocale(thing(subject), property);
}

/** Every string without a language the subject has for the property. */
export function getStringNoLocaleAll(subject: Subject, property: string): string[] {
  return libraryGetStringNoLocaleAll(thing(subject), property);
}

/** The subject's strings with a language for the property, by their language in lower case. */
export function getStringByLocaleAll(subject: Subject, property: string): Map<string, string[]> {
  return libraryGetStringByLocaleAll(thing(subject), property);
}

/** An integer the subject has for the property; null when it has none. */
export function getInteger(subject: Subject, property: string): number | null {
  return libraryGetInteger(thing(subject), property);
}

/** A decimal the subject has for the property, read as parseFloat does; null when it has none. */
export function getDecimal(subject: Subject, property: string): number | null {
  return libraryGetDecimal(thing(subject), property);
}

/** A boolean the subject has for the property; null when it has none. */
export function getBoolean(subject: Subject, property: string): boolean | null {
  return libraryGetBoolean(thing(subject), property);
}

/** A date-time the subject has for the property; null when it has none (see the list above). */
export function getDatetime(subject: Subject, property: string): Date | null {
  return libraryGetDatetime(thing(subject), property);
}

/** Every literal the subject has for the property, language tags in lower case. */
export function getLiteralAll(subject: Subject, property: string): Literal[] {
  return libraryGetLiteralAll(thing(subject), property);
}

/** Every value the subject has for the property, as RDF/JS terms. */
export function getTermAll(subject: Subject, property: string): Quad_Object[] {
  return libraryGetTermAll(thing(subject), property);
}

/** Every property the subject has a value for. */
export function getPropertyAll(subject: Subject): string[] {
  return libraryGetPropertyAll(thing(subject));
}

/** The dataset's triples, as an RDF/JS dataset. */
export function toRdfJsDataset(dataset: Dataset): DatasetCore {
  return libraryToRdfJsDataset(solidDataset(dataset));
}

/** A dataset of an RDF/JS dataset's triples. */
export function fromRdfJsDataset(dataset: DatasetCore): Dataset {
  return libraryFromRdfJsDataset(dataset);
}
