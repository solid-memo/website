// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The storages a profile names are found in time that grows with the
 * documents it names as more of the profile, not their square, against a
 * pod in memory: a WebID document that names an extended profile of many
 * triples. Eight times as many must take less than four times as long as
 * an eighth of them done eight times over (testing.md); what puts the
 * documents in place is not timed (growthAfterSetup). Past PROFILE_LIMITS,
 * a profile document is not read at all, nor are the further documents
 * past them together, nor those past MAX_PROFILE_DOCUMENTS sent.
 */
import { describe, expect, it } from "vitest";
import { growthAfterSetup } from "@solid-memo/domain/testing/growth";
import { MAX_PROFILE_DOCUMENTS, PROFILE_LIMITS } from "./client/readLimits";
import { getProfileStorages } from "./client/resources";
import { ReadLimitError } from "./client/interface";
import { createSolidStorageGateway } from "./solidStorageGateway";
import { fakePod } from "./testing/fakePod";

const CARD = "https://alice.example/profile/card";
const WEBID = `${CARD}#me`;
const EXTENDED = "https://alice.example/settings/extended.ttl";
const PIM_STORAGE = "http://www.w3.org/ns/pim/space#storage";

/** `count` plain triples, then the WebID's storage, `storage`. */
function extended(count: number, storage = "https://alice.example/"): string {
  let ttl = "";
  for (let i = 0; i < count; i++) ttl += `<#s${i}> <http://example.org/p> "value ${i}" .\n`;
  return `${ttl}<${WEBID}> <${PIM_STORAGE}> <${storage}> .\n`;
}

/** The `i`th of many further profile documents, and the storage it names. */
const further = (i: number) => `https://alice.example/settings/extended-${i}.ttl`;
const storageOf = (i: number) => `https://alice.example/storage-${i}/`;

/**
 * A pod whose WebID document names its own storage and `documents` further
 * profile documents of `count` triples each, each naming a storage of
 * its own, and how many requests the gateway sent.
 */
async function manyProfilesPod(documents: number, count: number, card = "") {
  const pod = fakePod();
  card += `<#me> <${PIM_STORAGE}> <https://storage.example/alice/> .\n`;
  for (let i = 0; i < documents; i++) {
    card += `<#me> <http://www.w3.org/2000/01/rdf-schema#seeAlso> <${further(i)}> .\n`;
    await pod.put(further(i), extended(count, storageOf(i)));
  }
  await pod.put(CARD, card);
  const sent: string[] = [];
  const gateway = createSolidStorageGateway({
    fetch: (input, init) => {
      sent.push(String(input));
      return documentsOf(pod)(input, init);
    },
    profileStorages: getProfileStorages,
  });
  return { gateway, sent };
}

/** The pod's fetch, which sends a URL without its fragment, as a browser's does. */
function documentsOf(pod: ReturnType<typeof fakePod>): typeof globalThis.fetch {
  return (input, init) => pod.fetch(String(input).split("#")[0]!, init);
}

/** A pod whose WebID document names an extended profile of `count` triples (rdfs:seeAlso). */
async function profilePod(count: number, card = "") {
  const pod = fakePod();
  await pod.put(
    CARD,
    `<#me> <http://www.w3.org/2000/01/rdf-schema#seeAlso> <${EXTENDED}> .\n${card}`,
  );
  await pod.put(EXTENDED, extended(count));
  return createSolidStorageGateway({
    fetch: documentsOf(pod),
    profileStorages: getProfileStorages,
  });
}

describe("discoverStorages", () => {
  it("finds the storages an extended profile names", async () => {
    await expect((await profilePod(3)).discoverStorages(WEBID)).resolves.toEqual([
      { url: "https://alice.example/", source: "profile" },
    ]);
  });

  it("reads a large extended profile in time that grows with it, not its square", async () => {
    const ratio = await growthAfterSetup(
      (count) => async () => {
        const gateway = await profilePod(count);
        return () => gateway.discoverStorages(WEBID);
      },
      1000,
      8,
    );
    expect(ratio).toBeLessThan(4);
  }, 120_000);

  it("leaves out an extended profile past the limits, the WebID document's storages still found", async () => {
    const gateway = await profilePod(
      PROFILE_LIMITS.quads,
      `<#me> <${PIM_STORAGE}> <https://storage.example/alice/> .\n`,
    );
    await expect(gateway.discoverStorages(WEBID)).resolves.toEqual([
      { url: "https://storage.example/alice/", source: "profile" },
    ]);
  });

  it("refuses a WebID document past the limits", async () => {
    const pod = fakePod();
    await pod.put(CARD, extended(PROFILE_LIMITS.quads));
    const gateway = createSolidStorageGateway({
      fetch: documentsOf(pod),
      profileStorages: getProfileStorages,
    });
    await expect(gateway.discoverStorages(WEBID)).rejects.toBeInstanceOf(ReadLimitError);
  });

  it("reads the further profile documents under PROFILE_LIMITS together", async () => {
    // Each under the limits, four times as many triples as they allow all together.
    const documents = 8;
    const { gateway } = await manyProfilesPod(documents, PROFILE_LIMITS.quads / 2);
    const found = (await gateway.discoverStorages(WEBID)).map(({ url }) => url);
    expect(found).toContain("https://storage.example/alice/");
    expect(found.length).toBeLessThanOrEqual(2);
  });

  it("reads no more than MAX_PROFILE_DOCUMENTS further profile documents", async () => {
    const { gateway, sent } = await manyProfilesPod(MAX_PROFILE_DOCUMENTS + 4, 1);
    const found = (await gateway.discoverStorages(WEBID)).map(({ url }) => url);
    expect(found).toEqual([
      "https://storage.example/alice/",
      ...Array.from({ length: MAX_PROFILE_DOCUMENTS }, (_, i) => storageOf(i)),
    ]);
    expect(sent).not.toContain(further(MAX_PROFILE_DOCUMENTS));
    expect(sent.filter((url) => url.startsWith("https://alice.example/settings/"))).toHaveLength(
      MAX_PROFILE_DOCUMENTS,
    );
  });

  it("counts only the further profile documents it sends to MAX_PROFILE_DOCUMENTS", async () => {
    // Documents outside the profile's places come first, are not sent, and use up none of the count.
    let outside = "";
    for (let i = 0; i < MAX_PROFILE_DOCUMENTS; i++) {
      outside += `<#me> <http://www.w3.org/2000/01/rdf-schema#seeAlso> <https://elsewhere.example/${i}.ttl> .\n`;
    }
    const { gateway, sent } = await manyProfilesPod(1, 1, outside);
    const found = (await gateway.discoverStorages(WEBID)).map(({ url }) => url);
    expect(found).toEqual(["https://storage.example/alice/", storageOf(0)]);
    expect(sent.some((url) => url.startsWith("https://elsewhere.example/"))).toBe(false);
  });
});
