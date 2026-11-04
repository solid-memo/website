// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createReleaseDraftUseCases } from "@solid-memo/application/releaseDrafts";
import { draftLibraryDeck } from "@solid-memo/domain/release/draftListing";
import { NOW } from "@solid-memo/domain/testing/releaseDraft";
import { DECKS_ROOT } from "@solid-memo/vocab/tooling/root";
import { datasetFromQuads } from "./client/rdf";
import { toStandaloneLibraryDeck } from "./mappers/libraryMapper";
import { parseDeckFile } from "./solidDeckArchive";
import { draftPod, INSTANCE, POD } from "./testing/releaseDrafts";

const OUTSIDE = "https://outside.example/people#x";

it("publishes an imported release's creator outside it by its IRI, as the Studio shows it (GHSA-wjqr-hw63-jf4c)", async () => {
  const text = `${readFileSync(
    join(DECKS_ROOT, "academy-award-best-picture/v1.ttl"),
    "utf8",
  ).replace("dcterms:creator <#anton-wiklund> ;", `dcterms:creator <${OUTSIDE}> ;`)}
<${OUTSIDE}> a foaf:Agent ; foaf:name "Someone else" .
`;
  const pod = await draftPod();
  const useCases = createReleaseDraftUseCases({
    releaseDraftRepository: pod.repository,
    deckRepository: {} as never,
    deckLibrary: {} as never,
    shapeValidator: {} as never,
    fileExchange: { open: async () => ({ name: "release.ttl", text }), save: () => undefined },
    storageGateway: { discoverStorages: async () => [] },
    now: () => new Date(NOW),
  });
  const created = await useCases.createReleaseDraft(
    INSTANCE,
    { kind: "fromFile" },
    `${POD}profile/card#me`,
  );
  const draft = await useCases.getReleaseDraft(created!.draft.url);
  expect(draft.root.creator).toEqual([OUTSIDE]);
  expect(draft.triples.filter((triple) => triple.subject === OUTSIDE)).toEqual([]);
  expect(draftLibraryDeck(draft).authors).toEqual([OUTSIDE]);
  const target = `${POD}public/releases/academy-award-best-picture/v1.ttl`;
  const turtle = await pod.repository.assemble(draft.url, target, NOW);
  expect(turtle).not.toContain("Someone else");
  const quads = await parseDeckFile(turtle, "turtle", target, null);
  expect(quads.filter((quad) => quad.subject.value === OUTSIDE)).toEqual([]);
  expect(toStandaloneLibraryDeck(target, datasetFromQuads(quads)).authors).toEqual([OUTSIDE]);
});
