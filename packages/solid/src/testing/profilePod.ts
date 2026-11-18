// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { getProfileStorages } from "../client/resources";
import { createSolidStorageGateway } from "../solidStorageGateway";
import { fakePod } from "./fakePod";

/** A WebID document and its extended profile, in a pod in memory, for the storage gateway's tests. */
export const CARD = "https://pod.example/alice/profile/card";
export const WEBID = `${CARD}#me`;
export const EXTENDED = "https://pod.example/alice/settings/extended.ttl";
export const PIM_STORAGE = "http://www.w3.org/ns/pim/space#storage";

/** `count` plain triples, then the WebID's storage, `storage`. */
export function extended(count: number, storage = "https://pod.example/alice/"): string {
  let ttl = "";
  for (let i = 0; i < count; i++) ttl += `<#s${i}> <http://example.org/p> "value ${i}" .\n`;
  return `${ttl}<${WEBID}> <${PIM_STORAGE}> <${storage}> .\n`;
}

/** The pod's fetch, which sends a URL without its fragment, as a browser's does. */
export function documentsOf(pod: ReturnType<typeof fakePod>): typeof globalThis.fetch {
  return (input, init) => pod.fetch(String(input).split("#")[0]!, init);
}

/** A pod whose WebID document names an extended profile of `count` triples (rdfs:seeAlso). */
export async function profilePod(count: number, card = "") {
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
