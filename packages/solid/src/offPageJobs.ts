// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { DocumentContext } from "@solid-memo/application/ports/checks";
import type { DeckFileFormat } from "@solid-memo/domain/deckFile";
import type { DraftTriple, ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { sourceOf } from "./client/rdf";
import { readDocument } from "./client/resources";
import { keyOf, quadsOf, termOf } from "./mappers/releaseDraftMapper";
import type { JobEnv, Jobs } from "./offPageServe";
import { createShaclShapeValidator, type ShaclShapeValidator } from "./shaclShapeValidator";
import { createSolidDeckArchive } from "./solidDeckArchive";
import { releaseDocumentsOf } from "./solidDeckLibrary";
import { createSolidReleaseDraftRepository } from "./solidReleaseDraftRepository";

/**
 * The fetch of the parts of an adapter a job does not use: none, as they
 * make no request (a deck file's read, the validator but over the job's
 * `data`, the drafts but for a release's reads). One that did would fail
 * at once, with nothing asked of the page.
 */
const UNUSED = undefined as unknown as typeof globalThis.fetch;

/**
 * The jobs a worker runs on documents the app did not write
 * (offPage.ts, docs/validation.md): each is the adapter's own code, as
 * the page ran it before, with the page's fetches it is sent (JobEnv).
 * The shapes a check reads, and the engines made of them, are kept for
 * the worker's next jobs: one validator holds them, reading the shapes
 * with the fetch of whichever job runs (one at a time).
 *
 * - `validateDocument`, `validateDocumentSince`, `validateRelease`: the
 *   shape validator's checks (ShapeValidator), a document read with
 *   `data`, the shapes with `site`;
 * - `readRelease`, `catalogLinks`, `isStorageRoot`: a release from a
 *   link and its creator's catalog (ReleaseDocuments), read with
 *   `release`, checked with the shapes `site` reads;
 * - `readDeckFile`: a deck file's text (DeckArchive.readDeckFile);
 * - `parseRelease`, `readDraftRelease`, `readLinked`: a release file's
 *   text, a release document anywhere and the documents it names
 *   (ReleaseDraftRepository), read with `release`;
 * - `readDocument`: a document outside the user's storages, read with
 *   `doc` as readDocument reads it (datasets.ts readElsewhere), given as
 *   the address it was read at, its version and its triples.
 */
export function offPageJobs({
  shapesFetch,
}: {
  /**
   * The shapes' fetch, in place of each job's `site`: for jobs run in
   * the page's own process, in tests, many workers sharing one
   * validator, and the shapes read once.
   */
  shapesFetch?: typeof globalThis.fetch;
} = {}): Jobs {
  let current: JobEnv | undefined;
  let validator: ShaclShapeValidator | undefined;
  const validatorOf = (env: JobEnv): ShaclShapeValidator => {
    current = env;
    validator ??= createShaclShapeValidator({
      fetch: UNUSED,
      shapesFetch: shapesFetch ?? ((input, init) => current!.fetch("site")(input, init)),
      ...env.config,
    });
    return validator;
  };
  const checking = (env: JobEnv) => validatorOf(env).over(env.fetch("data"));
  const releaseDocuments = (env: JobEnv) =>
    releaseDocumentsOf((url, dataset) => validatorOf(env).validateDataset(url, dataset, "library"));
  const drafts = (env: JobEnv) =>
    createSolidReleaseDraftRepository({
      fetch: UNUSED,
      releaseFetch: (input, init) => env.fetch("release")(input, init),
    });

  const jobs: Jobs = {
    validateDocument: (
      env: JobEnv,
      { url, context }: { url: string; context: Exclude<DocumentContext, "library"> },
    ) => checking(env).validateDocument(url, context, env.budget),
    validateDocumentSince: (
      env: JobEnv,
      {
        url,
        version,
        context,
      }: { url: string; version: string | undefined; context: DocumentContext },
    ) => checking(env).validateDocumentSince(url, version, context, env.budget),
    validateRelease: (
      env: JobEnv,
      { draft, asUrl, indexUrl }: { draft: ReleaseDraft; asUrl: string; indexUrl?: string },
    ) => checking(env).validateRelease(draft, asUrl, indexUrl),
    readRelease: (env: JobEnv, { url, check }: { url: string; check: boolean }) =>
      releaseDocuments(env).release(url, env.fetch("release"), check),
    catalogLinks: (env: JobEnv, { folder }: { folder: string }) =>
      releaseDocuments(env).catalogLinks(folder, env.fetch("release")),
    isStorageRoot: (env: JobEnv, { folder }: { folder: string }) =>
      releaseDocuments(env).isStorageRoot(folder, env.fetch("release")),
    readDeckFile: (
      _env: JobEnv,
      { text, format, baseUrl }: { text: string; format: DeckFileFormat; baseUrl: string },
    ) =>
      createSolidDeckArchive({ fetch: UNUSED, publicFetch: UNUSED }).readDeckFile(
        text,
        format,
        baseUrl,
      ),
    parseRelease: (env: JobEnv, { text, format }: { text: string; format: DeckFileFormat }) =>
      drafts(env).parseRelease(text, format),
    readDraftRelease: (env: JobEnv, { url }: { url: string }) => drafts(env).readRelease(url),
    readLinked: (env: JobEnv, { release }: { release: ReleaseDraft }) =>
      drafts(env).readLinked(release),
    readDocument: async (
      env: JobEnv,
      { url, ifNoneMatch }: { url: string; ifNoneMatch?: string },
    ) => {
      const read = await readDocument(url, { fetch: env.fetch("doc"), ifNoneMatch });
      if ("notModified" in read) return read;
      return {
        url: sourceOf(read.dataset)!.url,
        etag: read.etag,
        triples: quadsOf(read.dataset).map(
          ({ subject, predicate, object }): DraftTriple => ({
            subject: keyOf(subject),
            predicate: predicate.value,
            object: termOf(object),
          }),
        ),
      };
    },
  };
  return jobs;
}
