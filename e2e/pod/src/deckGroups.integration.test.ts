// @vitest-environment node
/**
 * Deck groups (docs/data-model.md "Deck groups") against a real Solid
 * server: the decks of an instance grouped, nested, moved, renamed and
 * ungrouped, each edit one PATCH of catalog.ttl, read back as written by
 * a new page and valid; a grouped deck removed leaves its group; and an
 * edit made while another tab adds a deck keeps that deck, as the edit
 * is applied again to the document as it is (where the server refuses a
 * stale If-Match, preconditionsOf) or patched beside it (where not).
 * Several decks are moved into a group, given a pace and a direction,
 * and removed at once, as the Studio does (docs/studio.md), each one
 * write of catalog.ttl. Every name is ASCII: the documents are PATCHed, which Community Solid
 * Server's in-memory store cuts short beyond ASCII (docs/testing.md).
 */
import { beforeAll, describe, expect, inject, it } from "vitest";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/sources";
import { createUseCases, type UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { TreeNode } from "@solid-memo/domain/deckTree";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { createSolidDeckRepository } from "@solid-memo/solid/solidDeckRepository";
import { createSolidDigestRepository } from "@solid-memo/solid/solidDigestRepository";
import { createSolidInstanceCopier } from "@solid-memo/solid/solidInstanceCopier";
import { createSolidInstanceRepository } from "@solid-memo/solid/solidInstanceRepository";
import { createSolidPreferencesRepository } from "@solid-memo/solid/solidPreferencesRepository";
import { createSolidRepairRepository } from "@solid-memo/solid/solidRepairRepository";
import { createSolidReviewStateRepository } from "@solid-memo/solid/solidReviewStateRepository";
import { createSolidWebIdDocumentRepository } from "@solid-memo/solid/solidWebIdDocumentRepository";
import { createWriteFence } from "@solid-memo/solid/writeFence";
import { etagMarksEveryEdit, preconditionsOf } from "./serverTraits";

const SERVERS = inject("solidServers");

/** A page of the app as createAppUseCases wires it; `beforeWrite` runs before each write it makes. */
function page(beforeWrite: (url: string) => Promise<void> = async () => undefined): UseCases {
  const watching: typeof fetch = async (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "PUT" || method === "PATCH") await beforeWrite(String(input));
    return fetch(input, init);
  };
  const writeFence = createWriteFence(watching);
  const podFetch = writeFence.fetch;
  const shapeValidator = createShaclShapeValidator({ fetch: podFetch, shapesFetch, ...SHAPE_SOURCES });
  const checkWrite = shapeValidator.checkSubjects;
  const deps = { fetch: podFetch, checkWrite, now: () => new Date(), randomId: () => crypto.randomUUID() };
  return createUseCases({
    sessionGateway: undefined as never,
    storageGateway: undefined as never,
    deckLibrary: undefined as never,
    webIdDocumentRepository: createSolidWebIdDocumentRepository({ fetch: podFetch }),
    instanceRepository: createSolidInstanceRepository(deps),
    deckRepository: createSolidDeckRepository(deps),
    preferencesRepository: createSolidPreferencesRepository({ fetch: podFetch, checkWrite }),
    reviewStateRepository: createSolidReviewStateRepository({ fetch: podFetch, checkWrite }),
    shapeValidator,
    repairRepository: createSolidRepairRepository({ fetch: podFetch }),
    instanceCopier: createSolidInstanceCopier({ fetch: podFetch }),
    writeFence,
    digestRepository: createSolidDigestRepository({ fetch: podFetch, checkWrite }),
    ruleset: "e2e-rules",
  });
}

/** An instance with the decks A, B, C and D, in that order, made by the app. */
async function seed(server: string): Promise<{ instanceUrl: string; decks: Record<string, Deck> }> {
  const base = new URL(`groups-${crypto.randomUUID()}/`, server).href;
  const webId = `${base}profile/card.ttl#me`;
  const typeIndex = `${base}settings/privateTypeIndex.ttl`;
  const put = async (url: string, body: string) => {
    const response = await fetch(url, { method: "PUT", headers: { "content-type": "text/turtle" }, body });
    if (!response.ok) throw new Error(`Seeding ${url}: ${response.status}`);
  };
  await put(`${base}profile/card.ttl`, `<#me> <http://www.w3.org/ns/solid/terms#privateTypeIndex> <${typeIndex}> .`);
  await put(typeIndex, `<> a <http://www.w3.org/ns/solid/terms#TypeIndex>, <http://www.w3.org/ns/solid/terms#UnlistedDocument> .`);
  const useCases = page();
  const instance = await useCases.createInstance({ webId }, { containerUrl: `${base}solid-memo/`, name: "Main", registrationTarget: "private" });
  const decks: Record<string, Deck> = {};
  let after: string | null = null;
  for (const name of ["A", "B", "C", "D"]) {
    const deck = await useCases.createDeck(instance.url, { en: name });
    decks[name] = deck;
    // New decks have no position, so they come in the order the server keeps them in: put them in this one.
    await useCases.editDeckTree(instance.url, { kind: "move", node: deck.url, to: { parent: null, after } });
    after = deck.url;
  }
  return { instanceUrl: instance.url, decks };
}

/** A tree by name: a deck's, or a group's with its children's. */
function names(nodes: readonly TreeNode[]): unknown[] {
  return nodes.map((node) => (node.kind === "deck" ? node.deck.title.en : { [node.group.title.en!]: names(node.children) }));
}

describe.each(SERVERS)("deck groups on $name", ({ url: server }) => {
  /** Whether this server refuses an edit whose If-Match names another version, and tells every edit apart. */
  let conditional = false;
  beforeAll(async () => {
    conditional = (await preconditionsOf(server)).edits && (await etagMarksEveryEdit(server));
  });

  it("groups, nests, moves, renames and ungroups decks, each edit read back as written and the instance valid", async () => {
    const { instanceUrl, decks } = await seed(server);
    const useCases = page();
    const fresh = async () => names((await page().listDeckTree(instanceUrl)).children);

    const languages = useCases.newDeckGroup(instanceUrl, { en: "New group" });
    await useCases.editDeckTree(instanceUrl, { kind: "combine", dragged: decks.C!.url, target: decks.A!.url, group: languages });
    await useCases.editDeckTree(instanceUrl, { kind: "rename", group: languages.url, title: { en: "Languages" } });
    expect(await fresh()).toEqual([{ Languages: ["A", "C"] }, "B", "D"]);

    const scripts = useCases.newDeckGroup(instanceUrl, { en: "Scripts" });
    await useCases.editDeckTree(instanceUrl, { kind: "combine", dragged: decks.B!.url, target: decks.C!.url, group: scripts });
    expect(await fresh()).toEqual([{ Languages: ["A", { Scripts: ["C", "B"] }] }, "D"]);

    await useCases.editDeckTree(instanceUrl, { kind: "move", node: decks.D!.url, to: { parent: null, after: null } });
    await useCases.editDeckTree(instanceUrl, { kind: "move", node: decks.A!.url, to: { parent: scripts.url, after: decks.B!.url } });
    expect(await fresh()).toEqual(["D", { Languages: [{ Scripts: ["C", "B", "A"] }] }]);
    expect((await page().validateInstance(instanceUrl)).conforms).toBe(true);

    await useCases.removeDeck(decks.B!);
    expect(await fresh()).toEqual(["D", { Languages: [{ Scripts: ["C", "A"] }] }]);

    await useCases.editDeckTree(instanceUrl, { kind: "removeGroup", group: languages.url });
    expect(await fresh()).toEqual(["D", { Scripts: ["C", "A"] }]);
    expect((await page().validateInstance(instanceUrl)).conforms).toBe(true);
  });

  it("keeps a deck another tab adds while an edit is written", async () => {
    const { instanceUrl, decks } = await seed(server);
    let catalogWrites = 0;
    const useCases = page(async (url) => {
      if (!url.endsWith("/catalog.ttl") || catalogWrites++ > 0) return;
      await page().createDeck(instanceUrl, { en: "E" });
    });
    const group = useCases.newDeckGroup(instanceUrl, { en: "Pair" });
    await useCases.editDeckTree(instanceUrl, { kind: "combine", dragged: decks.B!.url, target: decks.A!.url, group });
    // Refused as changed, then made again on the document as it is; or, where the server may not refuse it,
    // perhaps patched beside the new deck.
    if (conditional) expect(catalogWrites).toBe(2);
    expect(names((await page().listDeckTree(instanceUrl)).children)).toEqual([{ Pair: ["A", "B"] }, "C", "D", "E"]);
    expect((await page().validateInstance(instanceUrl)).conforms).toBe(true);
  });

  it("moves, paces, directs and removes several decks at once, each one write of the catalog", async () => {
    const { instanceUrl, decks } = await seed(server);
    const writes: string[] = [];
    const useCases = page(async (url) => {
      writes.push(url);
    });
    const fresh = async () => names((await page().listDeckTree(instanceUrl)).children);

    const pair = useCases.newDeckGroup(instanceUrl, { en: "Pair" });
    await useCases.editDeckTree(instanceUrl, { kind: "combine", dragged: decks.B!.url, target: decks.A!.url, group: pair });
    writes.length = 0;
    await useCases.editDeckTree(instanceUrl, { kind: "gather", nodes: [decks.D!.url, decks.C!.url], parent: pair.url });
    expect(await fresh()).toEqual([{ Pair: ["A", "B", "D", "C"] }]);

    const all = (await page().listDecks(instanceUrl)).filter((deck) => [decks.A, decks.C].some((one) => one!.url === deck.url));
    await useCases.setDecksPace(all, { newCardsPerDay: 3 });
    const paced = await useCases.setDecksDirection(
      (await page().listDecks(instanceUrl)).filter((deck) => all.some((one) => one.url === deck.url)),
      "bidirectional",
    );
    // In the order the server lists them.
    expect(paced.map((deck) => [deck.title.en, deck.newCardsPerDay, deck.direction]).sort()).toEqual([
      ["A", 3, "bidirectional"],
      ["C", 3, "bidirectional"],
    ]);
    const read = await page().listDecks(instanceUrl);
    expect(read.filter((deck) => deck.newCardsPerDay === 3).map((deck) => deck.title.en).sort()).toEqual(["A", "C"]);

    await useCases.removeDecks(read.filter((deck) => deck.title.en === "B" || deck.title.en === "D"));
    expect(await fresh()).toEqual([{ Pair: ["A", "C"] }]);
    // One write of the catalog each: the move, the pace, the direction and the removal.
    expect(writes.filter((url) => url.endsWith("/catalog.ttl"))).toHaveLength(4);
    expect((await page().validateInstance(instanceUrl)).conforms).toBe(true);
  });
});
