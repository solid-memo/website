// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Another app's subject in a deck catalog at a fragment the app names
 * its agents by (`#agent-…`): every deck write over a local pod keeps
 * it, as it was never this app's (GHSA-gvpx-j2mc-x9r9).
 */
import { describe, expect, it } from "vitest";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/testing/shapeSources";
import { buildThing, createThing, getThing, setThing } from "./client/rdf";
import { getSolidDatasetOrNull, saveDataset } from "./datasets";
import { createLocalPod } from "./localPod";
import { createMemoryResourceStore } from "./memoryResourceStore";
import { foreignSubjects } from "./ownership";
import { createShaclShapeValidator } from "./shaclShapeValidator";
import { createSolidDeckRepository } from "./solidDeckRepository";
import { RDF } from "./vocab";

const POD = "https://pod.example/";

async function setup() {
  let n = 0;
  const fetch = createLocalPod({
    root: POD,
    store: createMemoryResourceStore(),
    newEtag: () => `"e${n++}"`,
  });
  const validator = createShaclShapeValidator({ fetch, shapesFetch, ...SHAPE_SOURCES }).over(fetch);
  const repository = createSolidDeckRepository({
    fetch,
    now: () => new Date("2026-10-29T00:00:00Z"),
    randomId: () => `r${n++}`,
    checkWrite: validator.checkSubjects,
  });
  const deck = await repository.createDeck(`${POD}memo/`, { en: "A" });
  const other = await repository.createDeck(`${POD}memo/`, { en: "B" });
  const catalogUrl = deck.url.split("#")[0]!;
  const team = `${catalogUrl}#agent-team`;
  const dataset = (await getSolidDatasetOrNull(catalogUrl, fetch))!;
  await saveDataset(
    catalogUrl,
    setThing(
      dataset,
      buildThing(createThing({ url: team }))
        .addIri(RDF.type, "https://schema.org/Organization")
        .addStringNoLocale("https://schema.org/name", "Their team")
        .build(),
    ),
    fetch,
  );
  const present = async () => {
    const stored = (await getSolidDatasetOrNull(catalogUrl, fetch))!;
    expect(foreignSubjects(stored).has(team)).toBe(true);
    return getThing(stored, team) !== null;
  };
  return { repository, deck, other, present };
}

describe("another app's subject at an agent's fragment of a deck catalog", () => {
  it("stays when a deck is renamed, saved or removed", async () => {
    const { repository, deck, other, present } = await setup();
    expect(await present()).toBe(true);
    const renamed = await repository.renameDeck(deck, { en: "Renamed" });
    expect(await present()).toBe(true);
    await repository.saveDecks([{ ...renamed, authors: ["Kim"] }, other]);
    expect(await present()).toBe(true);
    await repository.removeDecks([other]);
    expect(await present()).toBe(true);
  });
});
