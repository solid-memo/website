import {
  asUrl,
  createSolidDataset,
  getContainedResourceUrlAll,
  getSolidDataset,
  getThing,
  getThingAll,
  getUrlAll,
  setThing,
  type SolidDataset,
  type ThingPersisted,
} from "@inrupt/solid-client";
import type { Quad } from "@rdfjs/types";
import type { ReleaseDraftRepository } from "@solid-memo/application/ports";
import { AppError } from "@solid-memo/domain/appError";
import { catalogNodeUrlOf, catalogUrlOf, ensureTrailingSlash } from "@solid-memo/domain/instanceLayout";
import {
  draftContainerOf,
  draftPlaceOf,
  draftSummaryOf,
  isDraftDocumentName,
  unreadableDraftSummary,
  type ReleaseDraftSummary,
} from "@solid-memo/domain/release/draftLayout";
import { DCAT_NS, DCTERMS_NS } from "@solid-memo/domain/release/releaseModel";
import { RDF_TYPE, type DraftTriple, type ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { moved } from "@solid-memo/domain/release/releaseToDraft";
import { LATEST_VERSION } from "@solid-memo/vocab/types.generated";
import { addCatalogLink, catalogLinks, removeCatalogLink } from "./catalogLinks";
import { deleteContainerIfEmpty } from "./containers";
import {
  deleteDataset,
  deleteIfPresent,
  getSolidDatasetOrNull,
  readDataset,
  saveDataset,
  versionOf,
} from "./datasets";
import { graphsOf } from "./linearDataset";
import {
  datasetOf,
  draftEntries,
  draftFromQuads,
  draftIriOf,
  entryQuads,
  keyOf,
  quadOf,
  quadsOf,
  sameEntry,
  termOf,
  tripleKey,
  type DraftEntry,
} from "./mappers/releaseDraftMapper";
import { recordThing, removeUnlessNewer, storedVersionOf } from "./records";
import { DECK_FILE_PREFIXES, parseDeckFile } from "./solidDeckArchive";
import { turtleOf } from "./turtleWriter";
import { SM } from "./vocab";
import { noWriteCheck, type WriteCheck } from "./writeCheck";

const XSD_DATE_TIME = "http://www.w3.org/2001/XMLSchema#dateTime";
const DCAT = (name: string) => `${DCAT_NS}${name}`;
const DCTERMS = (name: string) => `${DCTERMS_NS}${name}`;

/** The prefixes a release is written with (docs/deck-library.md): a deck file's, and those a release's provenance uses. */
export const RELEASE_PREFIXES: Readonly<Record<string, string>> = {
  "solid-memo": DECK_FILE_PREFIXES.sm!,
  ...Object.fromEntries(Object.entries(DECK_FILE_PREFIXES).filter(([prefix]) => prefix !== "sm")),
  adms: "http://www.w3.org/ns/adms#",
  spdx: "http://spdx.org/rdf/terms#",
};

/** Each of a draft's documents as read last, by URL, and the version they were at together. */
interface Read {
  version: string;
  documents: Map<string, SolidDataset>;
}

/**
 * The ReleaseDraftRepository over the pod (docs/data-model.md "Drafts"):
 * a draft is the container its release document is in, linked from the
 * instance's catalogue by `sm:releaseDraft`. A draft's documents are
 * read whole, each remembered as read, and an edit of one is written
 * only if it is still as it was (If-Match), one PUT of it whole; an
 * edit is made from the read it names by its version, or refused. What
 * the draft shapes describe is checked before it is written
 * (`checkWrite`, "draft"); what they do not is written as it is.
 * Releases are read, never written, with `releaseFetch`: a library
 * release is read where the site serves it.
 */
export function createSolidReleaseDraftRepository({
  fetch,
  releaseFetch = fetch,
  checkWrite = noWriteCheck,
}: {
  fetch: typeof globalThis.fetch;
  releaseFetch?: typeof globalThis.fetch;
  checkWrite?: WriteCheck;
}): ReleaseDraftRepository {
  /** Each draft's documents as last read, so an edit is written only if they are still so. */
  const reads = new Map<string, Read>();

  /** The drafts the instance's catalogue links, as their places say: a link anywhere but a draft's place in the instance is not followed. */
  async function linked(instanceUrl: string): Promise<{ url: string; place: { instanceUrl: string; name: string; version: number } }[]> {
    return (await catalogLinks(instanceUrl, SM.releaseDraft, fetch)).flatMap((url) => {
      const place = draftPlaceOf(url);
      return place === null || place.instanceUrl !== ensureTrailingSlash(instanceUrl) ? [] : [{ url, place }];
    });
  }

  const documentsOf = (draftUrl: string) => draftDocumentsIn(draftUrl, fetch);

  /** A draft's documents, read now and remembered as read. */
  async function readDraft(draftUrl: string): Promise<{ draft: ReleaseDraft; version: string }> {
    const urls = await documentsOf(draftUrl);
    if (!urls.includes(draftUrl)) throw new AppError("draftGone");
    const datasets = await Promise.all(urls.map((url) => readDataset(url, fetch)));
    const iriOf = draftIriOf(draftContainerOf(draftUrl), draftUrl);
    const quads = datasets.flatMap((dataset, at) =>
      quadsOf(dataset).map((quad) => {
        // Blank nodes are named afresh in each document: here, they are each document's own.
        const blank = (key: string) => (key.startsWith("_:") ? `_:d${at}-${key.slice(2)}` : iriOf(key));
        const object = termOf(quad.object);
        return quadOf(
          blank(keyOf(quad.subject)),
          quad.predicate.value,
          object.kind === "iri" ? { kind: "iri", value: iriOf(object.value) } : object.kind === "blank" ? { kind: "blank", value: `d${at}-${object.value}` } : object,
        );
      }),
    );
    const draft = draftFromQuads(quads, draftUrl);
    if (draft === null) throw new AppError("draftGone");
    const version = versionOfDocuments(urls, datasets);
    reads.set(draftUrl, { version, documents: new Map(urls.map((url, at) => [url, datasets[at]!])) });
    return { draft, version };
  }

  /** Read a release document, as it states itself, its formats ones this app reads. */
  function readReleaseQuads(quads: readonly Quad[], url: string): ReleaseDraft {
    const release = draftFromQuads(quads, url);
    // A version is 1, 2, …: a draft is numbered after it.
    if (release === null || !/^[1-9][0-9]*$/.test(release.root.version ?? "1")) throw new AppError("releaseUnreadable", { url });
    const dataset = datasetOf(quads);
    const root = getThing(dataset, url)!;
    if (storedVersionOf(root) > LATEST_VERSION.libraryDeck) {
      throw new AppError("libraryDeckTooNew", { url, version: storedVersionOf(root), reads: LATEST_VERSION.libraryDeck });
    }
    for (const thing of getThingAll(dataset)) {
      if (getUrlAll(thing, RDF_TYPE).includes(SM.Card) && storedVersionOf(thing) > LATEST_VERSION.card) {
        throw new AppError("libraryCardTooNew", { url: asUrl(thing), version: storedVersionOf(thing), reads: LATEST_VERSION.card });
      }
    }
    return release;
  }

  return {
    async list(instanceUrl) {
      return Promise.all(
        (await linked(instanceUrl)).map(async ({ url, place }): Promise<ReleaseDraftSummary> => {
          try {
            const dataset = await readDataset(url, fetch);
            const draft = draftFromQuads(quadsOf(dataset), url);
            return draft === null ? unreadableDraftSummary(url, place) : draftSummaryOf(draft)!;
          } catch {
            return unreadableDraftSummary(url, place);
          }
        }),
      );
    },

    async documents(instanceUrl) {
      return (await Promise.all((await linked(instanceUrl)).map(({ url }) => documentsOf(url)))).flat();
    },

    async create(instanceUrl, draft) {
      const catalog = await getSolidDatasetOrNull(catalogUrlOf(instanceUrl), fetch);
      if (catalog === null || getThing(catalog, catalogNodeUrlOf(instanceUrl)) === null) throw new AppError("noCatalogToUpdate");
      const byDocument = new Map<string, DraftEntry[]>([[draft.url, []]]);
      for (const entry of draftEntries(draft).values()) {
        const entries = byDocument.get(entry.document);
        if (entries === undefined) byDocument.set(entry.document, [entry]);
        else entries.push(entry);
      }
      // The release document first: a draft whose place is taken stops there, having written nothing.
      const written: string[] = [];
      try {
        for (const [url, entries] of byDocument) {
          const dataset = datasetOf(entries.flatMap(entryQuads));
          await checkWrite(dataset, shapedSubjects(entries), "draft");
          await saveDataset(url, dataset, fetch);
          written.push(url);
        }
        await addCatalogLink(instanceUrl, SM.releaseDraft, draft.url, fetch);
      } catch (error) {
        // What this draft wrote goes, the release document last: no draft is left that no catalogue links, nor deletes.
        if (written.length > 0) await deleteDocuments(draft.url, [...written.slice(1).reverse(), draft.url], fetch).catch(() => undefined);
        throw error;
      }
      return draftSummaryOf(draft)!;
    },

    read(draftUrl) {
      return readDraft(draftUrl);
    },

    async readSince(draftUrl, version) {
      const read = await readDraft(draftUrl);
      return version !== undefined && read.version === version ? { unchanged: true } : { unchanged: false, value: read.draft, version: read.version };
    },

    async applyChanges(before, after, version) {
      const read = reads.get(before.url);
      // Read since at another version (an edit made meanwhile), or never: `before` is not what the documents were.
      if (read?.version !== version) throw new AppError("changedElsewhere", { url: before.url });
      const was = draftEntries(before);
      const now = draftEntries(after);
      /** For each document, the entries that leave it and those that come or change in it. */
      const touched = new Map<string, { gone: DraftEntry[]; made: { entry: DraftEntry; was?: DraftEntry }[] }>();
      const at = (document: string) => {
        let changes = touched.get(document);
        if (changes === undefined) {
          changes = { gone: [], made: [] };
          touched.set(document, changes);
        }
        return changes;
      };
      for (const key of new Set([...was.keys(), ...now.keys()])) {
        const old = was.get(key);
        const next = now.get(key);
        if (old !== undefined && next !== undefined && sameEntry(old, next)) continue;
        if (old !== undefined && (next === undefined || old.document !== next.document || old.subject !== next.subject)) at(old.document).gone.push(old);
        if (next !== undefined) at(next.document).made.push({ entry: next, ...(old?.document === next.document && old.subject === next.subject ? { was: old } : {}) });
      }
      // New documents first, so no subject is ever named from where it is not yet; then the others, the release document last.
      const order = [...touched.keys()].sort((a, b) => Number(read.documents.has(a)) - Number(read.documents.has(b)) || Number(a === before.url) - Number(b === before.url));
      for (const url of order) {
        const changes = touched.get(url)!;
        const gone = changes.gone.map(inDocument);
        const made = changes.made.map(({ entry, was }) => ({ entry: inDocument(entry), ...(was === undefined ? {} : { was: inDocument(was) }) }));
        const stored = read.documents.get(url);
        let dataset: SolidDataset = stored ?? createSolidDataset();
        const blank = [...gone, ...made.flatMap(({ entry, was }) => [entry, ...(was === undefined ? [] : [was])])].some(involvesBlank);
        for (const entry of gone) if (!entry.subject.startsWith("_:")) dataset = removeUnlessNewer(dataset, entry.subject);
        for (const { entry, was } of made) {
          if (!entry.subject.startsWith("_:")) dataset = setThing(dataset, rewritten(getThing(dataset, entry.subject), entry, was));
        }
        if (blank) dataset = withBlankNodes(dataset, gone, made);
        await checkWrite(dataset, shapedSubjects(made.map(({ entry }) => entry)), "draft");
        if (stored !== undefined && url !== before.url && Object.keys(dataset.graphs.default).length === 0) {
          // A chapter's document with nothing left in it goes, as it was read.
          await deleteDataset(url, stored, fetch);
        } else {
          // One PUT of the whole document, If-Match: a draft's documents are all text, which Community Solid
          // Server's in-memory store cuts short after a PATCH, and node-solid-server stores a boolean a PATCH
          // inserts as false (owl:deprecated true, a retirement, among them).
          await saveDataset(url, dataset, fetch, { whole: true });
        }
      }
      // The documents are no longer as read: an edit made from that read again is refused, a newer read kept.
      read.version = "";
    },

    async assemble(draftUrl, targetUrl, issued, version) {
      const urls = await documentsOf(draftUrl);
      if (!urls.includes(draftUrl)) throw new AppError("draftGone");
      const iriOf = draftIriOf(draftContainerOf(draftUrl), draftUrl);
      const to = (iri: string) => moved(iriOf(iri), draftUrl, targetUrl);
      const datasets = await Promise.all(urls.map((url) => readDataset(url, fetch)));
      if (version !== undefined && versionOfDocuments(urls, datasets) !== version) throw new AppError("changedElsewhere", { url: draftUrl });
      const atTarget = datasets.flatMap((dataset, at) =>
        quadsOf(dataset).map((quad) => {
          const object = termOf(quad.object);
          const label = (value: string) => `d${at}-${value}`;
          return quadOf(
            quad.subject.termType === "BlankNode" ? `_:${label(quad.subject.value)}` : to(quad.subject.value),
            quad.predicate.value,
            object.kind === "iri" ? { kind: "iri", value: to(object.value) } : object.kind === "blank" ? { kind: "blank", value: label(object.value) } : object,
          );
        }),
      );
      const quads = releaseQuadsOf(atTarget, targetUrl, issued);
      const subjects = [...new Set(quads.map((quad) => keyOf(quad.subject)))];
      return turtleOf(quads, { base: targetUrl, prefixes: RELEASE_PREFIXES, order: [targetUrl, ...subjects.filter((subject) => !subject.startsWith(`${targetUrl}#`)), ...subjects] });
    },

    async readRelease(url) {
      let dataset: SolidDataset;
      try {
        dataset = await readDataset(url, releaseFetch);
      } catch {
        throw new AppError("releaseUnreadable", { url });
      }
      return readReleaseQuads(quadsOf(dataset), url);
    },

    async parseRelease(text, format) {
      const base = "https://file.solid-memo.invalid/release.ttl";
      const quads = await parseDeckFile(text, format, base);
      const roots = [...new Set(quads.filter((quad) => quad.predicate.value === RDF_TYPE && quad.object.value === SM.Deck).map((quad) => quad.subject.value))];
      if (roots.length !== 1 || roots[0]!.includes("#")) throw new AppError("notAReleaseFile");
      if (quads.some((quad) => quad.subject.value === roots[0] && (quad.predicate.value === SM.cardsDocument || quad.predicate.value === SM.reviewsDocument))) {
        throw new AppError("notAReleaseFile");
      }
      try {
        return readReleaseQuads(quads, roots[0]!);
      } catch (error) {
        throw error instanceof AppError && error.code === "releaseUnreadable" ? new AppError("notAReleaseFile") : error;
      }
    },

    async delete(draft) {
      await deleteDraftResources(draft.url, fetch);
      reads.delete(draft.url);
      await removeCatalogLink(draft.instanceUrl, SM.releaseDraft, draft.url, fetch);
    },
  };
}

/** The version of each of a draft's documents, in order: a draft changed when any of them did, or one came or went. */
function versionOfDocuments(urls: readonly string[], datasets: readonly SolidDataset[]): string {
  return JSON.stringify(urls.map((url, at) => [url, versionOf(datasets[at]!)]));
}

/**
 * A draft's statements, every subject moved to `targetUrl`, as the
 * release they make, released `issued` (also its time of change):
 * written at library deck format 6, with the series it starts described
 * in it (withSeries). What `assemble` writes, and what the shapes check
 * of a draft (ShapeValidator.validateRelease).
 */
export function releaseQuadsOf(quads: readonly Quad[], targetUrl: string, issued: string): Quad[] {
  const time = { kind: "literal" as const, value: issued, language: "", datatype: XSD_DATE_TIME };
  const dropped = new Set([SM.formatVersion, SM.releasedAs, DCTERMS("issued"), DCTERMS("modified")]);
  return withSeries(
    [
      ...quads.filter((quad) => !(quad.subject.value === targetUrl && dropped.has(quad.predicate.value))),
      quadOf(targetUrl, SM.formatVersion, { kind: "literal", value: String(LATEST_VERSION.libraryDeck), language: "", datatype: "http://www.w3.org/2001/XMLSchema#integer" }),
      quadOf(targetUrl, DCTERMS("issued"), time),
      quadOf(targetUrl, DCTERMS("modified"), time),
    ],
    targetUrl,
  );
}

/** The documents of a draft's container, those a draft has (draftLayout.ts), by URL; none when it is gone (404). */
export async function draftDocumentsIn(draftUrl: string, fetch: typeof globalThis.fetch): Promise<string[]> {
  const container = draftContainerOf(draftUrl);
  // The listing is read afresh, never answered from what was read before: a server whose ETag
  // outlives edits made in the same second would say a document just made is not there.
  let listing: Awaited<ReturnType<typeof getSolidDataset>>;
  try {
    listing = await getSolidDataset(container, { fetch });
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) return [];
    throw error;
  }
  return getContainedResourceUrlAll(listing)
    .filter((url) => url.startsWith(container) && isDraftDocumentName(url.slice(container.length)))
    .sort();
}

/**
 * Delete what a draft is in a pod, and nothing else: its documents, the
 * release document last, so a delete cut short still finds the draft;
 * then its container, the one named after it, and the instance's
 * `drafts/`, each only if it is then empty. Anything else in them,
 * another app's, is kept, and so is the container holding it.
 */
export async function deleteDraftResources(draftUrl: string, fetch: typeof globalThis.fetch): Promise<void> {
  const urls = await draftDocumentsIn(draftUrl, fetch);
  await deleteDocuments(draftUrl, [...urls.filter((one) => one !== draftUrl), draftUrl], fetch);
}

/** Delete the documents, in order, then the draft's containers, each only if it is then empty. */
async function deleteDocuments(draftUrl: string, urls: readonly string[], fetch: typeof globalThis.fetch): Promise<void> {
  for (const url of urls) await deleteIfPresent(url, fetch);
  const container = draftContainerOf(draftUrl);
  const named = container.slice(0, container.slice(0, -1).lastIndexOf("/") + 1);
  const drafts = named.slice(0, named.slice(0, -1).lastIndexOf("/") + 1);
  for (const one of [container, named, drafts]) {
    if (!(await deleteContainerIfEmpty(one, fetch))) return;
  }
}

/** The subjects of entries their shapes describe: what the write check checks. */
function shapedSubjects(entries: readonly DraftEntry[]): string[] {
  return entries.filter((entry) => entry.shaped !== undefined).map((entry) => entry.subject);
}

function involvesBlank(entry: DraftEntry): boolean {
  return entry.subject.startsWith("_:") || entry.raw.some((triple) => triple.object.kind === "blank");
}

/**
 * A subject as the entry says it, from what the document has of it now
 * (`existing`): its record written over what its shape owns (recordThing,
 * which refuses what a newer app wrote), the statements it said before
 * (`was`) and does not now taken out, those it says now put in; anything
 * else the document says of it kept.
 */
function rewritten(existing: ThingPersisted | null, entry: DraftEntry, was: DraftEntry | undefined): ThingPersisted {
  const empty: ThingPersisted = { type: "Subject", url: entry.subject, predicates: {} };
  const base = entry.shaped === undefined ? (existing ?? empty) : recordThing(entry.subject, entry.shaped.descriptor, entry.shaped.record, existing);
  const removed = new Set((was?.raw ?? []).map(tripleKey));
  const kept = quadsOf(setThing(createSolidDataset(), base)).filter((quad) => !removed.has(tripleKey(asTriple(quad))));
  const quads = [...kept, ...entry.raw.map((triple) => quadOf(triple.subject, triple.predicate, triple.object))];
  // The entry says something of its subject (a record's type, or a statement): the subject is there.
  return graphsOf(quads).default[entry.subject] as ThingPersisted;
}

function asTriple(quad: Quad): DraftTriple {
  return { subject: keyOf(quad.subject), predicate: quad.predicate.value, object: termOf(quad.object) };
}

/** A blank node's label in its document: the draft's (`d<n>-<label>`, a document's own) without what made it the document's. */
function podLabel(label: string): string {
  return label.replace(/^(_:)?d[0-9]+-/, "$1");
}

/** An entry with its blank nodes as its document names them. */
function inDocument(entry: DraftEntry): DraftEntry {
  const triple = (one: DraftTriple): DraftTriple => ({
    subject: podLabel(one.subject),
    predicate: one.predicate,
    object: one.object.kind === "blank" ? { kind: "blank", value: podLabel(one.object.value) } : one.object,
  });
  return { ...entry, subject: podLabel(entry.subject), raw: entry.raw.map(triple) };
}

/**
 * The document with the blank nodes of what changed as the entries say
 * them: those a subject that left or changed named taken out, those it
 * names now put in, as the document is written whole.
 */
function withBlankNodes(
  dataset: SolidDataset,
  gone: readonly DraftEntry[],
  made: readonly { entry: DraftEntry; was?: DraftEntry }[],
): SolidDataset {
  const before = new Set([...gone, ...made.flatMap(({ was }) => (was === undefined ? [] : [was]))].filter((entry) => entry.subject.startsWith("_:")).map((entry) => entry.subject));
  const quads = [
    ...quadsOf(dataset).filter((quad) => !before.has(keyOf(quad.subject))),
    ...made.filter(({ entry }) => entry.subject.startsWith("_:")).flatMap(({ entry }) => entryQuads(entry)),
  ];
  return Object.freeze({ ...dataset, graphs: graphsOf(quads), internal_changeLog: { additions: [], deletions: [] } }) as SolidDataset;
}

/**
 * The series a release is in, described in it when the draft says it
 * starts it there (its IRI the release's own, `<#series>`) or describes
 * it already: the release its last and current version, one of its
 * versions, its title, description, publisher, themes and keywords the
 * release's (docs/deck-library.md, A release outside the library). A
 * series elsewhere, which an index describes, is left to it.
 */
function withSeries(quads: readonly Quad[], target: string): Quad[] {
  const of = (subject: string, predicate: string) => quads.filter((quad) => quad.subject.value === subject && quad.predicate.value === predicate);
  const [series] = of(target, DCAT("inSeries")).map((quad) => quad.object.value);
  if (series === undefined) return [...quads];
  const described = quads.some((quad) => quad.subject.value === series);
  if (!described && !series.startsWith(`${target}#`)) return [...quads];
  const replaced = new Set([DCAT("last"), DCAT("hasCurrentVersion"), DCTERMS("title"), DCTERMS("description"), DCTERMS("publisher"), DCAT("theme"), DCAT("keyword")]);
  const link = (predicate: string, value: string) => quadOf(series, predicate, { kind: "iri", value });
  const copied = [DCTERMS("title"), DCTERMS("description"), DCTERMS("publisher"), DCAT("theme"), DCAT("keyword")].flatMap((predicate) =>
    of(target, predicate).map((quad) => quadOf(series, predicate, termOf(quad.object))),
  );
  const fresh = described
    ? []
    : [
        link(RDF_TYPE, DCAT("DatasetSeries")),
        link(RDF_TYPE, DCAT("Dataset")),
        quadOf(series, SM.formatVersion, { kind: "literal", value: String(LATEST_VERSION.libraryDeckSeries), language: "", datatype: "http://www.w3.org/2001/XMLSchema#integer" }),
        link(DCAT("first"), target),
      ];
  const versions = of(series, DCAT("hasVersion")).some((quad) => quad.object.value === target) ? [] : [link(DCAT("hasVersion"), target)];
  return [
    ...quads.filter((quad) => !(quad.subject.value === series && replaced.has(quad.predicate.value))),
    ...fresh,
    ...copied,
    link(DCAT("last"), target),
    link(DCAT("hasCurrentVersion"), target),
    ...versions,
  ];
}
