// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The storages a profile names, found in the documents it names as more
 * of the profile, against a pod in memory. Past PROFILE_LIMITS, a profile
 * document is not read at all, nor are the further documents past them
 * together, nor those past MAX_PROFILE_DOCUMENTS sent. That they are
 * found in time that grows with the profile is
 * solidStorageGateway.growth.test.ts's.
 */
import { describe, expect, it } from "vitest";
import { ReadLimitError } from "@solid-memo/solid-client/interface";
import { MAX_PROFILE_DOCUMENTS, PROFILE_LIMITS } from "@solid-memo/solid-client/readLimits";
import { getProfileStorages } from "@solid-memo/solid-client/resources";
import { createSolidStorageGateway } from "./solidStorageGateway";
import { fakePod } from "./testing/fakePod";
import {
  CARD,
  documentsOf,
  EXTENDED,
  extended,
  PIM_STORAGE,
  profilePod,
  WEBID,
} from "./testing/profilePod";

/** The `i`th of many further profile documents, and the storage it names. */
const further = (i: number) => `https://pod.example/alice/settings/extended-${i}.ttl`;
const storageOf = (i: number) => `https://pod.example/alice/storage-${i}/`;

/**
 * A pod whose WebID document names its own storage and `documents` further
 * profile documents of `count` triples each, each naming a storage of
 * its own inside it, and how many requests the gateway sent.
 */
async function manyProfilesPod(documents: number, count: number, card = "") {
  const pod = fakePod();
  card += `<#me> <${PIM_STORAGE}> <https://pod.example/alice/> .\n`;
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

describe("discoverStorages", () => {
  it("finds the storages an extended profile names", async () => {
    await expect((await profilePod(3)).discoverStorages(WEBID)).resolves.toEqual([
      { url: "https://pod.example/alice/", source: "profile" },
    ]);
  });

  it("leaves out an extended profile past the limits, the WebID document's storages still found", async () => {
    const gateway = await profilePod(
      PROFILE_LIMITS.quads,
      `<#me> <${PIM_STORAGE}> <https://pod.example/alice/>, <https://storage.example/alice/> .\n`,
    );
    await expect(gateway.discoverStorages(WEBID)).resolves.toEqual([
      { url: "https://pod.example/alice/", source: "profile" },
      { url: "https://storage.example/alice/", source: "profile" },
    ]);
  });

  it("takes the storage the WebID document names on another origin, and reads more of the profile there alone", async () => {
    const pod = fakePod();
    const more = "https://storage.example/alice/profile/more.ttl";
    await pod.put(
      CARD,
      `<#me> <${PIM_STORAGE}> <https://storage.example/alice/>;
        <http://www.w3.org/2000/01/rdf-schema#seeAlso> <${more}>, <${EXTENDED}> .\n`,
    );
    await pod.put(more, extended(1, "https://storage.example/alice/backup/"));
    await pod.put(EXTENDED, extended(1));
    const sent: string[] = [];
    const gateway = createSolidStorageGateway({
      fetch: (input, init) => {
        sent.push(String(input));
        return documentsOf(pod)(input, init);
      },
      profileStorages: getProfileStorages,
    });
    await expect(gateway.discoverStorages(WEBID)).resolves.toEqual([
      { url: "https://storage.example/alice/", source: "profile" },
      { url: "https://storage.example/alice/backup/", source: "profile" },
    ]);
    expect(sent).toContain(more);
    expect(sent).not.toContain(EXTENDED);
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
    expect(found).toContain("https://pod.example/alice/");
    expect(found.length).toBeLessThanOrEqual(2);
  });

  it("reads no more than MAX_PROFILE_DOCUMENTS further profile documents", async () => {
    const { gateway, sent } = await manyProfilesPod(MAX_PROFILE_DOCUMENTS + 4, 1);
    const found = (await gateway.discoverStorages(WEBID)).map(({ url }) => url);
    expect(found).toEqual([
      "https://pod.example/alice/",
      ...Array.from({ length: MAX_PROFILE_DOCUMENTS }, (_, i) => storageOf(i)),
    ]);
    expect(sent).not.toContain(further(MAX_PROFILE_DOCUMENTS));
    expect(
      sent.filter((url) => url.startsWith("https://pod.example/alice/settings/")),
    ).toHaveLength(MAX_PROFILE_DOCUMENTS);
  });

  it("counts only the further profile documents it sends to MAX_PROFILE_DOCUMENTS", async () => {
    // Documents outside the profile's places come first, are not sent, and use up none of the count.
    let outside = "";
    for (let i = 0; i < MAX_PROFILE_DOCUMENTS; i++) {
      outside += `<#me> <http://www.w3.org/2000/01/rdf-schema#seeAlso> <https://elsewhere.example/${i}.ttl> .\n`;
    }
    const { gateway, sent } = await manyProfilesPod(1, 1, outside);
    const found = (await gateway.discoverStorages(WEBID)).map(({ url }) => url);
    expect(found).toEqual(["https://pod.example/alice/", storageOf(0)]);
    expect(sent.some((url) => url.startsWith("https://elsewhere.example/"))).toBe(false);
  });
});
