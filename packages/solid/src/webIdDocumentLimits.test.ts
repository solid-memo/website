// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Every reader of the WebID document holds it to PROFILE_LIMITS: the
 * storage lookup, the identity provider's lookup, the document's own
 * view (the account's name and the developer tools) and the type index
 * lookup (the instance list, the registration options and the link to a
 * new index). A WebID document past them is refused by each, against a
 * pod in memory, through the swappable client.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReadLimitError } from "./client/interface";
import { PROFILE_LIMITS } from "./client/readLimits";
import { getProfileStorages } from "./client/resources";
import { createSolidInstanceRepository } from "./solidInstanceRepository";
import { createSolidSessionGateway } from "./solidSessionGateway";
import { createSolidStorageGateway } from "./solidStorageGateway";
import { createSolidWebIdDocumentRepository } from "./solidWebIdDocumentRepository";
import { fakePod } from "./testing/fakePod";
import { fakeSessionClient } from "./testing/fakeSessionClient";
import { createTypeIndex, locateTypeIndexes } from "./typeIndex";

const CARD = "https://alice.example/profile/card";
const WEBID = `${CARD}#me`;

/** `count` plain triples. */
function filler(count: number): string {
  let ttl = "";
  for (let i = 0; i < count; i++) ttl += `<#s${i}> <http://example.org/p> "value ${i}" .\n`;
  return ttl;
}

/** A WebID document of `count` plain triples, then the WebID's issuer, name and storage. */
function card(count: number): string {
  return `${filler(count)}<#me> <http://www.w3.org/ns/solid/terms#oidcIssuer> <https://idp.example/> ;
  <http://xmlns.com/foaf/0.1/name> "Alice" ;
  <http://www.w3.org/ns/pim/space#storage> <https://alice.example/> .\n`;
}

/** The readers of the WebID document, all over a pod whose WebID document is `card(count)`. */
async function readers(count: number) {
  const pod = fakePod();
  await pod.put(CARD, card(count));
  // The pod's fetch, which sends a URL without its fragment, as a browser's does.
  const fetch: typeof globalThis.fetch = (input, init) =>
    pod.fetch(String(input).split("#")[0]!, init);
  // The identity provider's lookup reads unauthenticated, through the browser's fetch.
  vi.stubGlobal("fetch", fetch);
  const client = fakeSessionClient();
  return {
    client,
    storage: createSolidStorageGateway({ fetch, profileStorages: getProfileStorages }),
    session: createSolidSessionGateway({
      clientName: "Test App",
      site: "https://memo.example/",
      client,
    }),
    webIdDocument: createSolidWebIdDocumentRepository({ fetch }),
    instances: createSolidInstanceRepository({
      fetch,
      publicFetch: fetch,
      now: () => new Date(0),
      randomId: () => "id",
    }),
    pod,
    fetch,
  };
}

describe("the WebID document's readers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("read a WebID document within PROFILE_LIMITS", async () => {
    const { storage, session, webIdDocument, instances } = await readers(3);
    await expect(storage.discoverStorages(WEBID)).resolves.toEqual([
      { url: "https://alice.example/", source: "profile" },
    ]);
    await expect(session.discoverOidcIssuer(WEBID)).resolves.toBe("https://idp.example/");
    await expect(webIdDocument.fetchWebIdDocument(WEBID)).resolves.toMatchObject({ url: CARD });
    await expect(instances.listInstances(WEBID)).resolves.toEqual([]);
  });

  it("each refuse a WebID document past PROFILE_LIMITS", async () => {
    const { client, storage, session, webIdDocument, instances } = await readers(
      PROFILE_LIMITS.quads,
    );
    await expect(storage.discoverStorages(WEBID)).rejects.toBeInstanceOf(ReadLimitError);
    await expect(session.discoverOidcIssuer(WEBID)).rejects.toBeInstanceOf(ReadLimitError);
    await expect(session.login(WEBID)).rejects.toBeInstanceOf(ReadLimitError);
    expect(client.login).not.toHaveBeenCalled();
    await expect(webIdDocument.fetchWebIdDocument(WEBID)).rejects.toBeInstanceOf(ReadLimitError);
    await expect(instances.listInstances(WEBID)).rejects.toBeInstanceOf(ReadLimitError);
    await expect(instances.getRegistrationOptions(WEBID)).rejects.toBeInstanceOf(ReadLimitError);
  });

  it("refuse to link a new type index from a WebID document grown past PROFILE_LIMITS", async () => {
    const { pod, fetch } = await readers(3);
    // The storage lookup reads the document within the limits; the link to the new index reads it grown past them.
    let reads = 0;
    const growing: typeof globalThis.fetch = async (input, init) => {
      if ((init?.method ?? "GET") === "GET" && String(input).startsWith(CARD) && ++reads === 2) {
        await pod.put(CARD, card(PROFILE_LIMITS.quads));
      }
      return fetch(input, init);
    };
    await expect(
      createTypeIndex("public", WEBID, "https://alice.example/memo/", growing),
    ).rejects.toBeInstanceOf(ReadLimitError);
    expect(reads).toBe(2);
  });

  it("leave out an extended profile document past PROFILE_LIMITS", async () => {
    const { pod, fetch } = await readers(3);
    const extended = "https://alice.example/profile/extended";
    await pod.put(
      CARD,
      `${card(3)}<#me> <http://www.w3.org/2000/01/rdf-schema#seeAlso> <${extended}> .\n`,
    );
    const link = `<${WEBID}> <http://www.w3.org/ns/solid/terms#publicTypeIndex> <https://alice.example/settings/publicTypeIndex.ttl> .\n`;
    await pod.put(extended, `${filler(PROFILE_LIMITS.quads)}${link}`);
    await expect(locateTypeIndexes(WEBID, fetch, fetch)).resolves.toMatchObject({
      publicIndexUrl: null,
    });
    await pod.put(extended, link);
    await expect(locateTypeIndexes(WEBID, fetch, fetch)).resolves.toMatchObject({
      publicIndexUrl: "https://alice.example/settings/publicTypeIndex.ttl",
    });
  });
});
