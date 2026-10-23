// @vitest-environment node

// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * An instance read as a graph against a real Solid server
 * (application/instanceGraph.ts): every Solid Memo document of the
 * instance is read, each once and only with GET, and nothing its
 * statements name, in the pod or outside it. Runs against each server
 * globalSetup.ts starts.
 */
import { describe, expect, inject, it } from "vitest";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/testing/shapeSources";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { createUseCases } from "@solid-memo/application/useCases";
import { NO_PORTS } from "@solid-memo/application/testing/noPorts";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { createSolidAnswerLog } from "@solid-memo/solid/solidAnswerLog";
import { createSolidDeckRepository } from "@solid-memo/solid/solidDeckRepository";
import { createSolidInstanceGraphReader } from "@solid-memo/solid/solidInstanceGraphReader";
import { createSolidInstanceRepository } from "@solid-memo/solid/solidInstanceRepository";
import { createSolidPreferencesRepository } from "@solid-memo/solid/solidPreferencesRepository";
import { createSolidStorageGateway } from "@solid-memo/solid/solidStorageGateway";
import { createSolidWebIdDocumentRepository } from "@solid-memo/solid/solidWebIdDocumentRepository";

const SERVERS = inject("solidServers");

/** A page of the app as createAppUseCases wires it, as far as the graph needs, every request recorded. */
function page() {
  const requests: { method: string; url: string }[] = [];
  const recording: typeof fetch = (input, init) => {
    requests.push({ method: (init?.method ?? "GET").toUpperCase(), url: String(input) });
    return fetch(input, init);
  };
  const shapeValidator = createShaclShapeValidator({
    fetch: recording,
    shapesFetch,
    ...SHAPE_SOURCES,
  });
  const deps = {
    fetch: recording,
    checkWrite: shapeValidator.checkSubjects,
    now: () => new Date(),
    randomId: () => crypto.randomUUID(),
  };
  const useCases = createUseCases({
    ...NO_PORTS,
    sessionGateway: undefined as never,
    deckLibrary: undefined as never,
    reviewStateRepository: undefined as never,
    repairRepository: undefined as never,
    instanceCopier: undefined as never,
    shapeValidator,
    webIdDocumentRepository: createSolidWebIdDocumentRepository({ fetch: recording }),
    storageGateway: createSolidStorageGateway({ fetch: recording }),
    instanceRepository: createSolidInstanceRepository(deps),
    deckRepository: createSolidDeckRepository(deps),
    preferencesRepository: createSolidPreferencesRepository(deps),
    answerLog: createSolidAnswerLog(deps),
    instanceGraphReader: createSolidInstanceGraphReader({ fetch: recording }),
  });
  return { useCases, requests };
}

describe.each(SERVERS)("an instance's graph on $name", ({ url: server }) => {
  it("reads every document of the instance once, and nothing they name", async () => {
    const base = new URL(`graph-${crypto.randomUUID()}/`, server).href;
    const webId = `${base}profile/card#me`;
    const typeIndex = `${base}settings/privateTypeIndex.ttl`;
    const put = async (url: string, body: string) => {
      const response = await fetch(url, {
        method: "PUT",
        headers: { "content-type": "text/turtle" },
        body,
      });
      if (!response.ok) throw new Error(`Seeding ${url}: ${response.status}`);
    };
    await put(
      `${base}profile/card`,
      [
        `<#me> <http://www.w3.org/ns/solid/terms#privateTypeIndex> <${typeIndex}> ;`,
        `  <http://www.w3.org/ns/pim/space#storage> <${base}> .`,
      ].join("\n"),
    );
    await put(
      typeIndex,
      `<> a <http://www.w3.org/ns/solid/terms#TypeIndex>, <http://www.w3.org/ns/solid/terms#UnlistedDocument> .`,
    );
    const seeding = page().useCases;
    const instance = await seeding.createInstance(
      { webId },
      { containerUrl: `${base}solid-memo/`, name: "Main", registrationTarget: "private" },
    );
    const deck = await seeding.createDeck(instance.url, { en: "Capitals" });
    const card = await seeding.addCard(deck, {
      front: { en: "Sweden" },
      back: { en: "Stockholm" },
    });
    const gone = `${deck.cardsDocumentUrl}#card-removed`;
    await createSolidAnswerLog({ fetch }).append(instance.url, {
      id: "answer-20261019T100000000Z-1",
      deckUrl: deck.url,
      cardUrl: gone,
      direction: "front-to-back",
      grade: 4,
      answeredAt: "2026-10-19T10:00:00.000Z",
      studyDay: "2026-10-19",
      nextIntervalDays: 1,
    });

    const { useCases, requests } = page();
    const graph = await useCases.readInstanceGraph(instance.url, webId);
    const kindOf = (id: string) => graph.nodes.find((node) => node.id === id)?.kind;
    expect(graph.nodes.find((node) => node.id === `${instance.url}catalog.ttl`)).toMatchObject({
      kind: "document",
      found: true,
    });
    expect(kindOf(card.url)).toBe("resource");
    expect(graph.nodes.find((node) => node.id === card.url)?.types).toContain(SM.Card);
    expect(kindOf(`${instance.url}history/2026-10.ttl`)).toBe("document");
    expect(kindOf(gone)).toBe("missing");
    expect(kindOf(webId)).toBe("podLeaf");
    expect(kindOf(SM.Deck)).toBe("vocabularyLeaf");
    // Only reads: the profile, for the storages, and the instance's documents and folders.
    expect(requests.every(({ method }) => method === "GET" || method === "HEAD")).toBe(true);
    expect(
      requests.filter(
        ({ url }) => !url.startsWith(instance.url) && url.split("#")[0] !== `${base}profile/card`,
      ),
    ).toEqual([]);
    // Each document of the instance; the catalog, which the decks are listed from, read again by its version.
    const documents = requests.filter(
      ({ url }) => url.startsWith(instance.url) && !url.endsWith("/"),
    );
    expect(new Set(documents.map(({ url }) => url))).toEqual(
      new Set(
        [
          "meta.ttl",
          "preferences.ttl",
          "palettes.ttl",
          "catalog.ttl",
          "digest.ttl",
          "history/2026-10.ttl",
        ]
          .map((name) => `${instance.url}${name}`)
          .concat(deck.cardsDocumentUrl, deck.reviewsDocumentUrl),
      ),
    );
  });
});
