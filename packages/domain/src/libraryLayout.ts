/**
 * Where things are in the deck library (see docs/deck-library.md): the
 * catalogue is decks/index, each deck a series described there
 * (#<name>), each release a document of its own (decks/<name>/v<n>;
 * decks/<name>/<n>.ttl before the library dropped its extensions).
 * Before releases, a deck was the one document decks/<name>.ttl.
 */

/** A release document: …/decks/<name>/v<n>, or …/decks/<name>/<n>.ttl as it was. */
const RELEASE = /^(.*\/decks\/)([^/]+)\/(?:v([1-9][0-9]*)|([1-9][0-9]*)\.ttl)$/;
/**
 * A deck document from before releases: …/decks/<name>.ttl, or the
 * IRI its @base declared, …/decks/<name>.
 */
const LEGACY = /^(.*\/decks\/)([^/.]+)(\.ttl)?$/;

function parse(url: string): { base: string; name: string } | null {
  const release = RELEASE.exec(url);
  if (release !== null) return { base: release[1], name: release[2] };
  const legacy = LEGACY.exec(url);
  if (legacy !== null && legacy[2] !== "index") return { base: legacy[1], name: legacy[2] };
  return null;
}

/**
 * The release a deck imported before releases came from: the library's
 * first release of it, which is what that document became. Any other
 * URL is left as it is.
 */
export function releaseUrlOfLegacySource(url: string): string {
  if (RELEASE.test(url)) return url;
  const legacy = parse(url);
  return legacy === null ? url : `${legacy.base}${legacy.name}/v1`;
}

/** The series (#<name> in the index) a release or legacy deck document belongs to. */
export function librarySeriesUrlOf(url: string): string {
  const parsed = parse(url);
  return parsed === null ? `${url}#series` : `${parsed.base}index#${parsed.name}`;
}

/** The library's publisher, described in the index. */
export function libraryPublisherUrlOf(url: string): string {
  const parsed = parse(url);
  return parsed === null ? `${url}#publisher` : `${parsed.base}index#solid-memo`;
}
