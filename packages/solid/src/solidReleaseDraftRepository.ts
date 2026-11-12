// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { getContainedResourceUrlAll, getSolidDataset } from "./client/resources";
import {
  type Dataset,
  type FetchedDataset,
  type NamedSubject,
  asUrl,
  createSolidDataset,
  datasetFromQuads,
  getThing,
  getThingAll,
  getUrlAll,
  isEmptyDataset,
  setThing,
  withQuads,
} from "./client/rdf";
import type { Quad } from "@rdfjs/types";
import { editOf } from "./datasetEdit";
import { mapAtOnce } from "@solid-memo/application/atOnce";
import type { ReleaseDraftRepository } from "@solid-memo/application/ports";
import { AppError } from "@solid-memo/domain/appError";
import {
  catalogNodeUrlOf,
  catalogUrlOf,
  ensureTrailingSlash,
} from "@solid-memo/domain/instanceLayout";
import {
  draftContainerOf,
  draftPlaceOf,
  draftSummaryOf,
  isDraftDocumentName,
  unreadableDraftSummary,
  type ReleaseDraftSummary,
} from "@solid-memo/domain/release/draftLayout";
import { seriesAbove } from "@solid-memo/domain/release/continuityRules";
import { DCAT_NS, DCTERMS_NS, type ReleaseTerm } from "@solid-memo/domain/release/releaseModel";
import {
  RDF_TYPE,
  type DraftTriple,
  type ReleaseDraft,
  unsupportedIdOf,
} from "@solid-memo/domain/release/releaseDraft";
import { moved, VERSION_LINKS } from "@solid-memo/domain/release/releaseToDraft";
import { earlierVersionsOf } from "@solid-memo/domain/release/releaseVersion";
import { isIriPastBound } from "@solid-memo/domain/pathKeys";
import { isPublishedReleaseUrl } from "@solid-memo/domain/release/releasePlace";
import { LATEST_VERSION } from "@solid-memo/vocab/types.generated";
import { addCatalogLink, catalogLinks, removeCatalogLink } from "./catalogLinks";
import { deleteContainerIfEmpty } from "./containers";
import {
  deleteDataset,
  getSolidDatasetOrNull,
  removeOwned,
  readDataset,
  saveDataset,
} from "./datasets";
import {
  draftEntries,
  draftFromQuads,
  draftReadOf,
  draftIriOf,
  entryQuads,
  withEntryClasses,
  inPlaceIn,
  keyOf,
  quadOf,
  quadsOf,
  sameEntry,
  termOf,
  termTooLong,
  tripleParts,
  type DraftEntry,
  UNPUBLISHED_ROOT_PREDICATES,
} from "./mappers/releaseDraftMapper";
import { draftSubjects } from "./ownership";
import { recordThing, removeAllUnlessNewer, storedVersionOf } from "./records";
import { limitedFetch, pathKeys, RELEASE_LIMITS } from "./client/readLimits";
import { releaseReadError } from "./releaseReadError";
import { DECK_FILE_PREFIXES, parseDeckFile } from "./solidDeckArchive";
import { refuseUnwritable } from "./writableTerms";
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

/**
 * How many documents a draft's container may list that the app reads, and
 * how many all of an instance's drafts may list together. A container's
 * listing is data anyone may have written, as is the catalog naming the
 * drafts; past either, the drafts' documents are refused
 * (draftTooManyDocuments), not read. A draft made or changed past
 * either is refused before anything is written (a change that fails
 * partway may still leave it past).
 * One already past it is read as no draft (the instance's check reads
 * its release document alone), but it can still be deleted
 * (deleteDraftResources).
 */
export const MAX_DRAFT_DOCUMENTS = 1000;
export const MAX_DRAFT_DOCUMENTS_IN_ALL = 5000;

/** Each of a draft's documents as read last, by URL, and the version they were at together. */
interface Read {
  version: string;
  documents: Map<string, Dataset>;
}

/**
 * The ReleaseDraftRepository over the pod (docs/data-model.md "Drafts"):
 * a draft is the container its release document is in, linked from the
 * instance's catalog by `sm:releaseDraft`. A draft's documents are
 * read whole, each remembered as read, and an edit of one is written
 * only if it is still as it was (If-Match), one PUT of it whole; an
 * edit is made from the read it names by its version, or refused. What
 * the draft shapes describe is checked before it is written
 * (`checkWrite`, "draft"); what they do not is written as it is.
 * Releases are read, never written, with `releaseFetch`: a library
 * release is read where the site serves it. The documents a release
 * names its series and publisher in are read with `publicFetch`, as no
 * one: what they say is copied into a draft to be published, as is a
 * release read `asNoOne`. Both are
 * read under RELEASE_LIMITS: a release may be anyone's, on any server.
 */
export function createSolidReleaseDraftRepository({
  fetch,
  releaseFetch = fetch,
  publicFetch = releaseFetch,
  checkWrite = noWriteCheck,
}: {
  fetch: typeof globalThis.fetch;
  releaseFetch?: typeof globalThis.fetch;
  publicFetch?: typeof globalThis.fetch;
  checkWrite?: WriteCheck;
}): ReleaseDraftRepository {
  /** Each draft's documents as last read, so an edit is written only if they are still so. */
  const reads = new Map<string, Read>();
  const releases = limitedFetch(releaseFetch, RELEASE_LIMITS);
  const published = limitedFetch(publicFetch, RELEASE_LIMITS);

  /** The drafts the instance's catalog links, as their places say: a link anywhere but a draft's place in the instance is not followed. */
  async function linked(
    instanceUrl: string,
  ): Promise<{ url: string; place: { instanceUrl: string; name: string; version: number } }[]> {
    return (await catalogLinks(instanceUrl, SM.releaseDraft, fetch)).flatMap((url) => {
      const place = draftPlaceOf(url);
      return place === null || place.instanceUrl !== ensureTrailingSlash(instanceUrl)
        ? []
        : [{ url, place }];
    });
  }

  const documentsOf = (draftUrl: string) => draftDocumentsIn(draftUrl, fetch);

  /**
   * draftTooManyDocuments, before anything is written, when the documents
   * the instance's other drafts list, each counted as `documents` counts
   * it, and the `count` of the draft at `draftUrl` would pass
   * MAX_DRAFT_DOCUMENTS_IN_ALL together: past it, no read of the drafts
   * would take them. Stopped as soon as they pass it.
   */
  async function refuseTooManyInAll(
    instanceUrl: string,
    draftUrl: string,
    count: number,
  ): Promise<void> {
    let listed = count;
    await mapAtOnce(await linked(instanceUrl), async ({ url }) => {
      if (url === draftUrl) return;
      // Read before it is added to: `listed` is added to by the others' reads meanwhile.
      const urls = await listedDocumentsIn(url, fetch);
      listed += Math.min(urls.length, MAX_DRAFT_DOCUMENTS);
      if (listed > MAX_DRAFT_DOCUMENTS_IN_ALL)
        throw new AppError("draftTooManyDocuments", { limit: MAX_DRAFT_DOCUMENTS_IN_ALL });
    });
  }

  /** A draft's documents, read now. */
  async function readDocuments(
    draftUrl: string,
  ): Promise<{ urls: readonly string[]; datasets: readonly Dataset[] }> {
    const urls = await documentsOf(draftUrl);
    if (!urls.includes(draftUrl)) throw new AppError("draftGone");
    return { urls, datasets: await mapAtOnce(urls, (url) => readDataset(url, fetch)) };
  }

  /**
   * A draft's documents as the read at `version` had them, not read
   * again: what was checked of that read is what is published, which a
   * server's ETags alone cannot vouch for (GHSA-438x-f779-7chm).
   * changedElsewhere when that read is not the draft's last.
   */
  function readAt(
    draftUrl: string,
    version: string,
  ): { urls: readonly string[]; datasets: readonly Dataset[] } {
    const read = reads.get(draftUrl);
    if (read?.version !== version) throw new AppError("changedElsewhere", { url: draftUrl });
    return { urls: [...read.documents.keys()], datasets: [...read.documents.values()] };
  }

  /** A draft's documents, read now and remembered as read. */
  async function readDraft(draftUrl: string): Promise<{ draft: ReleaseDraft; version: string }> {
    const { urls, datasets } = await readDocuments(draftUrl);
    const quads = draftNamedQuads(draftUrl, urls, datasets);
    // What its documents state otherwise than its records write it would be published, unseen and unchecked (GHSA-32jq-jh7h-r7v4).
    const draft = draftFromQuads(quads, draftUrl, { refuseHidden: true });
    if (draft === null) throw new AppError("draftGone");
    // Its documents are anyone's to write: an id no draft has could name a chapter's document outside its container.
    const unsupported = unsupportedIdOf(draft);
    if (unsupported !== null) throw new AppError("draftIdUnsupported", { id: unsupported });
    const version = versionOfDocuments(urls, datasets);
    reads.set(draftUrl, {
      version,
      documents: new Map(urls.map((url, at) => [url, datasets[at]!])),
    });
    return { draft, version };
  }

  /** Read a release document, as it states itself, its formats ones this app reads. */
  function readReleaseQuads(quads: readonly Quad[], url: string): ReleaseDraft {
    const release = draftFromQuads(quads, url);
    // A version is 1, 2, …: a draft is numbered after it, in its address, as is the next version's.
    const version = release?.root.version ?? "1";
    if (
      release === null ||
      !/^[1-9][0-9]*$/.test(version) ||
      !Number.isSafeInteger(Number(version) + 1)
    )
      throw new AppError("releaseUnreadable", { url });
    const dataset = datasetFromQuads(quads);
    const root = getThing(dataset, url)!;
    if (storedVersionOf(root) > LATEST_VERSION.libraryDeck) {
      throw new AppError("libraryDeckTooNew", {
        url,
        version: storedVersionOf(root),
        reads: LATEST_VERSION.libraryDeck,
      });
    }
    for (const thing of getThingAll(dataset)) {
      if (
        getUrlAll(thing, RDF_TYPE).includes(SM.Card) &&
        storedVersionOf(thing) > LATEST_VERSION.card
      ) {
        throw new AppError("libraryCardTooNew", {
          url: asUrl(thing),
          version: storedVersionOf(thing),
          reads: LATEST_VERSION.card,
        });
      }
    }
    return release;
  }

  const repository: ReleaseDraftRepository = {
    // A few drafts at a time: the catalog may link many (MAX_CATALOG_LINKS), each as large as a release.
    async list(instanceUrl) {
      return mapAtOnce(
        await linked(instanceUrl),
        async ({ url, place }): Promise<ReleaseDraftSummary> => {
          try {
            const dataset = await readDataset(url, fetch);
            const draft = draftFromQuads(quadsOf(dataset), url);
            return draft === null ? unreadableDraftSummary(url, place) : draftSummaryOf(draft)!;
          } catch {
            return unreadableDraftSummary(url, place);
          }
        },
      );
    },

    async documents(instanceUrl) {
      // Stopped as soon as the drafts list more than MAX_DRAFT_DOCUMENTS_IN_ALL together, no other draft read after.
      // A draft past its own limit counts as that limit and is read as its release document alone: one such draft doesn't stop the check of the rest.
      let listed = 0;
      const each = await mapAtOnce(await linked(instanceUrl), async ({ url }) => {
        const urls = await listedDocumentsIn(url, fetch);
        listed += Math.min(urls.length, MAX_DRAFT_DOCUMENTS);
        if (listed > MAX_DRAFT_DOCUMENTS_IN_ALL)
          throw new AppError("draftTooManyDocuments", { limit: MAX_DRAFT_DOCUMENTS_IN_ALL });
        return urls.length > MAX_DRAFT_DOCUMENTS ? [url] : urls;
      });
      return each.flat();
    },

    async create(instanceUrl, draft) {
      // A draft at an address no draft has would be written where no list finds it, nor a delete.
      const summary = draftSummaryOf(draft);
      if (summary === null) throw new Error(`No draft can be at ${draft.url}`);
      const byDocument = new Map<string, DraftEntry[]>([[draft.url, []]]);
      for (const entry of draftEntries(draft).values()) {
        const entries = byDocument.get(entry.document);
        if (entries === undefined) byDocument.set(entry.document, [entry]);
        else entries.push(entry);
      }
      // One the app could not read back: nothing of it is written.
      refuseTooManyDocuments(byDocument.size);
      const catalog = await getSolidDatasetOrNull(catalogUrlOf(instanceUrl), fetch);
      if (catalog === null || getThing(catalog, catalogNodeUrlOf(instanceUrl)) === null)
        throw new AppError("noCatalogToUpdate");
      // Nor one that would take the instance's drafts past what a read of them takes together.
      await refuseTooManyInAll(instanceUrl, draft.url, byDocument.size);
      // The release document first: a draft whose place is taken stops there, having written nothing.
      const written: string[] = [];
      try {
        for (const [url, entries] of byDocument) {
          const dataset = datasetFromQuads(entries.flatMap(entryQuads));
          await checkWrite(dataset, shapedSubjects(entries), "draft");
          await saveDataset(url, dataset, fetch);
          written.push(url);
        }
        await addCatalogLink(instanceUrl, SM.releaseDraft, draft.url, fetch);
      } catch (error) {
        // What this draft wrote goes, the release document last: no draft is left that no catalog links, nor deletes.
        if (written.length > 0)
          await deleteDocuments(draft.url, [...written.slice(1).reverse(), draft.url], fetch).catch(
            () => undefined,
          );
        throw error;
      }
      return summary;
    },

    read(draftUrl) {
      return readDraft(draftUrl);
    },

    async applyChanges(before, after, version) {
      const read = reads.get(before.url);
      // Read since at another version (an edit made meanwhile), or never: `before` is not what the documents were.
      if (read?.version !== version) throw new AppError("changedElsewhere", { url: before.url });
      const touched = changesByDocument(draftEntries(before), draftEntries(after));
      // New documents first, so no subject is ever named from where it is not yet; then the others, the release document last.
      const order = [...touched.keys()].sort(
        (a, b) =>
          Number(read.documents.has(a)) - Number(read.documents.has(b)) ||
          Number(a === before.url) - Number(b === before.url),
      );
      const changes = order.map((url) => {
        const stored = read.documents.get(url);
        const { dataset, made } = changedDocument(stored, touched.get(url)!);
        // A chapter's document with nothing left in it goes, as it was read.
        const emptied = stored !== undefined && url !== before.url && isEmptyDataset(dataset);
        return { url, stored, dataset, made, emptied };
      });
      // No more documents than the draft could be read with again: nothing of the change is written.
      const count =
        read.documents.size +
        changes.filter(({ stored }) => stored === undefined).length -
        changes.filter(({ emptied }) => emptied).length;
      refuseTooManyDocuments(count);
      // Nor, when it adds documents, more than the instance's drafts could be read with together.
      // Only a draft at a draft's place is read for an edit (the Studio's drafts are its catalog's).
      if (count > read.documents.size)
        await refuseTooManyInAll(draftPlaceOf(before.url)!.instanceUrl, before.url, count);
      for (const { url, stored, dataset, made, emptied } of changes) {
        await checkWrite(dataset, shapedSubjects(made.map(({ entry }) => entry)), "draft");
        if (emptied) {
          await deleteDataset(url, stored!, fetch);
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
      const { urls, datasets } =
        version === undefined ? await readDocuments(draftUrl) : readAt(draftUrl, version);
      const iriOf = draftIriOf(draftContainerOf(draftUrl), draftUrl);
      const inPlace = inPlaceIn(draftContainerOf(draftUrl), draftUrl);
      const to = (iri: string) => {
        const there = moved(iriOf(iri), draftUrl, targetUrl);
        // Past the bound no document holds it: refused before the statements are keyed by it, which V8 would hash by its length alone (GHSA-4mgg-5xpp-3jx5).
        if (isIriPastBound(there)) throw termTooLong();
        return there;
      };
      // A statement of the release at its address already would say more of it than the draft does, which no editor shows (GHSA-p2pr-x6fw-hrfx).
      const atTargetAlready = (iri: string) => iri === targetUrl || iri.startsWith(`${targetUrl}#`);
      const atTarget = datasets.flatMap((dataset, at) =>
        quadsOf(dataset).map((quad) => {
          const object = termOf(quad.object);
          const label = (value: string) => `d${at}-${value}`;
          if (quad.subject.termType !== "BlankNode" && atTargetAlready(iriOf(quad.subject.value)))
            throw new AppError("releaseForeignStatement", { subject: iriOf(quad.subject.value) });
          // So would one of the draft's own subjects named otherwise than the draft writes it, which no read of the draft has (GHSA-8w75-jg23-rxq5).
          if (quad.subject.termType !== "BlankNode" && !inPlace(urls[at]!, quad.subject.value))
            throw new AppError("draftAliasedSubject", { subject: quad.subject.value });
          // A class the draft does not keep of its subject is left out of the release, as of the draft checked (GHSA-8hh7-p2ww-mpjf).
          const typed = classStated(quad, object, iriOf);
          return {
            typed,
            quad: quadOf(
              quad.subject.termType === "BlankNode"
                ? `_:${label(quad.subject.value)}`
                : to(quad.subject.value),
              quad.predicate.value,
              object.kind === "iri"
                ? { kind: "iri", value: to(object.value) }
                : object.kind === "blank"
                  ? { kind: "blank", value: label(object.value) }
                  : object,
            ),
          };
        }),
      );
      // So would a value of one of its subjects stated otherwise than its record writes it, which no read of the draft shows (GHSA-32jq-jh7h-r7v4).
      const read = draftReadOf(draftNamedQuads(draftUrl, urls, datasets), draftUrl, {
        refuseHidden: true,
      });
      const kept = atTarget
        .filter(({ typed }) => typed === null || !read?.unkept(typed.subject, typed.object))
        .map(({ quad }) => quad);
      // The earlier versions as the release it follows states them, none later than that one (earlierVersionsOf).
      // Publishing holds that one to be the instance's or the library's, and the version before (the release check:
      // previousElsewhere, previousUnread, versionNotNext); Download .ttl reads it all the same.
      const prev = kept.find(
        ({ subject, predicate }) => subject.value === targetUrl && predicate.value === DCAT("prev"),
      )?.object.value;
      let earlier = new Map<string, DraftTriple[]>();
      if (prev !== undefined) {
        const followed = await repository.readRelease(prev);
        earlier = earlierVersionsOf(followed, targetUrl, await repository.readLinked(followed));
      }
      const quads = releaseQuadsOf(withOwnVersionsAt(kept, targetUrl, earlier), targetUrl, issued);
      const subjects = [...new Set(quads.map((quad) => keyOf(quad.subject)))];
      return turtleOf(quads, {
        base: targetUrl,
        prefixes: RELEASE_PREFIXES,
        order: [
          targetUrl,
          ...subjects.filter((subject) => !subject.startsWith(`${targetUrl}#`)),
          ...subjects,
        ],
      });
    },

    async readRelease(url, { asNoOne = false } = {}) {
      let dataset: Dataset;
      try {
        dataset = await readDataset(url, asNoOne ? published : releases);
      } catch (error) {
        throw releaseReadError(url, error);
      }
      return readReleaseQuads(quadsOf(dataset), url);
    },

    async readLinked(release) {
      const own = new Set(release.triples.map((triple) => triple.subject));
      const named = [
        release.root.inSeries,
        release.root.isVersionOf,
        release.root.publisher,
      ].filter((iri): iri is string => iri !== undefined && !own.has(iri));
      const documents = [...new Set(named.map((iri) => iri.split("#")[0]!))].filter(
        (url) => url !== release.url,
      );
      // One that cannot be read says nothing: the draft is made without it, and the release check finds what it lacks.
      const read = await Promise.all(
        documents.map((url) =>
          readDataset(url, published).then(
            (dataset) => quadsOf(dataset).map(asTriple),
            () => [],
          ),
        ),
      );
      return read.flat();
    },

    async parseRelease(text, format) {
      const base = "https://file.solid-memo.invalid/release.ttl";
      // A release file is held to what a release read from anywhere is: one past it no one could read once published.
      const quads = await parseDeckFile(text, format, base, RELEASE_LIMITS);
      // A draft keeps a release's triples as they are: one Turtle cannot write as it is would say more once saved (GHSA-x937-hx25-qfp4).
      refuseUnwritable(quads);
      const roots = [
        ...new Set(
          quads
            .filter((quad) => quad.predicate.value === RDF_TYPE && quad.object.value === SM.Deck)
            .map((quad) => quad.subject.value),
        ),
      ];
      if (roots.length !== 1 || roots[0]!.includes("#")) throw new AppError("notAReleaseFile");
      if (
        quads.some(
          (quad) =>
            quad.subject.value === roots[0] &&
            (quad.predicate.value === SM.cardsDocument ||
              quad.predicate.value === SM.reviewsDocument),
        )
      ) {
        throw new AppError("notAReleaseFile");
      }
      try {
        return readReleaseQuads(quads, roots[0]!);
      } catch (error) {
        throw error instanceof AppError && error.code === "releaseUnreadable"
          ? new AppError("notAReleaseFile")
          : error;
      }
    },

    async delete(draft) {
      const keptDocuments = await deleteDraftResources(draft.url, fetch);
      reads.delete(draft.url);
      await removeCatalogLink(draft.instanceUrl, SM.releaseDraft, draft.url, fetch);
      return { keptDocuments };
    },
  };
  return repository;
}

/** The number of each dataset read, given once: see readNumberOf. */
const READ_NUMBERS = new WeakMap<object, number>();
let readsNumbered = 0;

/**
 * A dataset's own number among those read. A document read again is
 * another dataset, so another number, unless the pod answered that it
 * is unchanged (304), which gives the dataset read before. Its ETag
 * alone would not tell two reads apart: a pod may give none, or the
 * same one for other content (GHSA-438x-f779-7chm).
 */
function readNumberOf(dataset: object): number {
  let number = READ_NUMBERS.get(dataset);
  if (number === undefined) {
    number = ++readsNumbered;
    READ_NUMBERS.set(dataset, number);
  }
  return number;
}

/** The version of a read of a draft's documents, in order: another when any of them was read anew, or one came or went. */
function versionOfDocuments(urls: readonly string[], datasets: readonly Dataset[]): string {
  return JSON.stringify(urls.map((url, at) => [url, readNumberOf(datasets[at]!)]));
}

/**
 * What a statement of a draft's document says, when it states a class of
 * a named subject: that subject and the class, as the draft names them;
 * null otherwise.
 */
function classStated(
  quad: Quad,
  object: ReleaseTerm,
  iriOf: (iri: string) => string,
): { subject: string; object: ReleaseTerm } | null {
  if (quad.subject.termType === "BlankNode" || quad.predicate.value !== RDF_TYPE) return null;
  return {
    subject: iriOf(quad.subject.value),
    object: object.kind === "iri" ? { kind: "iri", value: iriOf(object.value) } : object,
  };
}

/**
 * The statements of a draft's documents (`urls`, read as `datasets`),
 * every IRI as the draft names it, as a read of the draft takes them: a
 * subject a document names otherwise than the draft writes it there is
 * not the draft's (inPlaceIn), and is left out; publishing refuses it.
 */
function draftNamedQuads(
  draftUrl: string,
  urls: readonly string[],
  datasets: readonly Dataset[],
): Quad[] {
  const iriOf = draftIriOf(draftContainerOf(draftUrl), draftUrl);
  const inPlace = inPlaceIn(draftContainerOf(draftUrl), draftUrl);
  return datasets.flatMap((dataset, at) =>
    quadsOf(dataset).flatMap((quad) => {
      if (quad.subject.termType !== "BlankNode" && !inPlace(urls[at]!, quad.subject.value))
        return [];
      // Blank nodes are named afresh in each document: here, they are each document's own.
      const blank = (key: string) =>
        key.startsWith("_:") ? `_:d${at}-${key.slice(2)}` : iriOf(key);
      const object = termOf(quad.object);
      return quadOf(
        blank(keyOf(quad.subject)),
        quad.predicate.value,
        object.kind === "iri"
          ? { kind: "iri", value: iriOf(object.value) }
          : object.kind === "blank"
            ? { kind: "blank", value: `d${at}-${object.value}` }
            : object,
      );
    }),
  );
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
  return withSeries(
    [
      ...quads.filter(
        (quad) =>
          !(
            quad.subject.value === targetUrl &&
            UNPUBLISHED_ROOT_PREDICATES.has(quad.predicate.value)
          ),
      ),
      quadOf(targetUrl, SM.formatVersion, {
        kind: "literal",
        value: String(LATEST_VERSION.libraryDeck),
        language: "",
        datatype: "http://www.w3.org/2001/XMLSchema#integer",
      }),
      quadOf(targetUrl, DCTERMS("issued"), time),
      quadOf(targetUrl, DCTERMS("modified"), time),
    ],
    targetUrl,
  );
}

/** draftTooManyDocuments, for a draft of `count` documents: past MAX_DRAFT_DOCUMENTS, no read of it would take it. */
function refuseTooManyDocuments(count: number): void {
  if (count > MAX_DRAFT_DOCUMENTS)
    throw new AppError("draftTooManyDocuments", { limit: MAX_DRAFT_DOCUMENTS });
}

/**
 * The documents of a draft's container, those a draft has (draftLayout.ts),
 * by URL; none when it is gone (404), and draftTooManyDocuments past
 * MAX_DRAFT_DOCUMENTS.
 */
export async function draftDocumentsIn(
  draftUrl: string,
  fetch: typeof globalThis.fetch,
): Promise<string[]> {
  const documents = await listedDocumentsIn(draftUrl, fetch);
  refuseTooManyDocuments(documents.length);
  return documents;
}

/** The documents of a draft's container, those a draft has, by URL, however many it lists; none when it is gone (404). */
async function listedDocumentsIn(
  draftUrl: string,
  fetch: typeof globalThis.fetch,
): Promise<string[]> {
  const container = draftContainerOf(draftUrl);
  // The listing is read afresh, never answered from what was read before: a server whose ETag
  // outlives edits made in the same second would say a document just made is not there.
  let listing: FetchedDataset;
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
 * another app's, is kept, and so is the container holding it. Returns
 * the documents kept for another app's data in them. However many
 * documents the draft lists: one past MAX_DRAFT_DOCUMENTS, which no read
 * takes, is still the user's to delete.
 */
export async function deleteDraftResources(
  draftUrl: string,
  fetch: typeof globalThis.fetch,
): Promise<string[]> {
  const urls = await listedDocumentsIn(draftUrl, fetch);
  return deleteDocuments(draftUrl, [...urls.filter((one) => one !== draftUrl), draftUrl], fetch);
}

/**
 * Remove the draft's subjects from the documents, in order, each
 * deleted when nothing else is left in it (removeOwned, draftSubjects),
 * then the draft's containers, each only if it is then empty. Returns
 * the documents kept for what else they hold.
 */
async function deleteDocuments(
  draftUrl: string,
  urls: readonly string[],
  fetch: typeof globalThis.fetch,
): Promise<string[]> {
  const kept: string[] = [];
  for (const url of urls) {
    if ((await removeOwned(url, draftSubjects, fetch)) === "kept") kept.push(url);
  }
  const container = draftContainerOf(draftUrl);
  const named = container.slice(0, container.slice(0, -1).lastIndexOf("/") + 1);
  const drafts = named.slice(0, named.slice(0, -1).lastIndexOf("/") + 1);
  for (const one of [container, named, drafts]) {
    if (!(await deleteContainerIfEmpty(one, fetch))) break;
  }
  return kept;
}

/** An entry that comes or changes in its document, and what it was there before when it changed. */
interface MadeEntry {
  entry: DraftEntry;
  was?: DraftEntry;
}

/** For a document, the entries that leave it and those that come or change in it. */
interface DocumentChanges {
  gone: DraftEntry[];
  made: MadeEntry[];
}

/** For each document, what changes in it from the draft's entries `was` to those `now`. */
function changesByDocument(
  was: ReadonlyMap<string, DraftEntry>,
  now: ReadonlyMap<string, DraftEntry>,
): Map<string, DocumentChanges> {
  const touched = new Map<string, DocumentChanges>();
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
    if (
      old !== undefined &&
      (next === undefined || old.document !== next.document || old.subject !== next.subject)
    )
      at(old.document).gone.push(old);
    if (next !== undefined)
      at(next.document).made.push({
        entry: next,
        ...(old?.document === next.document && old.subject === next.subject ? { was: old } : {}),
      });
  }
  return touched;
}

/**
 * A document as read (`stored`, or none when it is new) with its
 * changes made, and what comes or changes in it as the document names
 * its blank nodes.
 */
function changedDocument(
  stored: Dataset | undefined,
  changes: DocumentChanges,
): { dataset: Dataset; made: MadeEntry[] } {
  const gone = changes.gone.map(inDocument);
  const made = changes.made.map(({ entry, was }) => ({
    entry: inDocument(entry),
    ...(was === undefined ? {} : { was: inDocument(was) }),
  }));
  let dataset: Dataset = stored ?? createSolidDataset();
  const blank = [
    ...gone,
    ...made.flatMap(({ entry, was }) => [entry, ...(was === undefined ? [] : [was])]),
  ].some(involvesBlank);
  // Every subject taken out, and every one written, at once (removeThings, editOf).
  const named = (entry: DraftEntry) => !entry.subject.startsWith("_:");
  const edit = editOf(
    removeAllUnlessNewer(
      dataset,
      gone.filter(named).map((entry) => entry.subject),
    ),
  );
  for (const { entry, was } of made) {
    if (named(entry)) edit.setThing(rewritten(edit.getThing(entry.subject), entry, was));
  }
  dataset = edit.done();
  if (blank) dataset = withBlankNodes(dataset, gone, made);
  return { dataset, made };
}

/** The subjects of entries their shapes describe: what the write check checks. */
function shapedSubjects(entries: readonly DraftEntry[]): string[] {
  return entries.filter((entry) => entry.shaped !== undefined).map((entry) => entry.subject);
}

function involvesBlank(entry: DraftEntry): boolean {
  return (
    entry.subject.startsWith("_:") || entry.raw.some((triple) => triple.object.kind === "blank")
  );
}

/**
 * A subject as the entry says it, from what the document has of it now
 * (`existing`): its record written over what its shape owns (recordThing,
 * which refuses what a newer app wrote), the statements it said before
 * (`was`) and does not now taken out, those it says now put in; anything
 * else the document says of it kept, but of its classes only those its
 * write keeps (withEntryClasses).
 */
function rewritten(
  existing: NamedSubject | null,
  entry: DraftEntry,
  was: DraftEntry | undefined,
): NamedSubject {
  const base =
    entry.shaped === undefined
      ? existing
      : recordThing(entry.subject, entry.shaped.descriptor, entry.shaped.record, existing);
  const tripleKey = pathKeys();
  const removed = new Set((was?.raw ?? []).map((triple) => tripleKey(tripleParts(triple))));
  const kept =
    base === null
      ? []
      : quadsOf(setThing(createSolidDataset(), base)).filter(
          (quad) => !removed.has(tripleKey(tripleParts(asTriple(quad)))),
        );
  const quads = withEntryClasses(entry, [
    ...kept,
    ...entry.raw.map((triple) => quadOf(triple.subject, triple.predicate, triple.object)),
  ]);
  // The entry says something of its subject (a record's type, or a statement): the subject is there.
  return getThing(datasetFromQuads(quads), entry.subject)!;
}

function asTriple(quad: Quad): DraftTriple {
  return {
    subject: keyOf(quad.subject),
    predicate: quad.predicate.value,
    object: termOf(quad.object),
  };
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
    object:
      one.object.kind === "blank"
        ? { kind: "blank", value: podLabel(one.object.value) }
        : one.object,
  });
  return { ...entry, subject: podLabel(entry.subject), raw: entry.raw.map(triple) };
}

/**
 * The document with the blank nodes of what changed as the entries say
 * them: those a subject that left or changed named taken out, those it
 * names now put in, as the document is written whole.
 */
function withBlankNodes(
  dataset: Dataset,
  gone: readonly DraftEntry[],
  made: readonly MadeEntry[],
): Dataset {
  const before = new Set(
    [...gone, ...made.flatMap(({ was }) => (was === undefined ? [] : [was]))]
      .filter((entry) => entry.subject.startsWith("_:"))
      .map((entry) => entry.subject),
  );
  const quads = [
    ...quadsOf(dataset).filter((quad) => !before.has(keyOf(quad.subject))),
    ...made
      .filter(({ entry }) => entry.subject.startsWith("_:"))
      .flatMap(({ entry }) => entryQuads(entry)),
  ];
  return withQuads(dataset, quads);
}

/**
 * The release at `target` with only its own versions in the series it is
 * in (`dcat:inSeries`, `dcat:isVersionOf`), each as the release it
 * follows states it (`earlier`, earlierVersionsOf): a link of the series
 * to a version (`dcat:hasVersion`, `dcat:first`, …), or any other of
 * its values that is a version, is kept only to the release or one of
 * those; what the draft states of any version but the release, linked or
 * at an address a release has (isPublishedReleaseUrl) beside it or in its
 * series, is left out, and so is what only such statements led to from
 * the release and its own subjects; and each version still linked is
 * described as the release it follows says. A draft's documents are
 * anyone's to write, and no editor or check shows a series' versions:
 * published, the release would list other addresses, or the earlier
 * versions, with notes of their choosing, as the creator's, and a
 * learner's copy of it would take a later version there for one it
 * already lists (GHSA-8frq-fhj8-9226).
 */
function withOwnVersionsAt(
  quads: readonly Quad[],
  target: string,
  earlier: ReadonlyMap<string, readonly DraftTriple[]>,
): Quad[] {
  const of = (predicate: string) =>
    quads
      .filter((quad) => quad.subject.value === target && quad.predicate.value === predicate)
      .map((quad) => quad.object.value);
  const series = new Set([...of(DCAT("inSeries")), ...of(DCAT("isVersionOf"))]);
  const isLink = ({ subject, predicate, object }: Quad) =>
    subject.termType === "NamedNode" &&
    series.has(subject.value) &&
    VERSION_LINKS.has(predicate.value) &&
    object.termType === "NamedNode";
  const own = (iri: string) => iri === target || earlier.has(iri);
  const named = (term: Quad["subject"] | Quad["object"]) =>
    term.termType === "NamedNode" ? [term.value] : [];
  const folderOf = (iri: string) => iri.slice(0, iri.lastIndexOf("/") + 1);
  const statedInSeries = new Set(
    quads
      .filter(
        ({ predicate, object }) =>
          (predicate.value === DCAT("inSeries") || predicate.value === DCAT("isVersionOf")) &&
          series.has(object.value),
      )
      .flatMap(({ subject }) => named(subject)),
  );
  // An address a release has, beside the release or stated to be in its series: one of its versions, named or not.
  const isVersionAddress = (iri: string) =>
    isPublishedReleaseUrl(iri) && (folderOf(iri) === folderOf(target) || statedInSeries.has(iri));
  // Every version named but the release and the series, whose statements are the release's own: linked, or at such
  // an address, as a subject or a value of the series.
  const versions = new Set(
    [
      ...quads.filter(isLink).map(({ object }) => object.value),
      ...earlier.keys(),
      ...quads.flatMap(({ subject }) => named(subject)).filter(isVersionAddress),
      ...quads
        .filter(({ subject }) => series.has(subject.value))
        .flatMap(({ object }) => named(object))
        .filter(isVersionAddress),
    ].filter((iri) => iri !== target && !iri.startsWith(`${target}#`) && !series.has(iri)),
  );
  const kept = quads.filter(
    (quad) =>
      !(quad.subject.termType === "NamedNode" && versions.has(quad.subject.value)) &&
      (!series.has(quad.subject.value) ||
        (VERSION_LINKS.has(quad.predicate.value)
          ? isLink(quad) && own(quad.object.value)
          : !named(quad.object).some((iri) => versions.has(iri) && !own(iri)))),
  );
  const before = reachedFrom(quads, target);
  const after = reachedFrom(kept, target);
  const linked = new Set(kept.filter(isLink).map(({ object }) => object.value));
  return [
    ...kept.filter((quad) => after.has(keyOf(quad.subject)) || !before.has(keyOf(quad.subject))),
    ...[...earlier]
      .filter(([version]) => linked.has(version))
      .flatMap(([, triples]) =>
        triples.map(({ subject, predicate, object }) => quadOf(subject, predicate, object)),
      ),
  ];
}

/** The subjects the release at `target` and its own subjects (`<target>#id`) lead to, at any depth, themselves among them. */
function reachedFrom(quads: readonly Quad[], target: string): Set<string> {
  const bySubject = new Map<string, Quad[]>();
  for (const quad of quads) {
    const key = keyOf(quad.subject);
    const of = bySubject.get(key);
    if (of === undefined) bySubject.set(key, [quad]);
    else of.push(quad);
  }
  const reached = new Set<string>();
  const queue = [...bySubject.keys()].filter(
    (key) => key === target || key.startsWith(`${target}#`),
  );
  for (const key of queue) reached.add(key);
  for (let key = queue.pop(); key !== undefined; key = queue.pop()) {
    for (const { object } of bySubject.get(key) ?? []) {
      if (object.termType !== "NamedNode" && object.termType !== "BlankNode") continue;
      const next = keyOf(object);
      if (reached.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }
  return reached;
}

/**
 * The series a release is in, described in it when the draft says it
 * starts it there (its IRI the release's own, `<#series>`), or when it
 * describes a series elsewhere that lists the version it follows
 * (`dcat:prev`), as a next version does, and is in a document in that
 * version's container or one above it (`seriesAbove`): the release its
 * last and current version, one of its versions, its title,
 * description, publisher, themes and keywords the release's
 * (docs/deck-library.md, A release outside the library). Any other
 * series elsewhere, which an index describes, is left to it, and says
 * nothing of the release: a release would otherwise make itself the
 * newest version of another's series, the version it follows only
 * claiming to be in it (GHSA-38m7-8r5j-q79f).
 */
function withSeries(quads: readonly Quad[], target: string): Quad[] {
  const of = (subject: string, predicate: string) =>
    quads.filter((quad) => quad.subject.value === subject && quad.predicate.value === predicate);
  const [series] = of(target, DCAT("inSeries")).map((quad) => quad.object.value);
  if (series === undefined) return [...quads];
  const own = series.startsWith(`${target}#`);
  const described = quads.some((quad) => quad.subject.value === series);
  const previous = new Set(of(target, DCAT("prev")).map((quad) => quad.object.value));
  const follows = of(series, DCAT("hasVersion")).some(
    (quad) => previous.has(quad.object.value) && seriesAbove(quad.object.value, series),
  );
  if (!own && !(described && follows))
    return quads.filter((quad) => !(quad.subject.value === series && quad.object.value === target));
  const replaced = new Set([
    DCAT("last"),
    DCAT("hasCurrentVersion"),
    DCTERMS("title"),
    DCTERMS("description"),
    DCTERMS("publisher"),
    DCAT("theme"),
    DCAT("keyword"),
  ]);
  const link = (predicate: string, value: string) =>
    quadOf(series, predicate, { kind: "iri", value });
  const copied = [
    DCTERMS("title"),
    DCTERMS("description"),
    DCTERMS("publisher"),
    DCAT("theme"),
    DCAT("keyword"),
  ].flatMap((predicate) =>
    of(target, predicate).map((quad) => quadOf(series, predicate, termOf(quad.object))),
  );
  const fresh = described
    ? []
    : [
        link(RDF_TYPE, DCAT("DatasetSeries")),
        link(RDF_TYPE, DCAT("Dataset")),
        quadOf(series, SM.formatVersion, {
          kind: "literal",
          value: String(LATEST_VERSION.libraryDeckSeries),
          language: "",
          datatype: "http://www.w3.org/2001/XMLSchema#integer",
        }),
        link(DCAT("first"), target),
      ];
  const versions = of(series, DCAT("hasVersion")).some((quad) => quad.object.value === target)
    ? []
    : [link(DCAT("hasVersion"), target)];
  return [
    ...quads.filter(
      (quad) => !(quad.subject.value === series && replaced.has(quad.predicate.value)),
    ),
    ...fresh,
    ...copied,
    link(DCAT("last"), target),
    link(DCAT("hasCurrentVersion"), target),
    ...versions,
  ];
}
