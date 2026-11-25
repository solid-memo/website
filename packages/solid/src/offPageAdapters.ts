// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { DeckArchive, ReleaseDraftRepository } from "@solid-memo/application/ports/library";
import { AppError } from "@solid-memo/domain/appError";
import { type DocumentReport, unreadableDocument } from "@solid-memo/domain/validation";
import type { DraftTriple } from "@solid-memo/domain/release/releaseDraft";
import { ReadLimitError } from "./client/interface";
import { datasetAt, withQuads } from "./client/rdf";
import type { DocumentReader } from "./datasets";
import { quadOf } from "./mappers/releaseDraftMapper";
import { FOREIGN_LIMITS, limitedFetch, limitVars, RELEASE_LIMITS } from "./client/readLimits";
import { OFF_PAGE_DEADLINE_MS, type OffPage } from "./offPage";
import { releaseReadError } from "./releaseReadError";
import type { ShaclShapeValidator } from "./shaclShapeValidator";
import { DECK_FILE_LIMITS } from "./solidDeckArchive";
import type { ReleaseDocuments } from "./solidDeckLibrary";

/**
 * The ports whose work on documents the app did not write runs off the
 * page (offPage.ts, docs/validation.md): each method sends its job to a
 * worker, which runs the adapter's own code there (offPageJobs.ts), and
 * gives what the job gives. A job that runs past its deadline, or whose
 * worker ends first, gives what the method gives for a document too
 * large to read.
 */

/** What a check off the page fails with past its deadline (offPageShapeValidator), told apart from any failure of the check. */
const PAST_DEADLINE = Symbol("pastDeadline");

/** Why a document past its deadline is unreadable. */
const CHECK_TOO_LONG = new AppError("documentCheckTooLong", {
  seconds: OFF_PAGE_DEADLINE_MS / 1000,
});

/** A document past its deadline off the page, as a read past the limits of a document from elsewhere. */
const pastDeadline = (url: string) => new ReadLimitError(url, FOREIGN_LIMITS);

/**
 * The validator with its checks of documents off the page: a document's
 * (validateDocument, validateDocumentSince), read with `fetch` there,
 * and a draft's as a release (validateRelease), its shapes read with
 * `siteFetch`; the check of what is about to be written
 * (checkSubjects), of the user's own data, and of a dataset already read
 * (validateDataset), stay as `validator` makes them. A document past its
 * deadline is reported unreadable, the deadline named as why
 * (documentCheckTooLong); a draft, as releaseTooLarge. `over` gives the
 * same over another fetch.
 */
export function offPageShapeValidator(
  offPage: OffPage,
  validator: ShaclShapeValidator,
  { fetch, siteFetch }: { fetch: typeof globalThis.fetch; siteFetch: typeof globalThis.fetch },
): ShaclShapeValidator {
  const fetches = { data: fetch, site: siteFetch };
  /** The report of a document past its deadline: unreadable, for that. */
  const unreadable = (url: string) => (error: unknown) => {
    if (error !== PAST_DEADLINE) throw error;
    return unreadableDocument(url, CHECK_TOO_LONG.message);
  };
  return {
    ...validator,
    over: (other) =>
      offPageShapeValidator(offPage, validator.over(other), { fetch: other, siteFetch }),
    validateDocument: (url, context = "pod", budget) =>
      offPage
        .run<DocumentReport>({
          job: "validateDocument",
          input: { url, context },
          fetches,
          ...(budget === undefined ? {} : { budget }),
          tooLarge: () => PAST_DEADLINE,
        })
        .catch(unreadable(url)),
    validateDocumentSince: (url, version, context = "pod", budget) =>
      offPage
        .run<Awaited<ReturnType<ShaclShapeValidator["validateDocumentSince"]>>>({
          job: "validateDocumentSince",
          input: { url, version, context },
          fetches,
          ...(budget === undefined ? {} : { budget }),
          tooLarge: () => PAST_DEADLINE,
        })
        .catch((error: unknown) => ({
          unchanged: false as const,
          value: unreadable(url)(error),
          version: null,
        })),
    validateRelease: (draft, asUrl, indexUrl) =>
      offPage.run({
        job: "validateRelease",
        input: { draft, asUrl, ...(indexUrl === undefined ? {} : { indexUrl }) },
        fetches,
        tooLarge: () => releaseReadError(asUrl, new ReadLimitError(asUrl, RELEASE_LIMITS)),
      }),
  };
}

/**
 * The reads of releases from a link, and of their creators' catalogs,
 * off the page (ReleaseDocuments): each read with the fetch it is given,
 * the release checked against the library's shapes that `siteFetch`
 * reads. One past its deadline is a release past RELEASE_LIMITS.
 */
export function offPageReleaseDocuments(
  offPage: OffPage,
  siteFetch: typeof globalThis.fetch,
): ReleaseDocuments {
  const tooLarge = (url: string) => () => new ReadLimitError(url, RELEASE_LIMITS);
  return {
    release: (url, fetch, check) =>
      offPage.run({
        job: "readRelease",
        input: { url, check },
        fetches: { release: fetch, site: siteFetch },
        tooLarge: tooLarge(url),
      }),
    catalogLinks: (folder, fetch) =>
      offPage.run({
        job: "catalogLinks",
        input: { folder },
        fetches: { release: fetch },
        tooLarge: tooLarge(folder),
      }),
    isStorageRoot: (folder, fetch) =>
      offPage.run({
        job: "isStorageRoot",
        input: { folder },
        fetches: { release: fetch },
        tooLarge: tooLarge(folder),
      }),
  };
}

/** The archive, a deck file read off the page; one past its deadline is deckFileTooLarge. Its export reads the user's own pod, in the page. */
export function offPageDeckArchive(offPage: OffPage, archive: DeckArchive): DeckArchive {
  return {
    ...archive,
    readDeckFile: (text, format, baseUrl) =>
      offPage.run({
        job: "readDeckFile",
        input: { text, format, baseUrl },
        tooLarge: () => new AppError("deckFileTooLarge", limitVars(DECK_FILE_LIMITS)),
      }),
  };
}

/**
 * The drafts, with what they read of documents anywhere off the page: a
 * release file's text (parseRelease), a release document
 * (readRelease) and the documents it names (readLinked), each read
 * with the fetch `drafts` reads it with, under RELEASE_LIMITS in the
 * page too. Past its deadline, a file is deckFileTooLarge, a release
 * releaseTooLarge, and the documents it names give nothing. The
 * drafts themselves are the user's, read in the page.
 */
export function offPageReleaseDrafts(
  offPage: OffPage,
  drafts: ReleaseDraftRepository,
  {
    releaseFetch,
    publicFetch,
  }: { releaseFetch: typeof globalThis.fetch; publicFetch: typeof globalThis.fetch },
): ReleaseDraftRepository {
  const releases = limitedFetch(releaseFetch, RELEASE_LIMITS);
  const published = limitedFetch(publicFetch, RELEASE_LIMITS);
  return {
    ...drafts,
    parseRelease: (text, format) =>
      offPage.run({
        job: "parseRelease",
        input: { text, format },
        tooLarge: () => new AppError("deckFileTooLarge", limitVars(RELEASE_LIMITS)),
      }),
    readRelease: (url, { asNoOne = false } = {}) =>
      offPage.run({
        job: "readDraftRelease",
        input: { url },
        fetches: { release: asNoOne ? published : releases },
        tooLarge: () => releaseReadError(url, new ReadLimitError(url, RELEASE_LIMITS)),
      }),
    readLinked: (release) =>
      offPage
        .run<Awaited<ReturnType<ReleaseDraftRepository["readLinked"]>>>({
          job: "readLinked",
          input: { release },
          fetches: { release: published },
          tooLarge: () => new ReadLimitError(release.url, RELEASE_LIMITS),
        })
        .catch((error: unknown) => {
          if (error instanceof ReadLimitError) return [];
          throw error;
        }),
  };
}

/**
 * A document outside the user's storages read off the page, as
 * readDocument reads it (datasets.ts readElsewhere), its requests made
 * with the fetch it is given: the worker parses it, under the limits
 * the page reads it under, and gives its triples, which the page makes
 * into the dataset of the address it was read at, in one pass. What the
 * page then makes of it, and writes back, is as for any other read. One
 * past its deadline is a document past FOREIGN_LIMITS.
 */
export function offPageDocumentReader(offPage: OffPage): DocumentReader {
  return async (url, { fetch, ifNoneMatch }) => {
    const read = await offPage.run<
      { notModified: true } | { url: string; etag: string | undefined; triples: DraftTriple[] }
    >({
      job: "readDocument",
      input: { url, ...(ifNoneMatch === undefined ? {} : { ifNoneMatch }) },
      fetches: { doc: fetch },
      tooLarge: () => pastDeadline(url),
    });
    if ("notModified" in read) return read;
    const quads = read.triples.map(({ subject, predicate, object }) =>
      quadOf(subject, predicate, object),
    );
    return { dataset: withQuads(datasetAt(read.url), quads), etag: read.etag };
  };
}
