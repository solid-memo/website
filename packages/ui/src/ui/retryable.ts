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
 * carries (vars.status) may pass, or the server did not answer in time
 * (podNoAnswer); so is a lasting 4xx from the pod, a 401 or 403. A
 * server that asked the app to slow down (podBusy) is waited for and
 * tried again at the gate in the fetch chain, for minutes, before the
 * read fails (docs/architecture.md#a-request-on-its-way-to-a-pod): a
 * try more at once would only go into the same limit, so it is shown. A
 * network failure, a 5xx, a 408 or 429, or a plain Error may still pass.
 */
export function retryable(error: unknown): boolean {
  if (error instanceof AppError) {
    if (error.code === "podNoAnswer") return true;
    const status = error.vars.status;
    return typeof status === "number" && passing(status);
  }
  const status = statusOf(error);
  return status === undefined || status < 400 || passing(status);
}

/** The longest wait before a failed read is tried again, in milliseconds. */
const RETRY_DELAY_CAP_MS = 30_000;

/**
 * How long a read that failed `count` times before waits for its next
 * try, in milliseconds: TanStack Query's own wait, from 1 s doubling up
 * to RETRY_DELAY_CAP_MS, but half of it at random, so the reads a screen
 * made together aren't tried again together, into the same server's
 * rate limit.
 */
export function retryDelay(count: number, random: () => number = Math.random): number {
  const full = Math.min(RETRY_DELAY_CAP_MS, 1000 * 2 ** count);
  return full / 2 + (random() * full) / 2;
}
