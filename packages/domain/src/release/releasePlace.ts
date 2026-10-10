import { ensureTrailingSlash } from "../instanceLayout.ts";

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
  return (url.protocol === "https:" || url.protocol === "http:") && url.href === text && text.endsWith("/") && url.search === "" && url.hash === "";
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

/** The name of a release saved as a file: `<name>-v<N>.ttl`, which the library keeps as `decks/<name>/v<N>.ttl`. */
export function releaseFileName(name: string, version: number): string {
  return `${name}-v${version}.ttl`;
}
