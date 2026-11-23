// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Subject } from "./client/rdf";
import { PROFILE_TERMS } from "@solid-memo/vocab/descriptors.generated";
import { readTerms } from "./records";
import { createFolderGate } from "./ownPodGate";
import { canonicalUrlOf, isInFolder } from "@solid-memo/domain/instanceLayout";

/**
 * Where a WebID's profile is the user's own (docs/boundaries.md): the
 * origin of the WebID and of the document it was read from (when it
 * says where), and the storages the WebID document itself names for the
 * WebID (pim:storage on `webIdSubject`), never those another document
 * names: one the profile links (rdfs:seeAlso, foaf:isPrimaryTopicOf,
 * pim:preferencesFile) may be anyone's, so it neither widens the places
 * nor is read as the user outside the user's own storages
 * (ownProfileArea).
 */
export function profilePlacesOf(
  webId: string,
  webIdDocumentUrl: string,
  webIdSubject: Subject | null,
): string[] {
  return [
    ...[webId, webIdDocumentUrl].flatMap((url) => {
      const parsed = URL.parse(url);
      return parsed === null ? [] : [`${parsed.origin}/`];
    }),
    ...(webIdSubject === null ? [] : readTerms(webIdSubject, PROFILE_TERMS).storage),
  ];
}

/**
 * Where a document the profile links as more of it (rdfs:seeAlso,
 * foaf:isPrimaryTopicOf, foaf:primaryTopic, pim:preferencesFile) is the
 * user's own, to be read as the user and its statements taken: in one
 * of the user's `storages`, or, when none is known, in the pod the WebID
 * itself is in (podOfWebId). Anywhere else on the WebID's origin it may
 * be in another user's pod, on a server that keeps many pods on one
 * origin. When that pod would be the whole origin, as for a WebID
 * document at its root or in its `profile/`, nowhere is: the origin may
 * hold other users' pods too; nor is it for a WebID with no folder.
 */
export function ownProfileArea(webId: string, storages: readonly string[]): readonly string[] {
  if (storages.length > 0) return storages;
  const pod = podOfWebId(webId);
  const path = URL.parse(pod)?.pathname;
  return path === undefined || path === "/" ? [] : [pod];
}

/**
 * Storage addresses as a request sends them (canonicalUrlOf: dot
 * segments resolved, `%2e` among them), each once, in order; text that
 * is no URL is left out. Two spellings of one folder are one storage.
 */
export function storageUrlsOf(urls: readonly string[]): string[] {
  return [
    ...new Set(
      urls.flatMap((url) => {
        const canonical = canonicalUrlOf(url);
        return canonical === null ? [] : [canonical];
      }),
    ),
  ];
}

/**
 * The folder the WebID's own pod is taken to be in when the server shows
 * no storage: the WebID document's folder, or the one above it when that
 * is `profile/`, as in `<pod>profile/card#me`. This takes that folder
 * to be the user's own pod: a server that keeps many users' pods on one
 * origin keeps the others outside it. One that keeps many users' WebID
 * documents in one shared folder, and shows no storage, is not covered.
 */
function podOfWebId(webId: string): string {
  const { origin, pathname } = new URL(webId);
  const folder = pathname.slice(0, pathname.lastIndexOf("/") + 1);
  return `${origin}${folder.endsWith("/profile/") ? folder.slice(0, -"profile/".length) : folder}`;
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
