// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { readTurtleDocument } from "./turtleDocument";

const URL_ = "https://example.org/shapes/deck.ttl";

/** A fetch that answers every request with the given Turtle, from the URL asked. */
function turtleFetch(turtle: string): typeof fetch {
  return async (input) => {
    const response = new Response(turtle, { headers: { "Content-Type": "text/turtle" } });
    Object.defineProperty(response, "url", { value: String(input) });
    return response;
  };
}

describe("readTurtleDocument", () => {
  it("parses the document, relative IRIs against the response's URL", async () => {
    const dataset = await readTurtleDocument(
      URL_,
      turtleFetch('<#it> <https://schema.org/name> "Deck" ; <https://schema.org/about> <../x> .'),
    );
    const quads = [...dataset];
    expect(quads).toHaveLength(2);
    expect(quads.every((q) => q.subject.value === `${URL_}#it`)).toBe(true);
    expect(quads.map((q) => q.object.value)).toEqual(
      expect.arrayContaining(["Deck", "https://example.org/x"]),
    );
  });

  it("falls back to the requested URL when the response has none", async () => {
    const fetch = vi.fn(async () => new Response("<a> <b> <c> ."));
    const [quad] = [...(await readTurtleDocument(URL_, fetch))];
    expect(quad?.subject.value).toBe("https://example.org/shapes/a");
  });

  it("asks for Turtle through the given fetch", async () => {
    const fetch = vi.fn(async () => new Response(""));
    await readTurtleDocument(URL_, fetch);
    expect(fetch).toHaveBeenCalledWith(URL_, { headers: { Accept: "text/turtle" } });
  });

  it("rejects with the status when the response isn't OK", async () => {
    const fetch = async () => new Response("gone", { status: 404, statusText: "Not Found" });
    const read = readTurtleDocument(URL_, fetch);
    await expect(read).rejects.toThrow(
      `Fetching the Resource at [${URL_}] failed: [404] [Not Found] gone.`,
    );
    await expect(read).rejects.toMatchObject({ statusCode: 404, statusText: "Not Found" });
  });

  it("rejects on Turtle it cannot parse", async () => {
    await expect(readTurtleDocument(URL_, turtleFetch("<a> <b> ."))).rejects.toThrow();
  });
});
