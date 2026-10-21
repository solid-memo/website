// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import type { Deck } from "@solid-memo/domain/deck";
import type { DraftTriple } from "@solid-memo/domain/release/releaseDraft";
import { createInstanceGraphUseCases } from "./instanceGraph";
import type {
  AnswerLog,
  DeckRepository,
  InstanceGraphReader,
  ReleaseDraftRepository,
  ReleasePublisher,
  StorageGateway,
} from "./ports";

const STORAGE = "https://pod.example/";
const WEBID = `${STORAGE}profile/card#me`;
const INSTANCE = `${STORAGE}solid-memo/main/`;
const CATALOG = `${INSTANCE}catalog.ttl`;
const CARDS = `${INSTANCE}decks/capitals.ttl`;
const REVIEWS = `${INSTANCE}reviews/capitals.ttl`;
const DRAFT = `${INSTANCE}drafts/capitals/v2/release.ttl`;
const RELEASE = `${INSTANCE}releases/capitals/v1.ttl`;
const ELSEWHERE = "https://other.example/decks/capitals.ttl";
const PUBLISHER = "http://purl.org/dc/terms/publisher";

function setUp({
  decks = [{ cardsDocumentUrl: CARDS, reviewsDocumentUrl: REVIEWS }] as Deck[],
  documents = new Map<string, DraftTriple[]>([
    [
      CATALOG,
      [
        {
          subject: `${CATALOG}#catalog`,
          predicate: PUBLISHER,
          object: { kind: "iri", value: WEBID },
        },
      ],
    ],
  ]),
} = {}) {
  const reader = {
    readDocument: vi.fn(async (url: string) => documents.get(url) ?? null),
  } satisfies InstanceGraphReader;
  const storageGateway = {
    discoverStorages: vi.fn(async () => [{ url: STORAGE, source: "profile" as const }]),
  } as unknown as StorageGateway;
  const deckRepository = { listDecks: vi.fn(async () => decks) } as unknown as DeckRepository;
  const answerLog = { months: vi.fn(async () => ["2026-09", "2026-10"]) } as unknown as AnswerLog;
  const releaseDraftRepository = {
    documents: vi.fn(async () => [DRAFT, `${INSTANCE}drafts/capitals/v2/cards.ttl`]),
  } as unknown as ReleaseDraftRepository;
  const releasePublisher = {
    listPublished: vi.fn(async () => [RELEASE, "https://pod.example/public/capitals/v2.ttl"]),
  } as unknown as ReleasePublisher;
  const useCases = createInstanceGraphUseCases({
    instanceGraphReader: reader,
    storageGateway,
    deckRepository,
    answerLog,
    releaseDraftRepository,
    releasePublisher,
  });
  return { reader, storageGateway, useCases };
}

describe("readInstanceGraph", () => {
  it("reads every Solid Memo document of the instance, each once, and nothing outside it", async () => {
    const { reader, storageGateway, useCases } = setUp({
      decks: [
        { cardsDocumentUrl: CARDS, reviewsDocumentUrl: REVIEWS },
        { cardsDocumentUrl: CARDS, reviewsDocumentUrl: ELSEWHERE },
      ] as Deck[],
    });
    const graph = await useCases.readInstanceGraph(INSTANCE, WEBID);
    expect(reader.readDocument.mock.calls.map(([url]) => url).sort()).toEqual(
      [
        `${INSTANCE}meta.ttl`,
        `${INSTANCE}preferences.ttl`,
        `${INSTANCE}palettes.ttl`,
        CATALOG,
        CARDS,
        REVIEWS,
        `${INSTANCE}digest.ttl`,
        `${INSTANCE}history/2026-09.ttl`,
        `${INSTANCE}history/2026-10.ttl`,
        DRAFT,
        `${INSTANCE}drafts/capitals/v2/cards.ttl`,
        RELEASE,
      ].sort(),
    );
    expect(storageGateway.discoverStorages).toHaveBeenCalledWith(WEBID);
    expect(graph.nodes.find((node) => node.id === CATALOG)).toMatchObject({ found: true });
    expect(graph.nodes.find((node) => node.id === CARDS)).toMatchObject({ found: false });
    // The publisher, in a storage of the user's, is drawn and not read.
    expect(graph.nodes.find((node) => node.id === WEBID)?.kind).toBe("podLeaf");
    expect(graph.nodes.some((node) => node.id === ELSEWHERE)).toBe(false);
  });

  it("tells how many documents are read of how many, from none", async () => {
    const { useCases } = setUp({ decks: [] });
    const onProgress = vi.fn();
    await useCases.readInstanceGraph(INSTANCE, WEBID, { onProgress });
    expect(onProgress.mock.calls).toEqual(Array.from({ length: 11 }, (_, read) => [read, 10]));
  });

  it("reads a few documents at a time", async () => {
    const { reader, useCases } = setUp();
    let reading = 0;
    let most = 0;
    reader.readDocument.mockImplementation(async () => {
      most = Math.max(most, ++reading);
      await new Promise((resolve) => setTimeout(resolve, 1));
      reading--;
      return [];
    });
    const graph = await useCases.readInstanceGraph(INSTANCE, WEBID);
    expect(most).toBe(6);
    expect(graph.nodes.filter((node) => node.kind === "document")).toHaveLength(12);
  });

  it("draws a document that cannot be read as such, and the rest as read", async () => {
    const { reader, useCases } = setUp();
    reader.readDocument.mockImplementation(async (url) => {
      if (url === CATALOG) throw new Error("403");
      return [];
    });
    const graph = await useCases.readInstanceGraph(INSTANCE, WEBID);
    expect(graph.nodes.find((node) => node.id === CATALOG)).toMatchObject({
      found: false,
      unreadable: true,
    });
    expect(graph.nodes.filter((node) => node.kind === "document")).toHaveLength(12);
  });

  it("reads no address the catalog names that climbs out of the instance, nor a folder", async () => {
    const { reader, useCases } = setUp({
      decks: [
        {
          cardsDocumentUrl: `${INSTANCE}../../private/cards.ttl`,
          reviewsDocumentUrl: `${INSTANCE}%2e%2e/%2E%2E/private/reviews.ttl`,
        },
        { cardsDocumentUrl: `${INSTANCE}decks/`, reviewsDocumentUrl: `${REVIEWS}#part` },
      ] as Deck[],
    });
    await useCases.readInstanceGraph(INSTANCE, WEBID);
    const urls = reader.readDocument.mock.calls.map(([url]) => url);
    expect(urls.filter((url) => url.includes("private"))).toEqual([]);
    expect(urls).not.toContain(`${INSTANCE}decks/`);
    // A document named by a part of it is read once, by its own address.
    expect(urls.filter((url) => url === REVIEWS)).toHaveLength(1);
  });

  it("draws the graph with no storages when they cannot be found", async () => {
    const { storageGateway, useCases } = setUp();
    vi.mocked(storageGateway.discoverStorages).mockRejectedValueOnce(new Error("404"));
    const graph = await useCases.readInstanceGraph(INSTANCE, WEBID);
    expect(graph.nodes.find((node) => node.id === WEBID)?.kind).toBe("outsideLeaf");
  });
});
