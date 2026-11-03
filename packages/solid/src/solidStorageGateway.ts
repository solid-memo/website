// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { StorageGateway } from "@solid-memo/application/ports";
import type { Storage } from "@solid-memo/domain/storage";
import { getThing } from "./client/rdf";
import {
  limitedFetch,
  MAX_PROFILE_DOCUMENTS,
  noneSpent,
  PROFILE_LIMITS,
} from "./client/readLimits";
import { getSourceUrl, type ProfileStorages } from "./client/resources";
import { readDataset } from "./datasets";
import { createPlacesFetch, profilePlacesOf, readNothing } from "./profilePlaces";
import { ensureTrailingSlash } from "./urls";
import { AppError } from "@solid-memo/domain/appError";

const PIM_STORAGE_TYPE = "http://www.w3.org/ns/pim/space#Storage";

export interface SolidStorageGatewayDeps {
  fetch: typeof globalThis.fetch;
  /** The storages a profile names (client/resources.ts, getProfileStorages). */
  profileStorages: ProfileStorages;
}

export function createSolidStorageGateway({
  fetch,
  profileStorages,
}: SolidStorageGatewayDeps): StorageGateway {
  // The profile's documents are read under limits, as little as a profile holds (PROFILE_LIMITS), made once so that
  // the WebID document read again is asked only whether it changed (datasets.ts).
  const profileFetch = limitedFetch(fetch, PROFILE_LIMITS);
  return {
    async discoverStorages(webId): Promise<Storage[]> {
      // The WebID document read through `fetch`, as every pod read is, never
      // the browser's own, which cannot reach the guest's pod
      // (docs/guest-mode.md), and handed to the lookup. The documents it
      // names as more of the profile are read as the user in the profile's
      // own places alone, and any other is not read (profilePlacesOf). The
      // WebID document is read under PROFILE_LIMITS, and the others, no
      // more than MAX_PROFILE_DOCUMENTS of them, under PROFILE_LIMITS
      // together, so that many documents hold up a sign-in no more than one.
      // Only a document sent counts: one outside the places, not read, does not.
      const webIdProfile = await readDataset(webId, profileFetch);
      const me = getThing(webIdProfile, webId);
      const places = profilePlacesOf(webId, getSourceUrl(webIdProfile), me === null ? [] : [me]);
      const fromProfile = await profileStorages(webId, {
        fetch: limitedFetch(
          createPlacesFetch(places, atMost(MAX_PROFILE_DOCUMENTS, fetch), readNothing),
          PROFILE_LIMITS,
          noneSpent(),
        ),
        webIdProfile,
      });
      if (fromProfile.length > 0) {
        return fromProfile.map((url) => ({ url, source: "profile" }));
      }
      const fromLinkHeader = await walkUpToStorage(webId, fetch);
      if (fromLinkHeader !== null) {
        return [{ url: fromLinkHeader, source: "linkHeader" }];
      }
      return [];
    },

    async probeStorage(url): Promise<Storage> {
      const normalized = ensureTrailingSlash(url);
      const response = await fetch(normalized, { method: "HEAD" });
      if (!response.ok) {
        throw new AppError("storageInaccessible", { url: normalized, status: response.status });
      }
      return { url: normalized, source: "manual" };
    },
  };
}

/** The fetch, which sends the first `most` requests and refuses the rest unsent. */
function atMost(most: number, fetch: typeof globalThis.fetch): typeof globalThis.fetch {
  let sent = 0;
  return async (input, init) => {
    if (sent >= most) throw new Error(`Not read: past the ${most} documents a profile is read in`);
    sent++;
    return fetch(input, init);
  };
}

/**
 * Candidate URLs for the Solid Protocol storage walk-up: the WebID document
 * itself, then each ancestor container up to the origin root.
 */
function candidateStorageUrls(webId: string): string[] {
  const url = new URL(webId);
  url.hash = "";
  url.search = "";
  const segments = url.pathname.split("/").filter((s) => s.length > 0);
  const candidates = [url.toString()];
  for (let depth = segments.length - 1; depth >= 0; depth--) {
    const path = segments
      .slice(0, depth)
      .map((segment) => `${segment}/`)
      .join("");
    candidates.push(`${url.origin}/${path}`);
  }
  return candidates;
}

/**
 * True when a Link header advertises the resource as a pim:Storage
 * (rel="type" targeting http://www.w3.org/ns/pim/space#Storage — note the
 * capital-S class, distinct from the lowercase pim:storage predicate).
 */
export function hasStorageLink(linkHeader: string | null): boolean {
  if (linkHeader === null) {
    return false;
  }
  return linkHeader
    .split(",")
    .some((link) => link.includes(`<${PIM_STORAGE_TYPE}>`) && /rel="?type"?/.test(link));
}

async function walkUpToStorage(
  webId: string,
  fetch: typeof globalThis.fetch,
): Promise<string | null> {
  for (const candidate of candidateStorageUrls(webId)) {
    let linkHeader: string | null;
    try {
      const response = await fetch(candidate, { method: "HEAD" });
      linkHeader = response.headers.get("Link");
    } catch {
      continue;
    }
    if (hasStorageLink(linkHeader)) {
      return candidate;
    }
  }
  return null;
}
