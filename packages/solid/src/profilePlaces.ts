// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { getUrlAll, type Subject } from "./client/rdf";
import { createFolderGate } from "./ownPodGate";
import { PIM } from "./vocab";
import { isInFolder } from "@solid-memo/domain/instanceLayout";

/**
 * Where a WebID's profile is the user's own (docs/boundaries.md): the
 * origin of the WebID and of the document it was read from (when it
 * says where), and the storages the WebID's `subjects` name there
 * (pim:storage). A document
 * the profile links anywhere else (rdfs:seeAlso, foaf:isPrimaryTopicOf,
 * pim:preferencesFile) may be anyone's, so it is neither read as the
 * user nor taken as part of the profile.
 */
export function profilePlacesOf(
  webId: string,
  webIdDocumentUrl: string,
  subjects: readonly Subject[],
): string[] {
  return [
    ...[webId, webIdDocumentUrl].flatMap((url) => {
      const parsed = URL.parse(url);
      return parsed === null ? [] : [`${parsed.origin}/`];
    }),
    ...subjects.flatMap((subject) => getUrlAll(subject, PIM.storage)),
  ];
}

/** Whether `url` is in one of `places` (isInFolder). */
export function isInPlaces(url: string, places: readonly string[]): boolean {
  return places.some((place) => isInFolder(url, place));
}

/**
 * A fetch that is the user only in `places`: any other read goes to
 * `publicFetch`, and any other write is refused before it is sent
 * (`writeOutsidePod`).
 */
export function createPlacesFetch(
  places: readonly string[],
  fetch: typeof globalThis.fetch,
  publicFetch: typeof globalThis.fetch,
): typeof globalThis.fetch {
  return createFolderGate({ fetch, publicFetch, isOwn: (url) => isInPlaces(url, places) });
}

/** A fetch that sends nothing: for a document outside the profile's places, which is not read at all. */
export const readNothing: typeof globalThis.fetch = async (input) => {
  const url = input instanceof Request ? input.url : String(input);
  throw new Error(`Not read: <${url}> is outside the profile's own places`);
};
