// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { getSolidDatasetLinear } from "./linearDataset";

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
