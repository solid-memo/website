/**
 * Where Solid Memo's vocabulary and shapes are published: with the site,
 * from this repository's ns/ folder (docs/vocab.md). The vocabulary's
 * documents are `<VOCAB_BASE>v1.ttl`, `topics.ttl` and `external.ttl`,
 * its terms fragments of them (`<VOCAB_BASE>v1.ttl#Card`); each shape is
 * `<SHAPES_BASE><class>/v<N>.ttl` (`…/card/v1.ttl#shape`). Every IRI of
 * either is its document's address, and every document states it as
 * its `@base`.
 */
export const SITE = "https://solid-memo.com/";
export const VOCAB_BASE = `${SITE}ns/vocab/`;
export const SHAPES_BASE = `${SITE}ns/shapes/`;
