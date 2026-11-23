// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * A catalog entry from before deck format 3 names its authors as text,
 * and the migration to format 3 names an agent for each at an address
 * joined from the entry's document. Only the first MAX_DECK_METADATA
 * authors are read (records.ts namedCreators), so an entry with as many
 * authors as its document's address is long, up to near the bound on a
 * term (MAX_TERM_CHARACTERS), is read in time that grows with the
 * entry, not with the authors times the address.
 *
 * Sixteen times as many authors, at an address sixteen times as long,
 * must take less time than the small entry read sixteen times over
 * (testing.md): past the first authors, an author costs only its text.
 * Were every author's agent named, the large entry would take many
 * times longer than that. Parsing the catalog is not timed.
 */
import { describe, expect, it } from "vitest";
import { growth } from "@solid-memo/domain/testing/growth";
import { datasetFromQuads } from "./client/rdf";
import { MAX_TERM_CHARACTERS } from "./client/readLimits";
import { toDecks } from "./mappers/deckMapper";
import { Parser } from "n3";

const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";
const DCTERMS = "http://purl.org/dc/terms/";
const CATALOG = "https://pod.example/alice/solid-memo/main/catalog.ttl";

/** A catalog with one format-2 entry at an address `count` characters long, naming `count` authors. */
function catalogOf(count: number) {
  const subject = `https://pod.example/${"p".repeat(count)}#d`;
  const authors = Array.from({ length: count }, (_, i) => `"a${i}"`).join(", ");
  const turtle = `<${subject}> a <${SM}Deck> ; <${SM}formatVersion> 2 ; <${DCTERMS}title> "t" ;
  <${SM}direction> "front-to-back" ; <${SM}cardsDocument> <decks/d.ttl> ;
  <${SM}reviewsDocument> <reviews/d.ttl> ; <${DCTERMS}creator> ${authors} .`;
  return { subject, dataset: datasetFromQuads(new Parser({ baseIRI: CATALOG }).parse(turtle)) };
}

describe("a catalog entry from before format 3", () => {
  it("is read in time that grows with it, not its authors times its address", () => {
    expect(catalogOf(1_000 * 16).subject.length).toBeLessThan(MAX_TERM_CHARACTERS);
    const ratio = growth(
      (count) => {
        const { dataset } = catalogOf(count);
        // The entry is not a subject of the catalog's document, so it is no deck of the instance's.
        return () => expect(toDecks(dataset, CATALOG)).toEqual([]);
      },
      1_000,
      16,
      1,
    );
    expect(ratio).toBeLessThan(1);
  }, 180_000);
});
