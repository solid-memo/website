// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { FetchError, getSolidDataset as libraryGetSolidDataset } from "@inrupt/solid-client";
import { describe, expect, it } from "vitest";
import { resourcesContract } from "../testing/contract/resources";
import { HttpError } from "./interface";
import * as rdf from "./rdf";
import * as resources from "./resources";

resourcesContract({ rdf, resources });

const URL_ = "https://pod.example/decks/deck.ttl";

/** A missing document's answer. */
const missing: typeof globalThis.fetch = async (input) => {
  const response = new Response("", { status: 404 });
  Object.defineProperty(response, "url", { value: String(input) });
  return response;
};

describe("HttpError, over the library", () => {
  it("has the library's message, and the library's error as its cause", async () => {
    const expected = await libraryGetSolidDataset(URL_, { fetch: missing }).then(
      () => null,
      (failure: Error) => failure.message,
    );
    const error = await resources
      .getSolidDataset(URL_, { fetch: missing })
      .catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).message).toBe(expected);
    expect((error as HttpError).cause).toBeInstanceOf(FetchError);
    expect((error as HttpError).cause).toHaveProperty("message", expected);
  });
});
