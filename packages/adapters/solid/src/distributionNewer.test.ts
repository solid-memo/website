// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The subject at a deck's distribution IRI (`<deck>-cards`) that this
 * app did not write at its format (GHSA-22vh-cv35-wv8q). One a newer
 * version wrote, stamped above the distribution format whatever its
 * classes, is left as it is by every write of the deck and by its
 * removal: no save, removal or format update is refused for it, and
 * the format update brings every other deck up to date too. The entry
 * links to it only when it is a distribution. Another app's subject
 * there is never written onto: the deck is written with no
 * distribution.
 */
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/testing/shapeSources";
import { describe, expect, it } from "vitest";
import { getSolidDatasetOrNull } from "./datasets";
import { getInteger, getThing, getUrlAll } from "@solid-memo/solid-client/rdf";
import { createShaclShapeValidator } from "./shaclShapeValidator";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { fakePod } from "./testing/fakePod";

const INSTANCE = "https://pod.example/solid-memo/main/";
const CATALOG = `${INSTANCE}catalog.ttl`;
const ME = "https://pod.example/profile/card#me";
const FOAF = "http://xmlns.com/foaf/0.1/";
const FORMAT_VERSION = "https://solid-memo.com/ns/vocab/v1.ttl#formatVersion";
const DISTRIBUTION = "http://www.w3.org/ns/dcat#distribution";
const PREFIXES = `@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
`;
const deckTtl = (id: string, version: number, extra = "") =>
  `<#${id}> a sm:Deck, dcat:Dataset ; sm:formatVersion ${version} ;
  dcterms:title "${id}"@en ; dcterms:description "Flashcards: ${id}."@en ; sm:studyDirection sm:frontToBack ;
  sm:cardsDocument <${INSTANCE}decks/${id}.ttl> ; sm:reviewsDocument <${INSTANCE}reviews/${id}.ttl> ${extra}.
`;

/** A catalog with decks a and b (format 6), c and d (format 5), and `subject`; the decks of `linked` link to their distribution. */
async function podWith(subject: string, linked: readonly string[] = []) {
  const pod = fakePod();
  await pod.put(
    CATALOG,
    `${PREFIXES}<#catalog> a dcat:Catalog ; dcterms:title "Main" ; dcterms:description "My decks." ;
    dcterms:publisher <${ME}> ; dcat:dataset <#a>, <#b>, <#c>, <#d> .
  ${[6, 6, 5, 5]
    .map((version, i) => {
      const id = "abcd"[i]!;
      return deckTtl(id, version, linked.includes(id) ? `; dcat:distribution <#${id}-cards> ` : "");
    })
    .join("")}<${ME}> a <${FOAF}Agent> ; <${FOAF}name> "Me" .
  ${subject}`,
  );
  const validator = createShaclShapeValidator({
    fetch: pod.fetch,
    shapesFetch,
    ...SHAPE_SOURCES,
  }).over(pod.fetch);
  const repository = createSolidDeckRepository({
    fetch: pod.fetch,
    now: () => new Date("2026-11-27T10:00:00.000Z"),
    randomId: () => "new",
    checkWrite: validator.checkSubjects,
  });
  const subjectAt = async (url: string) =>
    getThing((await getSolidDatasetOrNull(CATALOG, pod.fetch))!, url);
  const versionOf = async (id: string) =>
    getInteger((await subjectAt(`${CATALOG}#${id}`))!, FORMAT_VERSION);
  const linksOf = async (id: string) =>
    getUrlAll((await subjectAt(`${CATALOG}#${id}`))!, DISTRIBUTION);
  const deck = async (id: string) =>
    (await repository.listDecks(INSTANCE)).find((each) => each.id === id)!;
  return { repository, subjectAt, versionOf, linksOf, deck };
}

/** Each with whether the entry links to it once written: only a distribution is linked to. */
const NEWER: [string, (id: string) => string, boolean][] = [
  ["untyped", (id) => `<#${id}-cards> sm:formatVersion 99 .`, false],
  [
    "typed a distribution",
    (id) => `<#${id}-cards> a dcat:Distribution ; sm:formatVersion 99 .`,
    true,
  ],
];

describe.each(NEWER)(
  "a subject stamped newer and %s at a deck's distribution IRI",
  (_, plant, linked) => {
    const links = (id: string) => (linked ? [`${CATALOG}#${id}-cards`] : []);

    it("is left as it is by a rename of the deck", async () => {
      const { repository, subjectAt, linksOf, deck } = await podWith(plant("a"), ["a"]);
      const before = await subjectAt(`${CATALOG}#a-cards`);
      await repository.editDeck(await deck("a"), (stored) => ({
        ...stored,
        title: { en: "Renamed" },
      }));
      expect((await deck("a")).title.en).toBe("Renamed");
      expect(await subjectAt(`${CATALOG}#a-cards`)).toEqual(before);
      expect(await linksOf("a")).toEqual(links("a"));
    });

    it("keeps no deck from the format update, which brings both outdated decks up to date", async () => {
      const { repository, subjectAt, versionOf, linksOf } = await podWith(plant("c"));
      const before = await subjectAt(`${CATALOG}#c-cards`);
      await expect(repository.upgradeDecks(INSTANCE, null)).resolves.toBe(true);
      expect(await versionOf("c")).toBe(6);
      expect(await versionOf("d")).toBe(6);
      expect(await subjectAt(`${CATALOG}#c-cards`)).toEqual(before);
      expect(await linksOf("c")).toEqual(links("c"));
      expect(await linksOf("d")).toEqual([`${CATALOG}#d-cards`]);
    });

    it("is left as it is by the removal of the deck, alone or with another", async () => {
      const { repository, subjectAt, deck } = await podWith(plant("a"), ["a"]);
      const before = await subjectAt(`${CATALOG}#a-cards`);
      await repository.removeDecks([await deck("a"), await deck("b")]);
      expect((await repository.listDecks(INSTANCE)).map(({ id }) => id)).toEqual(["c", "d"]);
      expect(await subjectAt(`${CATALOG}#a-cards`)).toEqual(before);
    });
  },
);

describe("another app's dataset at a deck's distribution IRI", () => {
  const OTHER = (id: string) =>
    `<#${id}-cards> a dcat:Dataset, <urn:x:Thing> ; dcterms:title "Other app's dataset" .`;

  it("is left as it is by the format update and a rename, and the deck has no distribution", async () => {
    const { repository, subjectAt, versionOf, linksOf, deck } = await podWith(OTHER("c"));
    const before = await subjectAt(`${CATALOG}#c-cards`);
    await expect(repository.upgradeDecks(INSTANCE, null)).resolves.toBe(true);
    expect(await versionOf("c")).toBe(6);
    expect(await versionOf("d")).toBe(6);
    await repository.editDeck(await deck("c"), (stored) => ({
      ...stored,
      title: { en: "Renamed" },
    }));
    expect(await subjectAt(`${CATALOG}#c-cards`)).toEqual(before);
    expect(await linksOf("c")).toEqual([]);
    await repository.removeDeck(await deck("c"));
    expect(await subjectAt(`${CATALOG}#c-cards`)).toEqual(before);
  });
});
