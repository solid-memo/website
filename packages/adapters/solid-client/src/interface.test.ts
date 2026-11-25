// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, it } from "vitest";
import { HttpError, ReadLimitError } from "./interface";

it("names an HttpError, and keeps the response and its status", () => {
  const response = new Response(null, { status: 412 });
  const cause = new Error("before");
  const error = new HttpError("Precondition failed", response, { cause });
  expect(error).toBeInstanceOf(Error);
  expect(error).toMatchObject({
    name: "HttpError",
    statusCode: 412,
    message: "Precondition failed",
  });
  expect(error.response).toBe(response);
  expect(error.cause).toBe(cause);
});

it("names a ReadLimitError's limits, those of size or the declarations and terms past them", () => {
  const url = "https://pod.example/d.ttl";
  const sized = { bytes: 10, quads: 2, characters: 30 };
  expect(new ReadLimitError(url, sized).message).toBe(
    `The document at [${url}] is larger than a read takes in: 10 bytes, 2 triples, 30 characters of terms, a few base and prefix declarations, short IRIs to resolve, a few levels of nesting and short terms.`,
  );
  expect(
    new ReadLimitError(url, {
      ...sized,
      subjects: 4,
      valuesPerPredicate: 5,
      valuesOfPredicate: new Map([["https://example.com/p", 6]]),
    }).message,
  ).toContain(
    "4 subjects, 5 values of one subject for one predicate (6 for [https://example.com/p]), ",
  );
  expect(new ReadLimitError(url, { ...sized, valuesPerPredicate: 5 }).message).toContain(
    "5 values of one subject for one predicate, ",
  );
  const unsized = new ReadLimitError(url, { ...sized, bytes: Number.POSITIVE_INFINITY });
  expect(unsized.message).toContain("longer IRIs to resolve, deeper nesting, or a longer term");
  expect(unsized.name).toBe("ReadLimitError");
});
