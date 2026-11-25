// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/*
 * The driven ports of checking what is read against Solid Memo's shapes, and of the reads a check may take. The shacl adapter implements them, through the solid adapters.
 */

import type { DocumentReport } from "@solid-memo/domain/validation";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import type { ReleaseProblem } from "@solid-memo/domain/release/problems";
import type { Since } from "./shared";

/**
 * Where a document checked is: an instance's own ("pod"), a release's
 * draft ("draft"), whose deck, chapters and steps the draft shapes check,
 * or a release ("library"), which the library shapes check, as a release
 * added from a link is (docs/validation.md).
 */
export type DocumentContext = "pod" | "draft" | "library";

/**
 * A budget of time for some reads, as one data check has for those of
 * documents outside the instance's folder (readBudget.ts): what a read
 * gives, or `otherwise` once the budget is spent before it does. None is
 * started after it is spent. A read given up on may go on, within its
 * own read deadlines, but nothing waits on it any longer.
 */
export interface ReadBudget {
  spend<T>(otherwise: T, read: () => Promise<T>): Promise<T>;
}

/**
 * The reads of documents that data checks share (instanceChecks.ts
 * sharedReads): `read` of the document at `url` is made once, and what
 * it gives is given to every check that asks for it again, by any
 * spelling of its address a request sends the same way, until the
 * document is to be read afresh. A read that fails is kept failed until
 * then too, so the checks that ask for it again are told so without
 * reading it again. Every read of one document must give the same: the
 * document as the user reads it, read at its address as a request sends
 * it (canonicalUrlOf), so that what is read is resolved against one
 * spelling, whichever check asked first.
 */
export type SharedReads = <T>(url: string, read: () => Promise<T>) => Promise<T>;

export interface ShapeValidator {
  /**
   * The report on a document of an instance's, read as the instance's
   * documents are; a release is checked as DeckLibrary.readRelease reads
   * it, never read again here. A document that cannot be read (refused,
   * or not data that can be read) is reported "unreadable", not thrown:
   * only what fails the whole check, its shapes say, throws. With
   * `budget`, one not read before it is spent is reported unreadable
   * too, as a server that did not answer in time.
   */
  validateDocument(
    url: string,
    context?: Exclude<DocumentContext, "library">,
    budget?: ReadBudget,
  ): Promise<DocumentReport>;
  /**
   * The document's report unless it is still at `version` (undefined:
   * check it); one that cannot be read as validateDocument says, with no
   * version. With `budget`, as validateDocument says of it.
   */
  validateDocumentSince(
    url: string,
    version: string | undefined,
    context?: DocumentContext,
    budget?: ReadBudget,
  ): Promise<Since<DocumentReport>>;
  /**
   * What the shapes say of a draft as the release it will be, published
   * at `asUrl` (docs/studio.md, The release check): the release as it is
   * assembled, every subject moved there, each subject of a Solid Memo
   * class checked against its library shape, and the whole against
   * DCAT-AP and SKOS with the reference data. With `indexUrl`, a
   * library's index is beside it, the release's series in it (described
   * there for a release it does not list yet). Each problem names its
   * subject in the draft.
   */
  validateRelease(draft: ReleaseDraft, asUrl: string, indexUrl?: string): Promise<ReleaseProblem[]>;
}
