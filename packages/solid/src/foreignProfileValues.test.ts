// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Deck } from "@solid-memo/domain/deck";
import { deckSetAside, type ValidationReport } from "@solid-memo/domain/validation";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/testing/shapeSources";
import { describe, expect, it } from "vitest";
import {
  asUrl,
  buildThing,
  getStringNoLocale,
  getThing,
  getThingAll,
  getUrlAll,
  setThing,
  createThing,
} from "./client/rdf";
import { getSolidDatasetOrNull, saveDataset } from "./datasets";
import { createLocalPod } from "./localPod";
import { createMemoryResourceStore } from "./memoryResourceStore";
import { createShaclShapeValidator } from "./shaclShapeValidator";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { DCTERMS, RDF, SM } from "./vocab";

/**
 * Values another app added to a deck's entry, its distribution or an
 * agent decks share, of predicates Solid Memo does not write there, or
 * of one it writes but not of the class DCAT-AP asks for (a theme
 * nothing describes, one the document describes as something else, a
 * subject of Solid Memo's), that the DCAT-AP profile refuses: the deck is not set aside, and every write of its
 * entry still passes the write check, keeping the values. On the
 * catalog, another app's class result warns, but its link to a member
 * nothing describes still counts. Through the real deck repository and
 * write check, against a pod in memory.
 */

const INSTANCE = "https://pod.example/memo/";
const AUTHOR = "Ann <ann@example.org>";
const ACCRUAL = "http://purl.org/dc/terms/accrualPeriodicity";
const TYPE = "http://purl.org/dc/terms/type";
const CHAPTER = "https://solid-memo.com/decks/course/v1.ttl#chapter-1";
const THEME = "http://www.w3.org/ns/dcat#theme";
const DISTRIBUTION = "http://www.w3.org/ns/dcat#distribution";
const LICENSE = "http://purl.org/dc/terms/license";
/** A theme the deck's shape takes (an IRI) that DCAT-AP does not (no skos:Concept). */
const NOT_CONCEPT = "https://x.example/not-a-concept";
const LABEL = "http://www.w3.org/2000/01/rdf-schema#label";
const CATALOG = "http://www.w3.org/ns/dcat#Catalog";
const MEMBER = "http://www.w3.org/ns/dcat#dataset";
const TAXONOMY = "http://www.w3.org/ns/dcat#themeTaxonomy";

async function plantedPod() {
  let n = 0;
  const fetch = createLocalPod({
    root: "https://pod.example/",
    store: createMemoryResourceStore(),
    newEtag: () => `"e${n++}"`,
  });
  const validator = createShaclShapeValidator({ fetch, shapesFetch, ...SHAPE_SOURCES }).over(fetch);
  const repository = createSolidDeckRepository({
    fetch,
    now: () => new Date("2026-11-11T00:00:00Z"),
    randomId: () => `r${n++}`,
    checkWrite: validator.checkSubjects,
  });
  const a = await repository.createDeck(INSTANCE, { en: "A" });
  const b = await repository.createDeck(INSTANCE, { en: "B" });
  await repository.saveDecks([
    { ...a, authors: [AUTHOR] },
    { ...b, authors: [AUTHOR] },
  ]);
  const catalogUrl = a.url.split("#")[0]!;
  /** A theme the document describes, as no skos:Concept. */
  const described = `${catalogUrl}#theme-x`;
  let dataset = (await getSolidDatasetOrNull(catalogUrl, fetch))!;
  dataset = setThing(
    dataset,
    buildThing(createThing({ url: described }))
      .addStringNoLocale(LABEL, "x")
      .build(),
  );
  dataset = setThing(
    dataset,
    buildThing(getThing(dataset, a.url)!)
      .addStringNoLocale(ACCRUAL, "weekly")
      .addUrl(DCTERMS.publisher, "https://x.example/p1")
      .addUrl(DCTERMS.publisher, "https://x.example/p2")
      .addUrl(SM.completedChapter, CHAPTER)
      .addUrl(THEME, NOT_CONCEPT)
      .addUrl(THEME, described)
      .build(),
  );
  const distribution = getUrlAll(getThing(dataset, a.url)!, DISTRIBUTION)[0]!;
  dataset = setThing(
    dataset,
    buildThing(getThing(dataset, distribution)!).addStringNoLocale(LICENSE, "MIT").build(),
  );
  const agent = getThingAll(dataset)
    .map(asUrl)
    .find((url) => url.includes("#agent-"))!;
  dataset = setThing(
    dataset,
    buildThing(getThing(dataset, agent)!)
      .addUrl(TYPE, "https://x.example/t1")
      .addUrl(TYPE, "https://x.example/t2")
      .build(),
  );
  // A subject of Solid Memo's, the agent both decks name, as a theme of B.
  dataset = setThing(dataset, buildThing(getThing(dataset, b.url)!).addUrl(THEME, agent).build());
  await saveDataset(catalogUrl, dataset, fetch);
  const decks = await repository.listDecks(INSTANCE);
  const byTitle = (title: string) => decks.find((deck) => deck.title.en === title)!;
  /** The planted values as the catalog holds them now. */
  const planted = async () => {
    const now = (await getSolidDatasetOrNull(catalogUrl, fetch))!;
    const entry = getThing(now, a.url)!;
    return {
      accrual: getStringNoLocale(entry, ACCRUAL),
      publishers: getUrlAll(entry, DCTERMS.publisher).length,
      types: getUrlAll(getThing(now, agent)!, TYPE).length,
      themes: [
        ...getUrlAll(entry, THEME).filter((url) => url === NOT_CONCEPT || url === described),
        ...getUrlAll(getThing(now, b.url)!, THEME).filter((url) => url === agent),
      ].length,
      license: getStringNoLocale(getThing(now, distribution)!, LICENSE),
    };
  };
  return {
    fetch,
    repository,
    validator,
    catalogUrl,
    a: byTitle("A"),
    b: byTitle("B"),
    planted,
  };
}

const KEPT = { accrual: "weekly", publishers: 2, types: 2, themes: 3, license: "MIT" };

describe("values another app added that DCAT-AP refuses", () => {
  it("set no deck aside, and are reported as warnings", async () => {
    const { validator, catalogUrl, a, b } = await plantedPod();
    const document = await validator.validateDocument(catalogUrl);
    const report = { instanceUrl: INSTANCE, documents: [document] } as unknown as ValidationReport;
    for (const deck of [a, b]) expect(deckSetAside(report, deck)).toBe(false);
    const paths = document.subjects.flatMap((subject) =>
      "violations" in subject
        ? subject.violations.filter((v) => v.profile === "dcat-ap").map((v) => [v.path, v.severity])
        : [],
    );
    expect(paths).toEqual(
      expect.arrayContaining([
        [ACCRUAL, "warning"],
        [DCTERMS.publisher, "warning"],
        [TYPE, "warning"],
        [THEME, "warning"],
        [LICENSE, "warning"],
      ]),
    );
    expect(paths.filter(([, severity]) => severity === "violation")).toEqual([]);
  }, 30_000);

  it("block no rename of either deck, keeping the values", async () => {
    const { repository, a, b, planted } = await plantedPod();
    await repository.renameDeck(a, { en: "A2" });
    await repository.saveDecks([{ ...b, title: { en: "B2" } }]);
    expect((await repository.listDecks(INSTANCE)).map((deck) => deck.title.en).sort()).toEqual([
      "A2",
      "B2",
    ]);
    expect(await planted()).toEqual(KEPT);
  }, 30_000);

  it("block no library upgrade of the entry, keeping the values", async () => {
    const { repository, a, planted } = await plantedPod();
    const next: Deck = { ...a, sourceUrl: "https://solid-memo.com/decks/capitals/v2.ttl" };
    await repository.checkDeckEntryUpgrade(a, next);
    await expect(repository.upgradeDeckEntry(a, next)).resolves.toMatchObject({
      sourceUrl: next.sourceUrl,
    });
    expect(await planted()).toEqual(KEPT);
  }, 30_000);

  it("block no change to the chapters a deck completed, keeping the values", async () => {
    const { repository, a, planted } = await plantedPod();
    expect(a.completedChapters).toEqual([CHAPTER]);
    await expect(repository.setCompletedChapters(a, { kind: "restart" })).resolves.toMatchObject({
      url: a.url,
    });
    expect((await repository.readDeck(a.url))?.completedChapters ?? []).toEqual([]);
    expect(await planted()).toEqual(KEPT);
  }, 30_000);

  it("leave the catalog's link to a member nothing describes counted, warning about a class result of another predicate", async () => {
    const { fetch, repository, validator, catalogUrl } = await plantedPod();
    await repository.saveCatalog(INSTANCE, {
      title: "Memo",
      description: "Decks",
      publisher: { webId: "https://pod.example/profile/card#me", name: "Ann" },
    });
    let dataset = (await getSolidDatasetOrNull(catalogUrl, fetch))!;
    const catalog = getThingAll(dataset).find((thing) =>
      getUrlAll(thing, RDF.type).includes(CATALOG),
    )!;
    dataset = setThing(
      dataset,
      buildThing(catalog)
        .addUrl(MEMBER, `${catalogUrl}#nowhere`)
        .addUrl(TAXONOMY, NOT_CONCEPT)
        .build(),
    );
    await saveDataset(catalogUrl, dataset, fetch);
    const document = await validator.validateDocument(catalogUrl);
    const results = document.subjects
      .filter((subject) => subject.url === asUrl(catalog))
      .flatMap((subject) => ("violations" in subject ? subject.violations : []))
      .filter((v) => v.profile === "dcat-ap" && v.constraint === "Class")
      .map((v) => [v.path, v.severity]);
    expect(results).toEqual(
      expect.arrayContaining([
        [MEMBER, "violation"],
        [TAXONOMY, "warning"],
      ]),
    );
    const read = (await getSolidDatasetOrNull(catalogUrl, fetch))!;
    const refused = validator.checkSubjects(read, [asUrl(catalog)], "pod");
    await expect(refused).rejects.toThrow(`<${asUrl(catalog)}> (${MEMBER}): DCAT-AP:`);
    await expect(refused).rejects.not.toThrow(TAXONOMY);
  }, 30_000);
});
