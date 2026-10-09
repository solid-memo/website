import type { Deck } from "./deck";

/**
 * Where an instance keeps its documents (see docs/data-model.md): the
 * meta, preferences and catalog documents at fixed names in the
 * container, and one cards and one reviews document per deck, named in
 * the deck's catalog entry.
 */

export function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

export function metaUrlOf(instanceUrl: string): string {
  return `${ensureTrailingSlash(instanceUrl)}meta.ttl`;
}

export function preferencesUrlOf(instanceUrl: string): string {
  return `${ensureTrailingSlash(instanceUrl)}preferences.ttl`;
}

export function catalogUrlOf(instanceUrl: string): string {
  return `${ensureTrailingSlash(instanceUrl)}catalog.ttl`;
}

/** The instance a deck is in: the container of its catalog entry's document. */
export function instanceUrlOfDeck(deckUrl: string): string {
  const catalog = deckUrl.split("#")[0];
  return catalog.slice(0, catalog.lastIndexOf("/") + 1);
}

/** Every document the decks use: their cards and reviews documents. */
export function documentsInUse(decks: readonly Deck[]): Set<string> {
  return new Set(decks.flatMap((deck) => [deck.cardsDocumentUrl, deck.reviewsDocumentUrl]));
}

/**
 * The instance's digest document: derived data (domain/studyDigest.ts),
 * not one of the documents an instance is checked by.
 */
export function digestUrlOf(instanceUrl: string): string {
  return `${ensureTrailingSlash(instanceUrl)}digest.ttl`;
}

/** The container of the instance's cards documents, `decks/`, where every deck's is made. */
export function cardsContainerOf(instanceUrl: string): string {
  return `${ensureTrailingSlash(instanceUrl)}decks/`;
}

/** The container of the instance's reviews documents, `reviews/`, where every deck's is made. */
export function reviewsContainerOf(instanceUrl: string): string {
  return `${ensureTrailingSlash(instanceUrl)}reviews/`;
}

/**
 * The instance's answer log (domain/answer.ts): one document per study
 * month in this container, `history/<YYYY-MM>.ttl`. Source data the
 * statistics are computed from, checked in the full check only.
 */
export function historyContainerOf(instanceUrl: string): string {
  return `${ensureTrailingSlash(instanceUrl)}history/`;
}

/** The answer log's document for a study month, "YYYY-MM". */
export function historyUrlOf(instanceUrl: string, month: string): string {
  return `${historyContainerOf(instanceUrl)}${month}.ttl`;
}

/** The study month a document of the answer log is for; null for any other resource. */
export function monthOfHistoryUrl(instanceUrl: string, url: string): string | null {
  const container = historyContainerOf(instanceUrl);
  if (!url.startsWith(container)) return null;
  return /^(\d{4}-\d{2})\.ttl$/.exec(url.slice(container.length))?.[1] ?? null;
}

/**
 * The digest subject about a document or deck, `#<kind>-<where>`: where
 * it is under the instance, else its whole URL, with every character
 * but letters, digits, ".", "_" and "-" made a "-".
 */
export function digestSubjectOf(instanceUrl: string, kind: "receipt" | "schedule", target: string): string {
  const container = ensureTrailingSlash(instanceUrl);
  const where = target.startsWith(container) ? target.slice(container.length) : target;
  return `${digestUrlOf(instanceUrl)}#${kind}-${where.replace(/[^A-Za-z0-9._-]/g, "-")}`;
}

/** The instance's catalogue: the dcat:Catalog subject of its catalog document. */
export function catalogNodeUrlOf(instanceUrl: string): string {
  return `${catalogUrlOf(instanceUrl)}#catalog`;
}

/**
 * A deck group of the instance (domain/deckTree.ts): a subject of its
 * catalog document beside the decks, `#group-<id>`.
 */
export function deckGroupUrlOf(instanceUrl: string, id: string): string {
  return `${catalogUrlOf(instanceUrl)}#group-${id}`;
}

/** Every document an instance may hold, given its decks: fixed ones first. */
export function instanceDocumentUrls(instanceUrl: string, decks: readonly Deck[]): string[] {
  return [
    metaUrlOf(instanceUrl),
    preferencesUrlOf(instanceUrl),
    catalogUrlOf(instanceUrl),
    ...decks.flatMap((deck) => [deck.cardsDocumentUrl, deck.reviewsDocumentUrl]),
  ];
}
