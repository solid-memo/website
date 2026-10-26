// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "@solid-memo/domain/appError";
import { describe, expect, it } from "vitest";
import { retryable } from "./retryable";

/** An error as a failed read of a pod throws it (an HttpError), with the response's status. */
function inruptError(statusCode: number): Error {
  return Object.assign(new Error(`Fetching the Resource failed: ${statusCode}.`), { statusCode });
}

describe("retryable", () => {
  it("gives up on an AppError, unless the status it carries may pass", () => {
    expect(retryable(new AppError("deckGone", { deck: "Capitals" }))).toBe(false);
    expect(
      retryable(new AppError("cannotCheck", { url: "https://pod.example/", status: 403 })),
    ).toBe(false);
    expect(
      retryable(new AppError("cannotCheck", { url: "https://pod.example/", status: 503 })),
    ).toBe(true);
  });

  it("gives up on a lasting 4xx from the pod, but not on a 429 or a 5xx", () => {
    expect(retryable(inruptError(401))).toBe(false);
    expect(retryable(inruptError(403))).toBe(false);
    expect(retryable(inruptError(408))).toBe(true);
    expect(retryable(inruptError(429))).toBe(true);
    expect(retryable(inruptError(503))).toBe(true);
  });

  it("reads the status of a response the error carries", () => {
    expect(retryable(Object.assign(new Error("Not found"), { response: { status: 404 } }))).toBe(
      false,
    );
    expect(retryable(Object.assign(new Error("Moved"), { response: { status: 304 } }))).toBe(true);
  });

  it("tries again after a network failure or a plain Error", () => {
    expect(retryable(new TypeError("Failed to fetch"))).toBe(true);
    expect(retryable(new Error("Something broke"))).toBe(true);
    expect(retryable(null)).toBe(true);
  });
});
