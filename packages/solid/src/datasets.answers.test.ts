// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

// @vitest-environment node

import { describe, expect, it } from "vitest";
import { getThing } from "./client/rdf";
import { readDataset, readsAsNone } from "./datasets";

/**
 * Reads of a document through the real Solid client library (client/),
 * with the runtime's own Response, as a browser's fetch gives one: what
 * a read takes from an answer, and what it fails with when the body of
 * one fails on its way.
 */

const URL_ = "https://pod.example/doc.ttl";

/** A fetch whose Turtle answer has `status` and `body`. */
function answering(status: number, body: BodyInit): typeof globalThis.fetch {
  return async () => {
    const response = new Response(body, { status, headers: { "Content-Type": "text/turtle" } });
    Object.defineProperty(response, "url", { value: URL_ });
    return response;
  };
}

/** A body that sends part of a document, and then fails with `reason`. */
function failingBody(reason: unknown): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start: (controller) => controller.enqueue(new TextEncoder().encode("<#a> <#b> ")),
    pull: (controller) => controller.error(reason),
  });
}

describe("readDataset, with the runtime's own answers", () => {
  it.each([200, 203, 206])("reads a whole %i answer", async (status) => {
    const dataset = await readDataset(URL_, answering(status, "<#a> <#b> <#c> ."));

    expect(getThing(dataset, `${URL_}#a`)).not.toBeNull();
  });

  it.each([200, 203, 404, 500])(
    "fails as the body of a %i answer fails, which is not none",
    async (status) => {
      const reason = new Error("cancelled");

      const failure = await readDataset(URL_, answering(status, failingBody(reason))).catch(
        (error: unknown) => error,
      );

      expect(failure).toBe(reason);
      expect(readsAsNone(failure)).toBe(false);
    },
  );
});
