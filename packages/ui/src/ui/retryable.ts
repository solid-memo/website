// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "@solid-memo/domain/appError";

/** A server's status that may be different on another try: a timeout, too many requests, or its own failure. */
function passing(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** The status a pod read's error carries (@solid-memo/solid's HttpError), if it has one. */
function statusOf(error: unknown): number | undefined {
  const candidate = error as { statusCode?: number; response?: { status?: number } } | null;
  return candidate?.statusCode ?? candidate?.response?.status;
}

/**
 * Whether a failed read is worth another try. An AppError is a checked
 * outcome the same read gives again, unless the server's status it
 * carries (vars.status) may pass; so is a lasting 4xx from the pod, a
 * 401 or 403. A network failure, a 5xx, a 408 or 429, or a plain Error
 * may still pass.
 */
export function retryable(error: unknown): boolean {
  if (error instanceof AppError) {
    const status = error.vars.status;
    return typeof status === "number" && passing(status);
  }
  const status = statusOf(error);
  return status === undefined || status < 400 || passing(status);
}
