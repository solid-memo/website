// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { getSolidDatasetLinear } from "./linearDataset";
import {
  boundedHeader,
  boundedHeadersFetch,
  MAX_DESCRIBING_HEADER_LENGTH,
  withBoundedHeaders,
} from "./linkHeader";

const URL_ = "https://pod.example/decks/deck.ttl";

/** A Link header with a long run of white space in it, which the library's parser reads in time growing with its square. */
const LONG_LINK = `<a>; rel="x"${"\t".repeat(250_000)}x`;

const ACL_LINK = '<deck.ttl.acl>; rel="acl"';

function answer(
  headers: Record<string, string>,
  body: string | null = "<#a> <#b> <#c> .",
): Response {
  const response = new Response(body, {
    status: 200,
    statusText: "Fine",
    headers: { "Content-Type": "text/turtle", ...headers },
  });
  Object.defineProperty(response, "url", { value: URL_ });
  return response;
}

describe("boundedHeader", () => {
  it("gives a header up to the bound, and none past it", () => {
    const atBound = "x".repeat(MAX_DESCRIBING_HEADER_LENGTH);
    expect(boundedHeader(answer({ Link: atBound }), "Link")).toBe(atBound);
    expect(boundedHeader(answer({ Link: `${atBound}x` }), "Link")).toBeNull();
    expect(boundedHeader(answer({}), "Link")).toBeNull();
  });
});

describe("withBoundedHeaders", () => {
  it("gives the same response when no header is past the bound", () => {
    const response = answer({ Link: ACL_LINK, "WAC-Allow": 'user="read"' });
    expect(withBoundedHeaders(response)).toBe(response);
  });

  it("drops a Link or WAC-Allow header past the bound, and keeps the rest of the response", async () => {
    const response = answer({
      Link: LONG_LINK,
      "WAC-Allow": `user="${"read ".repeat(MAX_DESCRIBING_HEADER_LENGTH)}"`,
      ETag: '"v1"',
    });
    const bounded = withBoundedHeaders(response);
    expect(bounded.headers.get("Link")).toBeNull();
    expect(bounded.headers.get("WAC-Allow")).toBeNull();
    expect(bounded.headers.get("ETag")).toBe('"v1"');
    expect(bounded.status).toBe(200);
    expect(bounded.statusText).toBe("Fine");
    expect(bounded.url).toBe(URL_);
    expect(await bounded.text()).toBe("<#a> <#b> <#c> .");
    const onlyLink = withBoundedHeaders(answer({ Link: LONG_LINK, "WAC-Allow": 'user="read"' }));
    expect(onlyLink.headers.get("WAC-Allow")).toBe('user="read"');
  });
});

describe("boundedHeadersFetch", () => {
  it("gives the fetch's responses with their headers bounded", async () => {
    const fetch = vi.fn(async () => answer({ Link: LONG_LINK }, null));
    const response = await boundedHeadersFetch(fetch)(URL_, { method: "HEAD" });
    expect(fetch).toHaveBeenCalledWith(URL_, { method: "HEAD" });
    expect(response.headers.get("Link")).toBeNull();
  });
});

describe("getSolidDatasetLinear, with a long header", () => {
  it("reads a document whose Link header is past the bound promptly, as one with no links", async () => {
    const dataset = await getSolidDatasetLinear(URL_, {
      fetch: async () => answer({ Link: LONG_LINK }),
    });
    expect(Object.keys(dataset.graphs.default)).toEqual([`${URL_}#a`]);
    expect(dataset.internal_resourceInfo.linkedResources).toEqual({});
  }, 5_000);

  it("still reads a Link and WAC-Allow header within the bound", async () => {
    const dataset = await getSolidDatasetLinear(URL_, {
      fetch: async () => answer({ Link: ACL_LINK, "WAC-Allow": 'user="read",public=""' }),
    });
    expect(dataset.internal_resourceInfo.aclUrl).toBe(`${URL_}.acl`);
    expect(dataset.internal_resourceInfo.permissions?.user.read).toBe(true);
  });
});
