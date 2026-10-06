/**
 * Where things are in the deck library (see docs/deck-library.md): the
 * catalogue is decks/index.ttl, each deck a series described there
 * (#<name>), each release a document of its own, decks/<name>/v<n>.ttl.
 */

/** A release document: …/decks/<name>/v<n>.ttl. */
const RELEASE = /^(.*\/decks\/)([^/]+)\/v([1-9][0-9]*)\.ttl$/;

function parse(url: string): { base: string; name: string } | null {
  const release = RELEASE.exec(url);
  return release === null ? null : { base: release[1], name: release[2] };
}

/** The series (#<name> in the index) a release belongs to. */
export function librarySeriesUrlOf(url: string): string {
  const parsed = parse(url);
  return parsed === null ? `${url}#series` : `${parsed.base}index.ttl#${parsed.name}`;
}

/** The library's publisher, described in the index. */
export function libraryPublisherUrlOf(url: string): string {
  const parsed = parse(url);
  return parsed === null ? `${url}#publisher` : `${parsed.base}index.ttl#solid-memo`;
}
