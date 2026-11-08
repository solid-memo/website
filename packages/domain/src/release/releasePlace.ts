// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  ensureTrailingSlash,
  hasEmptySegment,
  isCanonicalUrl,
  isPlainHttpUrl,
} from "../instanceLayout.ts";
import { draftPlaceOf } from "./draftLayout.ts";

/**
 * Where a creator publishes a release in a pod (docs/studio.md,
 * Publishing a release): one Turtle document, `<folder><name>/v<N>.ttl`,
 * named as the library names its releases, so the next version of it
 * is named after its series again. The folder is the instance's
 * `releases/` unless the creator chooses another.
 */

/** The folder an instance's releases are published in, unless the creator chooses another. */
export function releasesContainerOf(instanceUrl: string): string {
  return `${ensureTrailingSlash(instanceUrl)}releases/`;
}

/**
 * Whether a folder's address, as the creator types it, is one a release
 * can be published in: an http(s) URL of a folder, ending in a slash,
 * with no query or fragment.
 */
export function isReleaseContainer(text: string): boolean {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return false;
  }
  return (
    (url.protocol === "https:" || url.protocol === "http:") &&
    url.href === text &&
    text.endsWith("/") &&
    url.search === "" &&
    url.hash === ""
  );
}

/** The address of version `version` of the release `name` in the folder. */
export function releaseUrlIn(container: string, name: string, version: number): string {
  return `${ensureTrailingSlash(container)}${name}/v${version}.ttl`;
}

/** The name and version a release's address gives it (`…/capitals/v2.ttl`); null when it is named otherwise. */
export function releasePlaceOf(url: string): { name: string; version: number } | null {
  const match = /\/([a-z0-9][a-z0-9-]*)\/v([1-9][0-9]*)\.ttl$/.exec(url);
  return match === null ? null : { name: match[1]!, version: Number(match[2]) };
}

/**
 * Whether a catalog's link may be to a release the instance published:
 * an http(s) address written as a request sends it (isCanonicalUrl, as
 * the folder it is published in is: isReleaseContainer), with no query
 * or fragment (isPlainHttpUrl), no empty segment (hasEmptySegment) and
 * no user info, named as a release is (releasePlaceOf). The catalog is
 * data anyone may have written; a link that is not one is neither listed
 * nor made public.
 */
export function isPublishedReleaseUrl(url: string): boolean {
  if (!isCanonicalUrl(url) || !isPlainHttpUrl(url) || hasEmptySegment(url)) return false;
  const { username, password } = new URL(url);
  return username === "" && password === "" && releasePlaceOf(url) !== null;
}

/**
 * The version an address names beside the release at `url`, in its
 * folder (`<folder><name>/v<M>.ttl`, or a fragment of it): null when
 * either is named otherwise than a release is, or the address is in
 * another folder.
 */
function versionBeside(url: string, iri: string): number | null {
  const document = iri.split("#", 1)[0]!;
  const folder = (of: string) => of.slice(0, of.lastIndexOf("/") + 1);
  if (releasePlaceOf(url) === null || folder(document) !== folder(url)) return null;
  return releasePlaceOf(document)?.version ?? null;
}

/**
 * Whether an address is an earlier version of the release at `url`, as
 * its series' versions are published: a release's address
 * (isPublishedReleaseUrl) in its folder, of a lower version.
 */
export function isEarlierVersionBeside(url: string, iri: string): boolean {
  const version = versionBeside(url, iri);
  return isPublishedReleaseUrl(iri) && version !== null && version < releasePlaceOf(url)!.version;
}

/**
 * Whether an address is where the draft at `draftUrl` is published
 * unless the creator chooses another folder (releaseUrlIn the instance's
 * releases/, by the draft's name and version), a later version there,
 * or one of their subjects (`#id`): where it and each next version of
 * it are published. False for an address no draft has (draftPlaceOf).
 */
export function isDraftsPlaceOnward(draftUrl: string, iri: string): boolean {
  const place = draftPlaceOf(draftUrl);
  if (place === null) return false;
  const folder = `${releasesContainerOf(place.instanceUrl)}${place.name}/`;
  const document = iri.split("#", 1)[0]!;
  const version = document.startsWith(folder)
    ? /^v([1-9][0-9]*)\.ttl$/.exec(document.slice(folder.length))
    : null;
  return version !== null && Number(version[1]) >= place.version;
}

/** The name of a release saved as a file: `<name>-v<N>.ttl`, which the library keeps as `decks/<name>/v<N>.ttl`. */
export function releaseFileName(name: string, version: number): string {
  return `${name}-v${version}.ttl`;
}
