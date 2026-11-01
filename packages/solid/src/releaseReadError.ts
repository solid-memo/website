// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "@solid-memo/domain/appError";
import { releaseHost } from "@solid-memo/domain/library";
import { ReadLimitError } from "./client/interface";

/** What a release at `url` read past its limits is shown as (releaseReadError, shownReadError). */
export type TooLarge = (url: string, error: ReadLimitError) => AppError;

/**
 * The error to show for a release at `url` that could not be read:
 * releaseTooLarge when it is larger than RELEASE_LIMITS allow (or as
 * `tooLarge` says), releaseUnreadable for any other failure.
 */
export function releaseReadError(
  url: string,
  error: unknown,
  tooLarge: TooLarge = releaseTooLarge,
): AppError {
  return error instanceof ReadLimitError
    ? tooLarge(url, error)
    : new AppError("releaseUnreadable", { url });
}

/** What a read of the release at `url` failed with, as shown: releaseTooLarge past RELEASE_LIMITS (or as `tooLarge` says), any other error as it is. */
export function shownReadError(
  url: string,
  error: unknown,
  tooLarge: TooLarge = releaseTooLarge,
): unknown {
  return error instanceof ReadLimitError ? tooLarge(url, error) : error;
}

function releaseTooLarge(url: string, { limits: { bytes, quads } }: ReadLimitError): AppError {
  return new AppError("releaseTooLarge", { url, bytes, quads });
}

/**
 * Releases read under one release's limits together (DeckLibrary.linkedReads)
 * past them: linkedReleasesTooLarge, of them all, as the one that went past
 * them may be within a release's limits on its own.
 */
export function linkedReleasesTooLarge(url: string): AppError {
  return new AppError("linkedReleasesTooLarge", { host: releaseHost(url) });
}
