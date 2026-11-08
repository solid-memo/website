// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { AppError } from "@solid-memo/domain/appError";
import { GUEST_INSTANCE_URL, GUEST_ORIGIN, GUEST_WEBID } from "@solid-memo/domain/guest";
import type { Card, Deck } from "@solid-memo/domain/deck";
import {
  draftSummaryOf,
  draftUrlOf,
  type ReleaseDraftSummary,
} from "@solid-memo/domain/release/draftLayout";
import {
  applyDraftChanges,
  blankDraft,
  RDF_TYPE,
  type DraftChange,
  type DraftTriple,
  type ReleaseDraft,
} from "@solid-memo/domain/release/releaseDraft";
import { rebaseDraft } from "@solid-memo/domain/release/releaseToDraft";
import { nextVersionDraft } from "@solid-memo/domain/release/releaseVersion";
import { courseDraft, NOW } from "@solid-memo/domain/testing/releaseDraft";
import { problem } from "@solid-memo/domain/release/problems";
import { SM } from "@solid-memo/vocab/vocab.generated";
import type {
  DeckLibrary,
  DeckRepository,
  FileExchange,
  ReleaseDraftRepository,
  ShapeValidator,
} from "./ports";
import { createReleaseDraftUseCases } from "./releaseDrafts";

const INSTANCE = "https://pod.example/solid-memo/main/";
const WEB_ID = "https://pod.example/profile/card#me";
const V1 = "https://pod.example/solid-memo/main/releases/solid/v1.ttl";
const DECKS = "https://site.example/decks/";
const XSD_STRING = "http://www.w3.org/2001/XMLSchema#string";
const FOAF_NAME = "http://xmlns.com/foaf/0.1/name";
const INDEX = `${DECKS}index.ttl`;

const deck: Deck = {
  id: "deck-1",
  url: `${INSTANCE}catalog.ttl#deck-1`,
  title: { en: "Capitals" },
  cardsDocumentUrl: `${INSTANCE}decks/deck-1.ttl`,
  reviewsDocumentUrl: `${INSTANCE}reviews/deck-1.ttl`,
  createdAt: NOW,
  formatVersion: 6,
  direction: "front-to-back",
  authors: [],
};
const cards: Card[] = [
  {
    id: "c1",
    url: `${deck.cardsDocumentUrl}#c1`,
    front: { en: "Sweden" },
    back: { en: "Stockholm" },
    createdAt: NOW,
    formatVersion: 5,
  },
];

/** Release 1 of the course fixture, published at V1. */
const v1: ReleaseDraft = rebaseDraft(courseDraft(), V1);

function setUp({
  drafts = [] as ReleaseDraftSummary[],
  stored = courseDraft() as ReleaseDraft,
  storages = ["https://pod.example/"],
} = {}) {
  const repository = {
    list: vi.fn(async () => drafts),
    documents: vi.fn(async () => []),
    create: vi.fn(async (_instance: string, draft: ReleaseDraft) => draftSummaryOf(draft)!),
    read: vi.fn(async () => ({ draft: stored, version: "v1" })),
    applyChanges: vi.fn(async () => undefined),
    assemble: vi.fn(),
    readRelease: vi.fn(async (_url: string, _options?: { asNoOne?: boolean }) => v1),
    readLinked: vi.fn(async (): Promise<DraftTriple[]> => []),
    parseRelease: vi.fn(async () => v1),
    delete: vi.fn(async () => ({ keptDocuments: [] })),
  } satisfies ReleaseDraftRepository;
  const deckRepository = { listCards: vi.fn(async () => cards) } as unknown as DeckRepository;
  const fileExchange: FileExchange = {
    save: vi.fn(),
    open: vi.fn(async () => ({ name: "solid.ttl", text: "<> a <x> ." })),
  };
  const deckLibrary = {
    readLibraryIndex: vi.fn(async () => ({
      url: INDEX,
      publisher: `${INDEX}#solid-memo`,
      releases: [`${DECKS}solid/v1.ttl`],
    })),
  } as unknown as DeckLibrary & { readLibraryIndex: ReturnType<typeof vi.fn> };
  const shapeValidator = {
    validateRelease: vi.fn(async (draft: ReleaseDraft) => [
      problem(draft.url, { code: "unshaped", params: {} }, { severity: "warning" }),
    ]),
  } as unknown as ShapeValidator & { validateRelease: ReturnType<typeof vi.fn> };
  const storageGateway = {
    discoverStorages: vi.fn(async (_webId: string) =>
      storages.map((url) => ({ url, source: "profile" as const })),
    ),
  };
  const useCases = createReleaseDraftUseCases({
    releaseDraftRepository: repository,
    deckRepository,
    deckLibrary,
    shapeValidator,
    fileExchange,
    storageGateway,
    now: () => new Date(NOW),
  });
  const created = () => repository.create.mock.calls.at(-1)![1];
  return {
    repository,
    deckRepository,
    deckLibrary,
    shapeValidator,
    fileExchange,
    storageGateway,
    useCases,
    created,
  };
}

const summary = (name: string, version: number): ReleaseDraftSummary => ({
  url: draftUrlOf(INSTANCE, name, version),
  instanceUrl: INSTANCE,
  name,
  version,
  readable: true,
  title: {},
  course: false,
});

describe("listReleaseDrafts and deleteReleaseDraft", () => {
  it("are the repository's", async () => {
    const { repository, useCases } = setUp({ drafts: [summary("a", 1)] });
    await expect(useCases.listReleaseDrafts(INSTANCE)).resolves.toEqual([summary("a", 1)]);
    await useCases.deleteReleaseDraft(summary("a", 1));
    expect(repository.delete).toHaveBeenCalledWith(summary("a", 1));
  });
});

describe("createReleaseDraft", () => {
  it("makes a blank deck or course, named after its title, unlike the instance's drafts of its version", async () => {
    const { useCases, created } = setUp({
      drafts: [summary("capitals", 1), summary("capitals-2", 2)],
    });
    const made = await useCases.createReleaseDraft(
      INSTANCE,
      {
        kind: "blankDeck",
        title: { en: " Capitals " },
      },
      WEB_ID,
    );
    expect(made).toEqual({
      draft: expect.objectContaining({
        name: "capitals-2",
        version: 1,
        title: { en: "Capitals" },
        course: false,
      }),
    });
    expect(created()).toEqual(
      blankDraft({
        url: draftUrlOf(INSTANCE, "capitals-2", 1),
        course: false,
        title: { en: "Capitals" },
        now: NOW,
      }),
    );
    await useCases.createReleaseDraft(
      INSTANCE,
      { kind: "blankCourse", title: { sv: "Kurs" } },
      WEB_ID,
    );
    expect(created().course).toBe(true);
  });

  it("makes one of a deck, saying the release a copy is based on", async () => {
    const { useCases, deckRepository, created } = setUp();
    await expect(
      useCases.createReleaseDraft(INSTANCE, { kind: "fromDeck", deck }, WEB_ID),
    ).resolves.toEqual({ draft: expect.objectContaining({ name: "capitals" }) });
    expect(deckRepository.listCards).toHaveBeenCalledWith(deck, { asNoOne: false });
    expect(created().cards.map((node) => node.id)).toEqual(["c1"]);
    const copy = { ...deck, sourceUrl: "https://solid-memo.com/decks/capitals/v1.ttl" };
    await expect(
      useCases.createReleaseDraft(INSTANCE, { kind: "fromDeck", deck: copy }, WEB_ID),
    ).resolves.toEqual({
      draft: expect.objectContaining({ name: "capitals" }),
      basedOn: "https://solid-memo.com/decks/capitals/v1.ttl",
    });
  });

  it("reads the user's own cards as no one for a draft of a deck in an instance on another origin", async () => {
    const { useCases, deckRepository, created } = setUp();
    const foreign = "https://attacker.example/solid-memo/";
    // The foreign instance's catalog names a deck whose cards are in the user's pod.
    const named = { ...deck, url: `${foreign}catalog.ttl#deck-1` };
    await useCases.createReleaseDraft(foreign, { kind: "fromDeck", deck: named }, WEB_ID);
    expect(deckRepository.listCards).toHaveBeenCalledWith(named, { asNoOne: true });
    expect(created().url).toBe(draftUrlOf(foreign, "capitals", 1));
  });

  it("reads as the user only the cards of a deck in the instance's pod, any other as no one", async () => {
    const { useCases, deckRepository } = setUp({
      storages: ["https://pod.example/", "https://other.example/alice/"],
    });
    const asNoOne = async (cardsDocumentUrl: string) => {
      vi.mocked(deckRepository.listCards).mockClear();
      await useCases.createReleaseDraft(
        INSTANCE,
        { kind: "fromDeck", deck: { ...deck, cardsDocumentUrl } },
        WEB_ID,
      );
      return vi.mocked(deckRepository.listCards).mock.calls[0]![1]!.asNoOne;
    };
    await expect(asNoOne(`${INSTANCE}decks/deck-1.ttl`)).resolves.toBe(false);
    await expect(asNoOne("https://pod.example/elsewhere/deck-1.ttl")).resolves.toBe(false);
    await expect(asNoOne("https://other.example/alice/deck-1.ttl")).resolves.toBe(true);
    await expect(asNoOne("https://elsewhere.example/deck-1.ttl")).resolves.toBe(true);
  });

  it("makes the next version of a release, named as its URL names its series", async () => {
    const { useCases, repository, created } = setUp();
    await expect(
      useCases.createReleaseDraft(INSTANCE, { kind: "nextVersionOf", url: V1 }, WEB_ID),
    ).resolves.toEqual({
      draft: expect.objectContaining({ name: "solid", version: 2 }),
    });
    expect(repository.readRelease).toHaveBeenCalledWith(V1, { asNoOne: false });
    expect(created().root).toMatchObject({ version: "2", prev: V1 });
    expect(created().published.ids).toMatchObject({ "q-a-1a": "card" });
  });

  it("reads as the user only a release of the instance, or of a storage of theirs the instance is in, any other as no one", async () => {
    const { useCases, repository, storageGateway } = setUp({
      storages: ["https://pod.example/", "https://other.example/alice/"],
    });
    const asNoOne = async (instanceUrl: string, url: string) => {
      repository.readRelease.mockClear();
      await useCases.createReleaseDraft(instanceUrl, { kind: "nextVersionOf", url }, WEB_ID);
      return repository.readRelease.mock.calls[0]![1]!.asNoOne;
    };
    // In the instance, or in the storage it is in: the instance's, read as the user.
    await expect(asNoOne(INSTANCE, V1)).resolves.toBe(false);
    await expect(asNoOne(INSTANCE, "https://pod.example/elsewhere/solid/v1.ttl")).resolves.toBe(
      false,
    );
    expect(storageGateway.discoverStorages).toHaveBeenCalledWith(WEB_ID);
    // The user's own, but in a storage the instance is not in.
    await expect(asNoOne(INSTANCE, "https://other.example/alice/solid/v1.ttl")).resolves.toBe(true);
    // Anyone else's.
    await expect(asNoOne(INSTANCE, "https://elsewhere.example/solid/v1.ttl")).resolves.toBe(true);
  });

  it("reads the user's own release as no one when an instance on another origin names it", async () => {
    const { useCases, repository, created } = setUp();
    const foreign = "https://attacker.example/solid-memo/";
    await useCases.createReleaseDraft(foreign, { kind: "nextVersionOf", url: V1 }, WEB_ID);
    expect(repository.readRelease).toHaveBeenCalledWith(V1, { asNoOne: true });
    expect(created().url).toBe(draftUrlOf(foreign, "solid", 2));
  });

  it("reads a release as no one when the user's storages cannot be found", async () => {
    const { useCases, repository, storageGateway } = setUp();
    storageGateway.discoverStorages.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await useCases.createReleaseDraft(
      INSTANCE,
      { kind: "nextVersionOf", url: "https://pod.example/elsewhere/solid/v1.ttl" },
      WEB_ID,
    );
    expect(repository.readRelease).toHaveBeenCalledWith(
      "https://pod.example/elsewhere/solid/v1.ttl",
      { asNoOne: true },
    );
  });

  it("describes in the next version the series and publisher its release names in another document, as that document does", async () => {
    const { useCases, repository, created } = setUp();
    const INDEX = "https://solid-memo.com/decks/index.ttl";
    const release = {
      ...v1,
      root: { ...v1.root, inSeries: `${INDEX}#solid`, isVersionOf: `${INDEX}#solid` },
    };
    repository.readRelease.mockResolvedValueOnce({
      ...release,
      triples: v1.triples.filter((triple) => !triple.subject.endsWith("#series")),
    });
    const series = {
      subject: `${INDEX}#solid`,
      predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
      object: { kind: "iri" as const, value: "http://www.w3.org/ns/dcat#DatasetSeries" },
    };
    repository.readLinked.mockResolvedValueOnce([series]);
    await useCases.createReleaseDraft(INSTANCE, { kind: "nextVersionOf", url: V1 }, WEB_ID);
    expect(repository.readLinked).toHaveBeenCalledWith(expect.objectContaining({ url: V1 }));
    expect(created().triples).toContainEqual(series);
  });

  it("names the next version of a release elsewhere after its title, and counts one stating no version as 1", async () => {
    const { useCases, repository } = setUp();
    const elsewhere = rebaseDraft(courseDraft(), "https://other.example/course.ttl");
    repository.readRelease.mockResolvedValueOnce({
      ...elsewhere,
      root: { ...elsewhere.root, version: undefined, title: undefined },
    });
    await expect(
      useCases.createReleaseDraft(
        INSTANCE,
        {
          kind: "nextVersionOf",
          url: "https://other.example/course.ttl",
        },
        WEB_ID,
      ),
    ).resolves.toEqual({
      draft: expect.objectContaining({ name: "draft", version: 2 }),
    });
  });

  it("imports a release file as it is, or nothing when none is picked", async () => {
    const { useCases, repository, fileExchange, created } = setUp();
    await expect(
      useCases.createReleaseDraft(INSTANCE, { kind: "fromFile" }, WEB_ID),
    ).resolves.toEqual({
      draft: expect.objectContaining({ name: "solid", version: 1 }),
    });
    expect(repository.parseRelease).toHaveBeenCalledWith("<> a <x> .", "turtle");
    expect(created().root.version).toBe("1");
    expect(created().published).toEqual({ ids: {}, activities: [] });
    const file = {
      ...v1,
      url: "https://file.solid-memo.invalid/solid.ttl",
      root: { ...v1.root, version: undefined, title: undefined },
    };
    repository.parseRelease.mockResolvedValueOnce(file);
    await expect(
      useCases.createReleaseDraft(INSTANCE, { kind: "fromFile" }, WEB_ID),
    ).resolves.toEqual({
      draft: expect.objectContaining({ name: "draft", version: 1 }),
    });
    vi.mocked(fileExchange.open).mockResolvedValueOnce(null);
    await expect(
      useCases.createReleaseDraft(INSTANCE, { kind: "fromFile" }, WEB_ID),
    ).resolves.toBeNull();
  });

  it("imports a release file in another's series in a series of its own, without what it states of that one (GHSA-38m7-8r5j-q79f)", async () => {
    const { useCases, repository, created } = setUp();
    const SERIES = "https://creator.example/memo/releases/capitals/v1.ttl#series";
    const DCAT = "http://www.w3.org/ns/dcat#";
    repository.parseRelease.mockResolvedValueOnce({
      ...v1,
      root: { ...v1.root, version: "999", inSeries: SERIES, isVersionOf: SERIES },
      triples: [
        ...v1.triples,
        {
          subject: SERIES,
          predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
          object: { kind: "iri", value: `${DCAT}DatasetSeries` },
        },
        {
          subject: SERIES,
          predicate: `${DCAT}hasCurrentVersion`,
          object: { kind: "blank", value: "b0" },
        },
        {
          subject: "_:b0",
          predicate: `${DCAT}version`,
          object: {
            kind: "literal",
            value: "999",
            language: "",
            datatype: "http://www.w3.org/2001/XMLSchema#string",
          },
        },
      ],
    });
    await useCases.createReleaseDraft(INSTANCE, { kind: "fromFile" }, WEB_ID);
    const draft = created();
    expect(draft.root.inSeries).toBe(`${draft.url}#series`);
    expect(draft.root.isVersionOf).toBe(`${draft.url}#series`);
    const named = draft.triples.flatMap((triple) => [
      triple.subject,
      ...(triple.object.kind === "iri" ? [triple.object.value] : []),
    ]);
    expect(named).not.toContain(SERIES);
    expect(named).not.toContain("_:b0");
  });

  it("keeps no version a release's own series lists but its own, nor what only those lead to (GHSA-jp29-vf56-5g4g)", async () => {
    const { useCases, repository, created } = setUp();
    const DCAT = "http://www.w3.org/ns/dcat#";
    const SERIES = `${V1}#series`;
    // The address its next version is published at, and one elsewhere, each listed with notes of the file's choosing.
    const NEXT = `${INSTANCE}releases/solid/v2.ttl`;
    const ELSEWHERE = "https://attacker.example/x/v2.ttl";
    const notes = (subject: string): DraftTriple => ({
      subject,
      predicate: "http://www.w3.org/ns/adms#versionNotes",
      object: { kind: "literal", value: "Planted", language: "", datatype: XSD_STRING },
    });
    const crafted: ReleaseDraft = {
      ...v1,
      triples: [
        ...v1.triples,
        { subject: SERIES, predicate: `${DCAT}hasVersion`, object: { kind: "iri", value: V1 } },
        { subject: SERIES, predicate: `${DCAT}hasVersion`, object: { kind: "iri", value: NEXT } },
        {
          subject: SERIES,
          predicate: `${DCAT}hasVersion`,
          object: { kind: "iri", value: ELSEWHERE },
        },
        { subject: SERIES, predicate: `${DCAT}first`, object: { kind: "iri", value: ELSEWHERE } },
        notes(NEXT),
        notes(`${NEXT}#x`),
        notes(ELSEWHERE),
        {
          subject: ELSEWHERE,
          predicate: "http://purl.org/dc/terms/publisher",
          object: { kind: "blank", value: "b0" },
        },
        notes("_:b0"),
        {
          subject: `${V1}#q-a-1a`,
          predicate: "http://www.w3.org/2000/01/rdf-schema#seeAlso",
          object: { kind: "iri", value: `${NEXT}#x` },
        },
      ],
    };
    const planted = (draft: ReleaseDraft) =>
      draft.triples.filter(
        (triple) =>
          [NEXT, `${NEXT}#x`, ELSEWHERE, "_:b0"].includes(triple.subject) ||
          (triple.subject.endsWith("#series") && [NEXT, ELSEWHERE].includes(triple.object.value)),
      );
    repository.parseRelease.mockResolvedValueOnce(crafted);
    await useCases.createReleaseDraft(INSTANCE, { kind: "fromFile" }, WEB_ID);
    const imported = created();
    expect(planted(imported)).toEqual([]);
    expect(imported.triples.filter((triple) => triple.predicate === `${DCAT}hasVersion`)).toEqual([
      {
        subject: `${imported.url}#series`,
        predicate: `${DCAT}hasVersion`,
        object: { kind: "iri", value: imported.url },
      },
    ]);
    // A release published with them carries none into its next version, which its own place takes.
    repository.readRelease.mockResolvedValueOnce(crafted);
    await useCases.createReleaseDraft(INSTANCE, { kind: "nextVersionOf", url: V1 }, WEB_ID);
    const next = created();
    expect(planted(next)).toEqual([]);
    expect(next.triples).toContainEqual({
      subject: SERIES,
      predicate: `${DCAT}hasVersion`,
      object: { kind: "iri", value: V1 },
    });
    expect(next.triples).toContainEqual({
      ...crafted.triples.at(-1)!,
      subject: `${next.url}#q-a-1a`,
    });
  });

  it("keeps nothing a release states of where its draft is published, wherever the release is (GHSA-jp29-vf56-5g4g)", async () => {
    const { useCases, repository, created } = setUp();
    const notes = (subject: string): DraftTriple => ({
      subject,
      predicate: "http://www.w3.org/ns/adms#versionNotes",
      object: { kind: "literal", value: "Planted", language: "", datatype: XSD_STRING },
    });
    /** The course at `url`, stating what it may of the instance's `releases/solid/v<from>.ttl` and later. */
    const stating = (url: string, from: number): ReleaseDraft => {
      const at = (version: number) => `${INSTANCE}releases/solid/v${version}.ttl`;
      const release = rebaseDraft(courseDraft(), url);
      return {
        ...release,
        triples: [
          ...release.triples,
          {
            subject: `${url}#q-a-1a`,
            predicate: "http://www.w3.org/2000/01/rdf-schema#seeAlso",
            object: { kind: "iri", value: `${at(from)}#x` },
          },
          notes(at(from)),
          notes(`${at(from)}#x`),
          notes(at(from + 1)),
          {
            subject: at(from),
            predicate: "http://purl.org/dc/terms/publisher",
            object: { kind: "blank", value: "b0" },
          },
          notes("_:b0"),
          {
            subject: `${url}#q-a-1a`,
            predicate: "http://www.w3.org/2000/01/rdf-schema#seeAlso",
            object: { kind: "iri", value: at(from - 1) },
          },
          notes(at(from - 1)),
        ],
      };
    };
    const placed = (draft: ReleaseDraft) =>
      draft.triples.filter(
        ({ subject }) =>
          (subject.startsWith(`${INSTANCE}releases/solid/`) &&
            !subject.includes("/v0.ttl") &&
            !subject.endsWith("/v1.ttl")) ||
          subject === "_:b0",
      );
    // The next version of a release in another pod is published in the instance's releases/ all the same.
    repository.readRelease.mockResolvedValueOnce(
      stating("https://elsewhere.example/releases/solid/v1.ttl", 2),
    );
    await useCases.createReleaseDraft(
      INSTANCE,
      { kind: "nextVersionOf", url: "https://elsewhere.example/releases/solid/v1.ttl" },
      WEB_ID,
    );
    const next = created();
    expect(next.url).toBe(`${INSTANCE}drafts/solid/v2/release.ttl`);
    expect(placed(next)).toEqual([]);
    // What it states of an address before its place, and a link to its place, are kept.
    expect(next.triples).toContainEqual(notes(`${INSTANCE}releases/solid/v1.ttl`));
    expect(next.triples).toContainEqual({
      subject: `${next.url}#q-a-1a`,
      predicate: "http://www.w3.org/2000/01/rdf-schema#seeAlso",
      object: { kind: "iri", value: `${INSTANCE}releases/solid/v2.ttl#x` },
    });
    // So is a file's, imported as version 1, published at the instance's releases/solid/v1.ttl.
    repository.parseRelease.mockResolvedValueOnce(
      stating("https://elsewhere.example/x/solid/v1.ttl", 1),
    );
    await useCases.createReleaseDraft(INSTANCE, { kind: "fromFile" }, WEB_ID);
    const imported = created();
    expect(imported.url).toBe(`${INSTANCE}drafts/solid/v1/release.ttl`);
    expect(
      imported.triples.filter(
        ({ subject }) => subject.startsWith(`${INSTANCE}releases/solid/v`) || subject === "_:b0",
      ),
    ).toEqual([notes(`${INSTANCE}releases/solid/v0.ttl`)]);
  });

  it("refuses a release that names a subject by an id a draft cannot keep, writing nothing", async () => {
    const { useCases, repository } = setUp();
    const odd = {
      ...v1,
      chapters: [...v1.chapters, { id: "kapitel-ö", data: { course: V1, reviewQuestion: [] } }],
    };
    repository.readRelease.mockResolvedValueOnce(odd);
    await expect(
      useCases.createReleaseDraft(INSTANCE, { kind: "nextVersionOf", url: V1 }, WEB_ID),
    ).rejects.toMatchObject({
      code: "releaseIdUnsupported",
      vars: { id: "kapitel-ö" },
    });
    repository.parseRelease.mockResolvedValueOnce(odd);
    await expect(
      useCases.createReleaseDraft(INSTANCE, { kind: "fromFile" }, WEB_ID),
    ).rejects.toMatchObject({ code: "releaseIdUnsupported" });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("refuses a release that links to the guest's pod, writing nothing, but not one whose text names it (GHSA-hc3p-fpwj-fvjp)", async () => {
    const { useCases, repository } = setUp();
    const linking = {
      ...v1,
      triples: [
        ...v1.triples,
        {
          subject: V1,
          predicate: "http://www.w3.org/2000/01/rdf-schema#seeAlso",
          object: { kind: "iri" as const, value: "HTTPS://GUEST.solid-memo.invalid:443/x" },
        },
      ],
    };
    const refused = new AppError("releaseLinksGuestPod", { url: V1 });
    repository.readRelease.mockResolvedValueOnce(linking);
    await expect(
      useCases.createReleaseDraft(INSTANCE, { kind: "nextVersionOf", url: V1 }, WEB_ID),
    ).rejects.toEqual(refused);
    repository.parseRelease.mockResolvedValueOnce(linking);
    await expect(
      useCases.createReleaseDraft(INSTANCE, { kind: "fromFile" }, WEB_ID),
    ).rejects.toEqual(refused);
    expect(repository.create).not.toHaveBeenCalled();
    const naming = {
      ...v1,
      triples: [
        ...v1.triples,
        {
          subject: V1,
          predicate: "http://www.w3.org/2000/01/rdf-schema#comment",
          object: {
            kind: "literal" as const,
            value: `See ${GUEST_INSTANCE_URL}`,
            language: "",
            datatype: "http://www.w3.org/2001/XMLSchema#string",
          },
        },
      ],
    };
    repository.parseRelease.mockResolvedValueOnce(naming);
    await useCases.createReleaseDraft(INSTANCE, { kind: "fromFile" }, WEB_ID);
    expect(repository.create).toHaveBeenCalledOnce();
  });

  it("refuses a next version whose release's linked documents link to the guest's pod, writing nothing (GHSA-vrq3-87m3-6rgg)", async () => {
    const { useCases, repository, created } = setUp();
    const OUTSIDE = "https://elsewhere.example/decks/solid/v1.ttl";
    const SERIES = "https://elsewhere.example/decks/index.ttl#solid";
    const outside = rebaseDraft(courseDraft(), OUTSIDE);
    // The release itself names nothing at the guest's pod: its series is described in another document.
    const release = {
      ...outside,
      root: { ...outside.root, inSeries: SERIES, isVersionOf: SERIES },
      triples: outside.triples.filter((triple) => !triple.subject.endsWith("#series")),
    };
    const iri = (value: string) => ({ kind: "iri" as const, value });
    const series: DraftTriple = {
      subject: SERIES,
      predicate: RDF_TYPE,
      object: iri("http://www.w3.org/ns/dcat#DatasetSeries"),
    };
    const linking: DraftTriple[] = [
      series,
      {
        subject: SERIES,
        predicate: "http://www.w3.org/ns/dcat#theme",
        object: iri(`${GUEST_ORIGIN}x`),
      },
      {
        subject: SERIES,
        predicate: "http://purl.org/dc/terms/publisher",
        object: iri("HTTPS://GUEST.solid-memo.invalid:443/me"),
      },
    ];
    const refused = new AppError("releaseLinksGuestPod", { url: OUTSIDE });
    for (const instance of [GUEST_INSTANCE_URL, INSTANCE]) {
      repository.readRelease.mockResolvedValueOnce(release);
      repository.readLinked.mockResolvedValueOnce(linking);
      await expect(
        useCases.createReleaseDraft(instance, { kind: "nextVersionOf", url: OUTSIDE }, GUEST_WEBID),
      ).rejects.toEqual(refused);
    }
    expect(repository.create).not.toHaveBeenCalled();
    // A guest's next version names its own place at the guest's pod, which a copy of it moves.
    repository.readRelease.mockResolvedValueOnce(release);
    repository.readLinked.mockResolvedValueOnce([series]);
    await useCases.createReleaseDraft(
      GUEST_INSTANCE_URL,
      { kind: "nextVersionOf", url: OUTSIDE },
      GUEST_WEBID,
    );
    expect(created().url).toBe(draftUrlOf(GUEST_INSTANCE_URL, "solid", 2));
    expect(created().triples).toContainEqual(series);
  });

  it("refuses a release with a card outside it, writing nothing, but not one of its own its records do not hold", async () => {
    const { useCases, repository } = setUp();
    const typed = (subject: string, type: string): DraftTriple => ({
      subject,
      predicate: RDF_TYPE,
      object: { kind: "iri", value: type },
    });
    const foreign = "https://elsewhere.example/x#q-1";
    const hiding = { ...v1, triples: [...v1.triples, typed(foreign, SM.Card)] };
    repository.readRelease.mockResolvedValueOnce(hiding);
    await expect(
      useCases.createReleaseDraft(INSTANCE, { kind: "nextVersionOf", url: V1 }, WEB_ID),
    ).rejects.toMatchObject({ code: "releaseForeignPart", vars: { part: foreign } });
    repository.parseRelease.mockResolvedValueOnce(hiding);
    await expect(
      useCases.createReleaseDraft(INSTANCE, { kind: "fromFile" }, WEB_ID),
    ).rejects.toMatchObject({ code: "releaseForeignPart" });
    expect(repository.create).not.toHaveBeenCalled();
    // One of its own its records do not read is the release check's to report (strayParts).
    repository.parseRelease.mockResolvedValueOnce({
      ...v1,
      triples: [...v1.triples, typed(`${V1}#q-odd`, SM.Step)],
    });
    await expect(
      useCases.createReleaseDraft(INSTANCE, { kind: "fromFile" }, WEB_ID),
    ).resolves.toEqual({
      draft: expect.objectContaining({ name: "solid" }),
    });
  });

  it("keeps of a release's other statements only those of it, its subjects and what they name", async () => {
    const { useCases, repository, created } = setUp();
    const elsewhere = "https://elsewhere.example/decks/solid/v1.ttl";
    const release = rebaseDraft(courseDraft(), elsewhere);
    const text = (value: string) => ({
      kind: "literal" as const,
      value,
      language: "en",
      datatype: "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString",
    });
    const SOURCE = "https://source.example/";
    const LICENSE = "https://license.example/";
    const named: DraftTriple[] = [
      {
        subject: SOURCE,
        predicate: "http://purl.org/dc/terms/license",
        object: { kind: "iri", value: LICENSE },
      },
      {
        subject: LICENSE,
        predicate: RDF_TYPE,
        object: { kind: "iri", value: "http://purl.org/dc/terms/LicenseDocument" },
      },
      {
        subject: LICENSE,
        predicate: "http://www.w3.org/ns/prov#wasAttributedTo",
        object: { kind: "blank", value: "b0" },
      },
      { subject: "_:b0", predicate: "http://xmlns.com/foaf/0.1/name", object: text("Licensor") },
    ];
    // What the release states of the address a draft of it would be published at, which nothing names.
    const planted: DraftTriple[] = [
      {
        subject: `${V1}#q-a-1a`,
        predicate: SM.frontImage,
        object: { kind: "iri", value: "https://elsewhere.example/pixel.png" },
      },
      {
        subject: `${V1}#q-a-1a`,
        predicate: "http://www.w3.org/2002/07/owl#deprecated",
        object: {
          kind: "literal",
          value: "true",
          language: "",
          datatype: "http://www.w3.org/2001/XMLSchema#boolean",
        },
      },
      {
        subject: V1,
        predicate: "http://purl.org/dc/terms/description",
        object: { kind: "blank", value: "b1" },
      },
      {
        subject: "_:b1",
        predicate: "http://www.w3.org/2000/01/rdf-schema#comment",
        object: text("More"),
      },
    ];
    const crafted = { ...release, triples: [...release.triples, ...named, ...planted] };
    repository.parseRelease.mockResolvedValueOnce(crafted);
    await useCases.createReleaseDraft(INSTANCE, { kind: "fromFile" }, WEB_ID);
    const imported = created();
    expect(imported.triples).toEqual(
      rebaseDraft({ ...release, triples: [...release.triples, ...named] }, imported.url).triples,
    );
    repository.readRelease.mockResolvedValueOnce(crafted);
    await useCases.createReleaseDraft(INSTANCE, { kind: "nextVersionOf", url: elsewhere }, WEB_ID);
    const next = created();
    expect(
      next.triples.some((triple) => triple.subject.startsWith(V1) || triple.subject === "_:b1"),
    ).toBe(false);
    expect(next.triples).toEqual(expect.arrayContaining(named));
  });

  it("keeps of a creator outside the release only that the release names it (GHSA-wjqr-hw63-jf4c)", async () => {
    const { useCases, repository, created } = setUp();
    const elsewhere = "https://elsewhere.example/decks/solid/v1.ttl";
    const release = rebaseDraft(courseDraft(), elsewhere);
    const OUTSIDE = "https://outside.example/people#x";
    const OWN = `${elsewhere}#own`;
    const name = (subject: string, value: string): DraftTriple => ({
      subject,
      predicate: "http://xmlns.com/foaf/0.1/name",
      object: { kind: "literal", value, language: "", datatype: XSD_STRING },
    });
    const agent = (subject: string): DraftTriple => ({
      subject,
      predicate: RDF_TYPE,
      object: { kind: "iri", value: "http://xmlns.com/foaf/0.1/Agent" },
    });
    const crafted = {
      ...release,
      root: { ...release.root, creator: [OUTSIDE], publisher: OUTSIDE },
      triples: [
        ...release.triples,
        agent(OUTSIDE),
        name(OUTSIDE, "Someone else"),
        {
          subject: OUTSIDE,
          predicate: "http://xmlns.com/foaf/0.1/knows",
          object: { kind: "blank" as const, value: "b0" },
        },
        name("_:b0", "Friend"),
        name(OWN, "Own"),
      ],
    };
    const about = (draft: ReleaseDraft, subject: string) =>
      draft.triples.filter((triple) => triple.subject === subject);
    repository.parseRelease.mockResolvedValueOnce(crafted);
    await useCases.createReleaseDraft(INSTANCE, { kind: "fromFile" }, WEB_ID);
    const imported = created();
    expect(imported.root.creator).toContain(OUTSIDE);
    expect(about(imported, OUTSIDE)).toEqual([]);
    expect(about(imported, "_:b0")).toEqual([]);
    expect(about(imported, `${imported.url}#own`)).toEqual([name(`${imported.url}#own`, "Own")]);
    // Nor what the document the release names its publisher in says of that creator.
    repository.readRelease.mockResolvedValueOnce(crafted);
    repository.readLinked.mockResolvedValueOnce([agent(OUTSIDE), name(OUTSIDE, "Someone else")]);
    await useCases.createReleaseDraft(INSTANCE, { kind: "nextVersionOf", url: elsewhere }, WEB_ID);
    const next = created();
    expect(next.root.creator).toContain(OUTSIDE);
    expect(about(next, OUTSIDE)).toEqual([]);
  });

  it("keeps nothing of a creator among the release's subjects with no record, and keeps one with a record (GHSA-mv57-839j-wrf6)", async () => {
    const { useCases, repository, created } = setUp();
    const elsewhere = "https://elsewhere.example/decks/solid/v1.ttl";
    const release = rebaseDraft(courseDraft(), elsewhere);
    const HIDDEN = `${elsewhere}#hidden`;
    const KEPT = `${elsewhere}#kept`;
    const nick = (subject: string): DraftTriple => ({
      subject,
      predicate: "http://xmlns.com/foaf/0.1/nick",
      object: { kind: "literal", value: "Nick", language: "", datatype: XSD_STRING },
    });
    const crafted = {
      ...release,
      root: { ...release.root, creator: [HIDDEN, KEPT] },
      agents: [{ id: "kept", data: { name: "Kept" } }],
      triples: [...release.triples, nick(KEPT), nick(HIDDEN)],
    };
    const subjects = (draft: ReleaseDraft) => draft.triples.map((triple) => triple.subject);
    repository.parseRelease.mockResolvedValueOnce(crafted);
    await useCases.createReleaseDraft(INSTANCE, { kind: "fromFile" }, WEB_ID);
    const imported = created();
    expect(imported.root.creator).toEqual([`${imported.url}#hidden`, `${imported.url}#kept`]);
    expect(subjects(imported)).not.toContain(`${imported.url}#hidden`);
    expect(subjects(imported)).toContain(`${imported.url}#kept`);
  });

  it("drops of the release what makes it an agent or distribution, from it and from what it links (GHSA-mv57-839j-wrf6)", async () => {
    const { useCases, repository, created } = setUp();
    const elsewhere = "https://elsewhere.example/decks/solid/v1.ttl";
    const release = rebaseDraft(courseDraft(), elsewhere);
    const type = (value: string): DraftTriple => ({
      subject: elsewhere,
      predicate: RDF_TYPE,
      object: { kind: "iri", value },
    });
    const statements: DraftTriple[] = [
      type("http://xmlns.com/foaf/0.1/Agent"),
      type("http://www.w3.org/ns/dcat#Distribution"),
      {
        subject: elsewhere,
        predicate: FOAF_NAME,
        object: { kind: "literal", value: "Itself", language: "", datatype: XSD_STRING },
      },
    ];
    const kept: DraftTriple[] = [
      type("https://example.org/Thing"),
      { subject: elsewhere, predicate: RDF_TYPE, object: { kind: "blank", value: "b0" } },
    ];
    const crafted = {
      ...release,
      root: { ...release.root, creator: [elsewhere] },
      triples: [...release.triples, ...statements, ...kept],
    };
    const about = (draft: ReleaseDraft) =>
      draft.triples
        .filter((triple) => triple.subject === draft.url)
        .map(({ predicate, object }) => `${predicate} ${object.value}`);
    const asRecord = statements.map(({ predicate, object }) => `${predicate} ${object.value}`);
    repository.parseRelease.mockResolvedValueOnce(crafted);
    await useCases.createReleaseDraft(INSTANCE, { kind: "fromFile" }, WEB_ID);
    const imported = created();
    expect(imported.root.creator).toEqual([imported.url]);
    for (const statement of asRecord) expect(about(imported)).not.toContain(statement);
    expect(about(imported)).toEqual(
      expect.arrayContaining(kept.map(({ predicate, object }) => `${predicate} ${object.value}`)),
    );
    const describedElsewhere = {
      ...release,
      root: { ...release.root, publisher: elsewhere },
      triples: release.triples.filter((triple) => triple.subject !== elsewhere),
    };
    repository.readRelease.mockResolvedValueOnce(describedElsewhere);
    repository.readLinked.mockResolvedValueOnce(statements);
    await useCases.createReleaseDraft(INSTANCE, { kind: "nextVersionOf", url: elsewhere }, WEB_ID);
    const next = about(created());
    for (const statement of asRecord) expect(next).not.toContain(statement);
  });

  it("takes nothing of an agent the release holds a record of from what it links (GHSA-mv57-839j-wrf6)", async () => {
    const { useCases, repository, created } = setUp();
    const elsewhere = "https://elsewhere.example/decks/solid/v1.ttl";
    const release = rebaseDraft(courseDraft(), elsewhere);
    const AUTHOR = `${elsewhere}#author`;
    const PUBLISHER = `${elsewhere}#publisher`;
    const named = (subject: string): DraftTriple => ({
      subject,
      predicate: FOAF_NAME,
      object: { kind: "literal", value: "Another name", language: "", datatype: XSD_STRING },
    });
    const crafted = {
      ...release,
      root: { ...release.root, creator: [AUTHOR], publisher: PUBLISHER },
      agents: [
        { id: "author", data: { name: "Author" } },
        { id: "publisher", data: { name: "Publisher" } },
      ],
    };
    repository.readRelease.mockResolvedValueOnce(crafted);
    repository.readLinked.mockResolvedValueOnce([named(AUTHOR), named(PUBLISHER)]);
    await useCases.createReleaseDraft(INSTANCE, { kind: "nextVersionOf", url: elsewhere }, WEB_ID);
    expect(created().triples.filter((triple) => triple.predicate === FOAF_NAME)).toEqual([]);
  });

  it("drops what a release states of, or names by, another address in the new draft's container (GHSA-8w75-jg23-rxq5)", async () => {
    const { useCases, repository, created } = setUp();
    const elsewhere = "https://elsewhere.example/decks/solid/v1.ttl";
    const release = rebaseDraft(courseDraft(), elsewhere);
    const SOURCE = "https://source.example/";
    const planted = (version: number): DraftTriple[] => {
      const container = `${INSTANCE}drafts/solid/v${version}/`;
      return [
        {
          subject: SOURCE,
          predicate: "http://www.w3.org/2000/01/rdf-schema#seeAlso",
          object: { kind: "iri", value: `${container}cards.ttl` },
        },
        {
          subject: `${container}cards.ttl`,
          predicate: "http://purl.org/dc/terms/license",
          object: { kind: "iri", value: "https://elsewhere.example/all-rights-reserved" },
        },
        {
          subject: `${container}cards.ttl`,
          predicate: SM.releasedAs,
          object: { kind: "iri", value: "https://elsewhere.example/x/v9.ttl" },
        },
        {
          subject: SOURCE,
          predicate: "http://www.w3.org/2000/01/rdf-schema#seeAlso",
          object: { kind: "iri", value: `${container}chapter-ch-a.ttl#q-a-1a` },
        },
        {
          subject: `${container}chapter-ch-a.ttl#q-a-1a`,
          predicate: SM.frontImage,
          object: { kind: "blank", value: "b9" },
        },
        {
          subject: "_:b9",
          predicate: "http://www.w3.org/2000/01/rdf-schema#seeAlso",
          object: { kind: "iri", value: `${container}notes.ttl` },
        },
        // The new draft's own address, as the release names it before it is moved there.
        {
          subject: SOURCE,
          predicate: "http://www.w3.org/2000/01/rdf-schema#seeAlso",
          object: { kind: "iri", value: `${container}release.ttl` },
        },
        {
          subject: `${container}release.ttl`,
          predicate: SM.releasedAs,
          object: { kind: "iri", value: "https://elsewhere.example/x/v9.ttl" },
        },
      ];
    };
    // What the release, made the next version's draft, would state as that draft's own.
    repository.readRelease.mockResolvedValueOnce({
      ...release,
      triples: [...release.triples, ...planted(2)],
    });
    await useCases.createReleaseDraft(INSTANCE, { kind: "nextVersionOf", url: elsewhere }, WEB_ID);
    expect(created().url).toBe(draftUrlOf(INSTANCE, "solid", 2));
    expect(created().triples).toEqual(nextVersionDraft(release, created().url, []).triples);
    // And the release itself, made a draft.
    repository.parseRelease.mockResolvedValueOnce({
      ...release,
      triples: [...release.triples, ...planted(1)],
    });
    await useCases.createReleaseDraft(INSTANCE, { kind: "fromFile" }, WEB_ID);
    expect(created().url).toBe(draftUrlOf(INSTANCE, "solid", 1));
    expect(created().triples).toEqual(rebaseDraft(release, created().url).triples);
  });

  it("takes the next name when its place was taken elsewhere meanwhile, a few times", async () => {
    const { useCases, repository } = setUp();
    repository.create.mockRejectedValueOnce(
      new AppError("createdElsewhere", { url: draftUrlOf(INSTANCE, "capitals", 1) }),
    );
    await expect(
      useCases.createReleaseDraft(
        INSTANCE,
        { kind: "blankDeck", title: { en: "Capitals" } },
        WEB_ID,
      ),
    ).resolves.toEqual({
      draft: expect.objectContaining({ name: "capitals-2" }),
    });
    repository.create.mockImplementation(async (_, draft) => {
      throw new AppError("createdElsewhere", { url: draft.url });
    });
    await expect(
      useCases.createReleaseDraft(
        INSTANCE,
        { kind: "blankDeck", title: { en: "Capitals" } },
        WEB_ID,
      ),
    ).rejects.toMatchObject({ code: "createdElsewhere" });
    expect(repository.create).toHaveBeenCalledTimes(5);
    repository.create.mockRejectedValue(new AppError("noCatalogToUpdate"));
    await expect(
      useCases.createReleaseDraft(
        INSTANCE,
        { kind: "blankDeck", title: { en: "Capitals" } },
        WEB_ID,
      ),
    ).rejects.toMatchObject({ code: "noCatalogToUpdate" });
  });

  it("takes no other name when a later write failed: the draft's place was not taken", async () => {
    const { useCases, repository } = setUp();
    repository.create.mockRejectedValueOnce(
      new AppError("changedElsewhere", { url: `${INSTANCE}catalog.ttl` }),
    );
    await expect(
      useCases.createReleaseDraft(
        INSTANCE,
        { kind: "blankDeck", title: { en: "Capitals" } },
        WEB_ID,
      ),
    ).rejects.toMatchObject({ code: "changedElsewhere" });
    repository.create.mockRejectedValueOnce(
      new AppError("createdElsewhere", { url: `${INSTANCE}drafts/capitals/v1/chapter-a.ttl` }),
    );
    await expect(
      useCases.createReleaseDraft(
        INSTANCE,
        { kind: "blankDeck", title: { en: "Capitals" } },
        WEB_ID,
      ),
    ).rejects.toMatchObject({ code: "createdElsewhere" });
    repository.create.mockRejectedValueOnce(new Error("offline"));
    await expect(
      useCases.createReleaseDraft(
        INSTANCE,
        { kind: "blankDeck", title: { en: "Capitals" } },
        WEB_ID,
      ),
    ).rejects.toThrow("offline");
    expect(repository.create).toHaveBeenCalledTimes(3);
  });
});

describe("copyReleaseDraft", () => {
  it("copies another instance's draft here, every subject moved, under its name or the next free one of its version", async () => {
    const guest = draftUrlOf("https://guest.example/solid-memo/main/", "solid", 2);
    const stored = rebaseDraft(courseDraft(), guest);
    const { useCases, repository, created } = setUp({
      stored,
      drafts: [summary("solid", 2), summary("solid-2", 1)],
    });
    await expect(useCases.copyReleaseDraft(guest, INSTANCE)).resolves.toMatchObject({
      name: "solid-2",
      version: 2,
      instanceUrl: INSTANCE,
    });
    expect(repository.read).toHaveBeenCalledWith(guest);
    expect(created()).toEqual(rebaseDraft(stored, draftUrlOf(INSTANCE, "solid-2", 2)));
    expect(JSON.stringify(created())).not.toContain("guest.example");
  });

  it("drops what the draft states of, or names by, another address in the copy's container (GHSA-8w75-jg23-rxq5)", async () => {
    const DRAFT = draftUrlOf(INSTANCE, "solid", 1);
    const draft = rebaseDraft(courseDraft(), DRAFT);
    const container = `${INSTANCE}drafts/solid-2/v1/`;
    const planted: DraftTriple[] = [
      {
        subject: "https://source.example/",
        predicate: "http://www.w3.org/2000/01/rdf-schema#seeAlso",
        object: { kind: "iri", value: `${container}cards.ttl` },
      },
      {
        subject: `${container}cards.ttl`,
        predicate: "http://purl.org/dc/terms/license",
        object: { kind: "iri", value: "https://elsewhere.example/all-rights-reserved" },
      },
    ];
    const { useCases, created } = setUp({
      stored: { ...draft, triples: [...draft.triples, ...planted] },
      drafts: [summary("solid", 1)],
    });
    await useCases.copyReleaseDraft(DRAFT, INSTANCE);
    expect(created().url).toBe(draftUrlOf(INSTANCE, "solid-2", 1));
    expect(created().triples).toEqual(rebaseDraft(draft, created().url).triples);
  });

  it("writes nothing of a guest's draft whose copy would still name the guest's pod", async () => {
    const guest = draftUrlOf(GUEST_INSTANCE_URL, "solid", 1);
    const moved = rebaseDraft(courseDraft(), guest);
    const { useCases, repository } = setUp({ stored: moved });
    await expect(useCases.copyReleaseDraft(guest, INSTANCE)).resolves.toMatchObject({
      name: "solid",
    });
    // Text may name the guest's pod: only a link to it is refused.
    const text = { en: `See ${GUEST_INSTANCE_URL} or HTTPS://GUEST.solid-memo.invalid:443/` };
    repository.read.mockResolvedValueOnce({
      draft: {
        ...moved,
        cards: moved.cards.map((card) => ({ ...card, data: { ...card.data, front: text } })),
      },
      version: "v1",
    });
    await expect(useCases.copyReleaseDraft(guest, INSTANCE)).resolves.toMatchObject({
      name: "solid",
    });
    repository.read.mockResolvedValueOnce({
      draft: {
        ...moved,
        root: { ...moved.root, prev: `${GUEST_INSTANCE_URL}releases/solid/v1.ttl` },
      },
      version: "v1",
    });
    await expect(useCases.copyReleaseDraft(guest, INSTANCE)).rejects.toMatchObject({
      code: "guestUrlsLeft",
      vars: { url: draftUrlOf(INSTANCE, "solid", 1) },
    });
    expect(repository.create).toHaveBeenCalledTimes(2);
  });
});

describe("getReleaseDraft", () => {
  it("is the draft, with nothing published before a first release", async () => {
    const { useCases } = setUp();
    await expect(useCases.getReleaseDraft(courseDraft().url)).resolves.toEqual(courseDraft());
  });

  it("is read with the version its documents were at, by readReleaseDraft", async () => {
    const { useCases } = setUp();
    await expect(useCases.readReleaseDraft(courseDraft().url)).resolves.toEqual({
      draft: courseDraft(),
      version: "v1",
    });
  });

  it("knows what the release before it published, read once", async () => {
    const draft = { ...courseDraft(), root: { ...courseDraft().root, prev: V1 } };
    const { useCases, repository } = setUp({ stored: draft });
    expect((await useCases.getReleaseDraft(draft.url)).published.ids).toMatchObject({
      "ch-a": "chapter",
    });
    await useCases.getReleaseDraft(draft.url);
    expect(repository.readRelease).toHaveBeenCalledTimes(1);
  });

  it("counts all it has as published while the release before it cannot be read, and reads it again next time", async () => {
    const draft = { ...courseDraft(), root: { ...courseDraft().root, prev: V1 } };
    const { useCases, repository } = setUp({ stored: draft });
    repository.readRelease.mockRejectedValueOnce(new AppError("releaseUnreadable", { url: V1 }));
    const read = await useCases.getReleaseDraft(draft.url);
    expect(read.published.ids).toMatchObject({ "q-loose": "card", "ch-b": "chapter" });
    expect(read.published.activities).toEqual(["compilation"]);
    await useCases.getReleaseDraft(draft.url);
    expect(repository.readRelease).toHaveBeenCalledTimes(2);
  });
});

describe("editReleaseDraft", () => {
  it("makes the changes to the draft as it is now, and writes them", async () => {
    const { useCases, repository } = setUp();
    const edit = await useCases.editReleaseDraft(courseDraft().url, [
      { kind: "retire", of: "card", id: "q-loose" },
    ]);
    expect(edit.ok).toBe(true);
    expect(repository.applyChanges).toHaveBeenCalledWith(
      courseDraft(),
      edit.ok && edit.draft,
      "v1",
    );
  });

  it("writes nothing when a change is refused", async () => {
    const draft = { ...courseDraft(), root: { ...courseDraft().root, prev: V1 } };
    const { useCases, repository } = setUp({ stored: draft });
    await expect(
      useCases.editReleaseDraft(draft.url, [{ kind: "delete", of: "card", id: "q-loose" }]),
    ).resolves.toEqual({
      ok: false,
      refusal: { refused: "published", of: "card", id: "q-loose" },
    });
    expect(repository.applyChanges).not.toHaveBeenCalled();
  });

  it("reads the draft and makes the changes again when it changed elsewhere, or a new document was made there, a few times", async () => {
    const { useCases, repository } = setUp();
    repository.applyChanges.mockRejectedValueOnce(new AppError("changedElsewhere", { url: "x" }));
    await expect(
      useCases.editReleaseDraft(courseDraft().url, [{ kind: "retire", of: "card", id: "q-loose" }]),
    ).resolves.toMatchObject({ ok: true });
    expect(repository.read).toHaveBeenCalledTimes(2);
    repository.applyChanges.mockRejectedValueOnce(new AppError("createdElsewhere", { url: "x" }));
    await expect(
      useCases.editReleaseDraft(courseDraft().url, [{ kind: "retire", of: "card", id: "q-loose" }]),
    ).resolves.toMatchObject({ ok: true });
    repository.read.mockClear();
    repository.applyChanges.mockRejectedValue(new AppError("changedElsewhere", { url: "x" }));
    await expect(
      useCases.editReleaseDraft(courseDraft().url, [{ kind: "retire", of: "card", id: "q-loose" }]),
    ).rejects.toMatchObject({
      code: "changedElsewhere",
    });
    expect(repository.read).toHaveBeenCalledTimes(3);
    repository.applyChanges.mockRejectedValue(new Error("offline"));
    await expect(
      useCases.editReleaseDraft(courseDraft().url, [{ kind: "retire", of: "card", id: "q-loose" }]),
    ).rejects.toThrow("offline");
  });

  it("keeps what an attempt cut short wrote, when making the changes again is refused for it", async () => {
    const { useCases, repository } = setUp();
    const changes: DraftChange[] = [{ kind: "addChapter", id: "ch-c", at: 1 }];
    const intended = applyDraftChanges(courseDraft(), changes) as ReleaseDraft;
    // The new chapter's document is written, then a sibling's write is refused (412).
    const partial = {
      ...courseDraft(),
      chapters: [...courseDraft().chapters, intended.chapters.find((node) => node.id === "ch-c")!],
    };
    repository.read
      .mockResolvedValueOnce({ draft: courseDraft(), version: "v1" })
      .mockResolvedValueOnce({ draft: partial, version: "v2" });
    repository.applyChanges.mockRejectedValueOnce(new AppError("changedElsewhere", { url: "x" }));
    const edit = await useCases.editReleaseDraft(courseDraft().url, changes);
    expect(edit).toMatchObject({ ok: true });
    expect(repository.applyChanges).toHaveBeenLastCalledWith(partial, expect.anything(), "v2");
    const written = (
      repository.applyChanges.mock.calls.at(-1) as unknown as [ReleaseDraft, ReleaseDraft, string]
    )[1];
    expect(
      Object.fromEntries(written.chapters.map((node) => [node.id, node.data.position])),
    ).toEqual({ "ch-a": 0, "ch-b": 2, "ch-c": 1 });
  });

  it("refuses the changes again when what they change was changed elsewhere otherwise", async () => {
    const { useCases, repository } = setUp();
    const changes: DraftChange[] = [{ kind: "addChapter", id: "ch-c", at: 1 }];
    const theirs = {
      ...courseDraft(),
      chapters: [
        ...courseDraft().chapters,
        {
          id: "ch-c",
          data: {
            title: { en: "Theirs" },
            course: courseDraft().url,
            position: 5,
            reviewQuestion: [],
          },
        },
      ],
    };
    repository.read
      .mockResolvedValueOnce({ draft: courseDraft(), version: "v1" })
      .mockResolvedValueOnce({ draft: theirs, version: "v2" });
    repository.applyChanges.mockRejectedValueOnce(new AppError("changedElsewhere", { url: "x" }));
    await expect(useCases.editReleaseDraft(courseDraft().url, changes)).resolves.toEqual({
      ok: false,
      refusal: { refused: "idTaken", id: "ch-c" },
    });
    expect(repository.applyChanges).toHaveBeenCalledTimes(1);
  });
});

describe("checkReleaseDraft", () => {
  /** A Markdown check that finds one thing in every text, and counts its calls. */
  const markdownCheck = {
    problems: vi.fn(() => [{ code: "html" }]),
    chunks: () => ({ chunks: 1, empty: 0 }),
  };
  /** The course, its first question written in Markdown. */
  function marked(): ReleaseDraft {
    const draft = courseDraft();
    return {
      ...draft,
      cards: draft.cards.map((card, at) =>
        at === 0 ? { ...card, data: { ...card.data, textFormat: SM.markdown } } : card,
      ),
    };
  }

  it("checks the draft for a pod by the domain's rules, once for each draft, the shapes only when asked", async () => {
    const { useCases, deckLibrary, shapeValidator, repository } = setUp();
    markdownCheck.problems.mockClear();
    const draft = marked();
    const check = await useCases.checkReleaseDraft(draft, markdownCheck, "pod");
    expect(check.rules.map((p) => p.code)).toContain("chapterWithoutStep");
    expect(check.library).toEqual([]);
    expect(check.drops).toEqual([]);
    expect(check.markdown.map((p) => [p.code, p.subject])).toContainEqual([
      "markdown",
      `${draft.url}#q-a-1a`,
    ]);
    expect(check.shapes).toBeNull();
    expect(deckLibrary.readLibraryIndex).not.toHaveBeenCalled();
    expect(repository.readRelease).not.toHaveBeenCalled();
    const calls = markdownCheck.problems.mock.calls.length;
    await expect(useCases.checkReleaseDraft(draft, markdownCheck, "pod")).resolves.toEqual(check);
    expect(markdownCheck.problems.mock.calls.length).toBe(calls);
    expect(shapeValidator.validateRelease).not.toHaveBeenCalled();

    const shaped = await useCases.checkReleaseDraft(draft, markdownCheck, "pod", { shapes: true });
    expect(shaped).toEqual({
      ...check,
      shapes: [problem(draft.url, { code: "unshaped", params: {} }, { severity: "warning" })],
    });
    expect(shapeValidator.validateRelease).toHaveBeenCalledWith(draft, draft.url);
    await useCases.checkReleaseDraft(draft, markdownCheck, "pod", { shapes: true });
    expect(shapeValidator.validateRelease).toHaveBeenCalledTimes(1);
    // Another version of the draft is checked afresh.
    await useCases.checkReleaseDraft({ ...draft }, markdownCheck, "pod", { shapes: true });
    expect(shapeValidator.validateRelease).toHaveBeenCalledTimes(2);
  });

  it("checks the draft for the library at its place there, by the index, naming its subjects in the draft", async () => {
    const { useCases, deckLibrary, shapeValidator } = setUp();
    const draft = courseDraft();
    const check = await useCases.checkReleaseDraft(draft, markdownCheck, "library", {
      shapes: true,
    });
    expect(check.rules.map((p) => p.code)).toContain("missingLanguage");
    // The fixture states version 1, its place version 2, and no license.
    expect(check.library.map((p) => [p.code, p.subject, p.field])).toEqual([
      ["versionMismatch", draft.url, "http://www.w3.org/ns/dcat#version"],
      ["linkMismatch", draft.url, "http://www.w3.org/ns/dcat#inSeries"],
      ["linkMismatch", draft.url, "http://www.w3.org/ns/dcat#isVersionOf"],
      ["linkMismatch", draft.url, "http://purl.org/dc/terms/publisher"],
      ["linkMismatch", draft.url, "http://www.w3.org/ns/dcat#prev"],
      ["linkMismatch", draft.url, "http://www.w3.org/ns/dcat#previousVersion"],
      ["noLicense", draft.url, "http://purl.org/dc/terms/license"],
    ]);
    expect(shapeValidator.validateRelease).toHaveBeenCalledWith(
      draft,
      `${DECKS}solid/v2.ttl`,
      INDEX,
    );
    expect(deckLibrary.readLibraryIndex).toHaveBeenCalledTimes(2);
  });

  it("checks the draft against the release it follows, read once, and again when it could not be", async () => {
    const { useCases, repository } = setUp();
    const draft = courseDraft();
    const next: ReleaseDraft = {
      ...draft,
      root: { ...draft.root, prev: V1, version: "2" },
      cards: draft.cards.slice(1),
    };
    repository.readRelease.mockRejectedValueOnce(new AppError("releaseUnreadable", { url: V1 }));
    // The rest of the check stands.
    const unread = await useCases.checkReleaseDraft(next, markdownCheck, "pod");
    expect(unread.drops).toEqual([
      problem(next.url, { code: "previousUnread", params: { previous: V1 } }, { related: [V1] }),
    ]);
    expect(unread.rules.map((p) => p.code)).toContain("chapterWithoutStep");
    const check = await useCases.checkReleaseDraft(next, markdownCheck, "pod");
    expect(check.drops).toEqual([
      expect.objectContaining({ code: "cardsDropped", params: { ids: ["q-a-1a"], previous: V1 } }),
    ]);
    await useCases.checkReleaseDraft({ ...next }, markdownCheck, "pod");
    expect(repository.readRelease).toHaveBeenCalledTimes(2);
  });

  it("runs the shapes again when they failed", async () => {
    const { useCases, shapeValidator } = setUp();
    const draft = courseDraft();
    shapeValidator.validateRelease.mockRejectedValueOnce(new Error("offline"));
    await expect(
      useCases.checkReleaseDraft(draft, markdownCheck, "pod", { shapes: true }),
    ).rejects.toThrow("offline");
    await expect(
      useCases.checkReleaseDraft(draft, markdownCheck, "pod", { shapes: true }),
    ).resolves.toMatchObject({ shapes: expect.any(Array) });
    expect(shapeValidator.validateRelease).toHaveBeenCalledTimes(2);
  });

  it("checks the draft for the library without its place there when the index cannot be read, and again next time", async () => {
    const { useCases, deckLibrary } = setUp();
    const draft = courseDraft();
    deckLibrary.readLibraryIndex.mockRejectedValueOnce(new Error("offline"));
    const unread = await useCases.checkReleaseDraft(draft, markdownCheck, "library");
    expect(unread.library).toEqual([problem(draft.url, { code: "libraryUnread", params: {} })]);
    expect(unread.rules.map((p) => p.code)).toContain("missingLanguage");
    const check = await useCases.checkReleaseDraft(draft, markdownCheck, "library");
    expect(check.library.map((p) => p.code)).toContain("versionMismatch");
    expect(deckLibrary.readLibraryIndex).toHaveBeenCalledTimes(2);
  });
});

describe("diffReleaseDraft", () => {
  it("is null for a draft of a first release", async () => {
    const { useCases, repository } = setUp();
    await expect(useCases.diffReleaseDraft(courseDraft())).resolves.toBeNull();
    expect(repository.readRelease).not.toHaveBeenCalled();
  });

  it("compares the draft with the release it follows, read once: its changes, the series' rules it breaks, a learner's upgrade", async () => {
    const next = nextVersionDraft(v1, courseDraft().url);
    const draft = { ...next, cards: next.cards.filter((node) => node.id !== "q-loose") };
    const { useCases, repository } = setUp();
    const diff = (await useCases.diffReleaseDraft(draft))!;
    expect(diff.previous).toBe(v1);
    expect(diff.diff.unchanged.card).toBe(3);
    expect(diff.problems.map((one) => one.code)).toEqual(["cardsDropped"]);
    expect(diff.upgrade.lost.cards).toEqual(["q-loose"]);
    await useCases.diffReleaseDraft(next);
    expect(repository.readRelease).toHaveBeenCalledTimes(1);
  });

  it("fails while the release it follows cannot be read, and reads it again next time", async () => {
    const draft = nextVersionDraft(v1, courseDraft().url);
    const { useCases, repository } = setUp();
    repository.readRelease.mockRejectedValueOnce(new AppError("releaseUnreadable", { url: V1 }));
    await expect(useCases.diffReleaseDraft(draft)).rejects.toThrow(AppError);
    await expect(useCases.diffReleaseDraft(draft)).resolves.not.toBeNull();
    expect(repository.readRelease).toHaveBeenCalledTimes(2);
  });
});
