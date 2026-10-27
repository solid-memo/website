// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "@solid-memo/domain/appError";
import { ReadLimitError } from "./client/interface";

/**
 * The error to show for a release at `url` that could not be read:
 * releaseTooLarge when it is larger than RELEASE_LIMITS allow,
 * releaseUnreadable for any other failure.
 */
export function releaseReadError(url: string, error: unknown): AppError {
  return error instanceof ReadLimitError
    ? tooLarge(url, error)
    : new AppError("releaseUnreadable", { url });
}

/** What a read of the release at `url` failed with, as shown: releaseTooLarge past RELEASE_LIMITS, any other error as it is. */
export function shownReadError(url: string, error: unknown): unknown {
  return error instanceof ReadLimitError ? tooLarge(url, error) : error;
}

function tooLarge(url: string, { limits: { bytes, quads } }: ReadLimitError): AppError {
  return new AppError("releaseTooLarge", { url, bytes, quads });
}
