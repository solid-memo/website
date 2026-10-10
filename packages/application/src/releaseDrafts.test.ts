import { describe, expect, it, vi } from "vitest";
import { AppError } from "@solid-memo/domain/appError";
import type { Card, Deck } from "@solid-memo/domain/deck";
import { draftSummaryOf, draftUrlOf, type ReleaseDraftSummary } from "@solid-memo/domain/release/draftLayout";
import { applyDraftChanges, blankDraft, type DraftChange, type ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { rebaseDraft } from "@solid-memo/domain/release/releaseToDraft";
import { courseDraft, NOW } from "@solid-memo/domain/testing/releaseDraft";
import type { DeckRepository, FileExchange, ReleaseDraftRepository } from "./ports";
import { createReleaseDraftUseCases } from "./releaseDrafts";

const INSTANCE = "https://pod.example/solid-memo/main/";
const V1 = "https://pod.example/solid-memo/main/releases/solid/v1.ttl";

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
const cards: Card[] = [{ id: "c1", url: `${deck.cardsDocumentUrl}#c1`, front: { en: "Sweden" }, back: { en: "Stockholm" }, createdAt: NOW, formatVersion: 5 }];

/** Release 1 of the course fixture, published at V1. */
const v1: ReleaseDraft = rebaseDraft(courseDraft(), V1);

function setUp({ drafts = [] as ReleaseDraftSummary[], stored = courseDraft() as ReleaseDraft } = {}) {
  const repository = {
    list: vi.fn(async () => drafts),
    documents: vi.fn(async () => []),
    create: vi.fn(async (_instance: string, draft: ReleaseDraft) => draftSummaryOf(draft)!),
    read: vi.fn(async () => ({ draft: stored, version: "v1" })),
    readSince: vi.fn(),
    applyChanges: vi.fn(async () => undefined),
    assemble: vi.fn(),
    readRelease: vi.fn(async () => v1),
    parseRelease: vi.fn(async () => v1),
    delete: vi.fn(async () => undefined),
  } satisfies ReleaseDraftRepository;
  const deckRepository = { listCards: vi.fn(async () => cards) } as unknown as DeckRepository;
  const fileExchange: FileExchange = { save: vi.fn(), open: vi.fn(async () => ({ name: "solid.ttl", text: "<> a <x> ." })) };
  const useCases = createReleaseDraftUseCases({
    releaseDraftRepository: repository,
    deckRepository,
    fileExchange,
    now: () => new Date(NOW),
  });
  const created = () => repository.create.mock.calls.at(-1)![1];
  return { repository, deckRepository, fileExchange, useCases, created };
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
    const { useCases, created } = setUp({ drafts: [summary("capitals", 1), summary("capitals-2", 2)] });
    const made = await useCases.createReleaseDraft(INSTANCE, { kind: "blankDeck", title: { en: " Capitals " } });
    expect(made).toEqual({ draft: expect.objectContaining({ name: "capitals-2", version: 1, title: { en: "Capitals" }, course: false }) });
    expect(created()).toEqual(blankDraft({ url: draftUrlOf(INSTANCE, "capitals-2", 1), course: false, title: { en: "Capitals" }, now: NOW }));
    await useCases.createReleaseDraft(INSTANCE, { kind: "blankCourse", title: { sv: "Kurs" } });
    expect(created().course).toBe(true);
  });

  it("makes one of a deck, saying the release a copy is based on", async () => {
    const { useCases, deckRepository, created } = setUp();
    await expect(useCases.createReleaseDraft(INSTANCE, { kind: "fromDeck", deck })).resolves.toEqual({ draft: expect.objectContaining({ name: "capitals" }) });
    expect(deckRepository.listCards).toHaveBeenCalledWith(deck);
    expect(created().cards.map((node) => node.id)).toEqual(["c1"]);
    const copy = { ...deck, sourceUrl: "https://solid-memo.com/decks/capitals/v1.ttl" };
    await expect(useCases.createReleaseDraft(INSTANCE, { kind: "fromDeck", deck: copy })).resolves.toEqual({
      draft: expect.objectContaining({ name: "capitals" }),
      basedOn: "https://solid-memo.com/decks/capitals/v1.ttl",
    });
  });

  it("makes the next version of a release, named as its URL names its series", async () => {
    const { useCases, repository, created } = setUp();
    await expect(useCases.createReleaseDraft(INSTANCE, { kind: "nextVersionOf", url: V1 })).resolves.toEqual({
      draft: expect.objectContaining({ name: "solid", version: 2 }),
    });
    expect(repository.readRelease).toHaveBeenCalledWith(V1);
    expect(created().root).toMatchObject({ version: "2", prev: V1 });
    expect(created().published.ids).toMatchObject({ "q-a-1a": "card" });
  });

  it("names the next version of a release elsewhere after its title, and counts one stating no version as 1", async () => {
    const { useCases, repository } = setUp();
    const elsewhere = rebaseDraft(courseDraft(), "https://other.example/course.ttl");
    repository.readRelease.mockResolvedValueOnce({ ...elsewhere, root: { ...elsewhere.root, version: undefined, title: undefined } });
    await expect(useCases.createReleaseDraft(INSTANCE, { kind: "nextVersionOf", url: "https://other.example/course.ttl" })).resolves.toEqual({
      draft: expect.objectContaining({ name: "draft", version: 2 }),
    });
  });

  it("imports a release file as it is, or nothing when none is picked", async () => {
    const { useCases, repository, fileExchange, created } = setUp();
    await expect(useCases.createReleaseDraft(INSTANCE, { kind: "fromFile" })).resolves.toEqual({
      draft: expect.objectContaining({ name: "solid", version: 1 }),
    });
    expect(repository.parseRelease).toHaveBeenCalledWith("<> a <x> .", "turtle");
    expect(created().root.version).toBe("1");
    expect(created().published).toEqual({ ids: {}, activities: [] });
    const file = { ...v1, url: "https://file.solid-memo.invalid/solid.ttl", root: { ...v1.root, version: undefined, title: undefined } };
    repository.parseRelease.mockResolvedValueOnce(file);
    await expect(useCases.createReleaseDraft(INSTANCE, { kind: "fromFile" })).resolves.toEqual({ draft: expect.objectContaining({ name: "draft", version: 1 }) });
    vi.mocked(fileExchange.open).mockResolvedValueOnce(null);
    await expect(useCases.createReleaseDraft(INSTANCE, { kind: "fromFile" })).resolves.toBeNull();
  });

  it("refuses a release that names a subject by an id a draft cannot keep, writing nothing", async () => {
    const { useCases, repository } = setUp();
    const odd = { ...v1, chapters: [...v1.chapters, { id: "kapitel-ö", data: { course: V1, reviewQuestion: [] } }] };
    repository.readRelease.mockResolvedValueOnce(odd);
    await expect(useCases.createReleaseDraft(INSTANCE, { kind: "nextVersionOf", url: V1 })).rejects.toMatchObject({
      code: "releaseIdUnsupported",
      vars: { id: "kapitel-ö" },
    });
    repository.parseRelease.mockResolvedValueOnce(odd);
    await expect(useCases.createReleaseDraft(INSTANCE, { kind: "fromFile" })).rejects.toMatchObject({ code: "releaseIdUnsupported" });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("takes the next name when its place was taken elsewhere meanwhile, a few times", async () => {
    const { useCases, repository } = setUp();
    repository.create.mockRejectedValueOnce(new AppError("createdElsewhere", { url: draftUrlOf(INSTANCE, "capitals", 1) }));
    await expect(useCases.createReleaseDraft(INSTANCE, { kind: "blankDeck", title: { en: "Capitals" } })).resolves.toEqual({
      draft: expect.objectContaining({ name: "capitals-2" }),
    });
    repository.create.mockImplementation(async (_, draft) => {
      throw new AppError("createdElsewhere", { url: draft.url });
    });
    await expect(useCases.createReleaseDraft(INSTANCE, { kind: "blankDeck", title: { en: "Capitals" } })).rejects.toMatchObject({ code: "createdElsewhere" });
    expect(repository.create).toHaveBeenCalledTimes(5);
    repository.create.mockRejectedValue(new AppError("noCatalogToUpdate"));
    await expect(useCases.createReleaseDraft(INSTANCE, { kind: "blankDeck", title: { en: "Capitals" } })).rejects.toMatchObject({ code: "noCatalogToUpdate" });
  });

  it("takes no other name when a later write failed: the draft's place was not taken", async () => {
    const { useCases, repository } = setUp();
    repository.create.mockRejectedValueOnce(new AppError("changedElsewhere", { url: `${INSTANCE}catalog.ttl` }));
    await expect(useCases.createReleaseDraft(INSTANCE, { kind: "blankDeck", title: { en: "Capitals" } })).rejects.toMatchObject({ code: "changedElsewhere" });
    repository.create.mockRejectedValueOnce(new AppError("createdElsewhere", { url: `${INSTANCE}drafts/capitals/v1/chapter-a.ttl` }));
    await expect(useCases.createReleaseDraft(INSTANCE, { kind: "blankDeck", title: { en: "Capitals" } })).rejects.toMatchObject({ code: "createdElsewhere" });
    repository.create.mockRejectedValueOnce(new Error("offline"));
    await expect(useCases.createReleaseDraft(INSTANCE, { kind: "blankDeck", title: { en: "Capitals" } })).rejects.toThrow("offline");
    expect(repository.create).toHaveBeenCalledTimes(3);
  });
});

describe("getReleaseDraft", () => {
  it("is the draft, with nothing published before a first release", async () => {
    const { useCases } = setUp();
    await expect(useCases.getReleaseDraft(courseDraft().url)).resolves.toEqual(courseDraft());
  });

  it("knows what the release before it published, read once", async () => {
    const draft = { ...courseDraft(), root: { ...courseDraft().root, prev: V1 } };
    const { useCases, repository } = setUp({ stored: draft });
    expect((await useCases.getReleaseDraft(draft.url)).published.ids).toMatchObject({ "ch-a": "chapter" });
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
    const edit = await useCases.editReleaseDraft(courseDraft().url, [{ kind: "retire", of: "card", id: "q-loose" }]);
    expect(edit.ok).toBe(true);
    expect(repository.applyChanges).toHaveBeenCalledWith(courseDraft(), edit.ok && edit.draft, "v1");
  });

  it("writes nothing when a change is refused", async () => {
    const draft = { ...courseDraft(), root: { ...courseDraft().root, prev: V1 } };
    const { useCases, repository } = setUp({ stored: draft });
    await expect(useCases.editReleaseDraft(draft.url, [{ kind: "delete", of: "card", id: "q-loose" }])).resolves.toEqual({
      ok: false,
      refusal: { refused: "published", of: "card", id: "q-loose" },
    });
    expect(repository.applyChanges).not.toHaveBeenCalled();
  });

  it("reads the draft and makes the changes again when it changed elsewhere, or a new document was made there, a few times", async () => {
    const { useCases, repository } = setUp();
    repository.applyChanges.mockRejectedValueOnce(new AppError("changedElsewhere", { url: "x" }));
    await expect(useCases.editReleaseDraft(courseDraft().url, [{ kind: "retire", of: "card", id: "q-loose" }])).resolves.toMatchObject({ ok: true });
    expect(repository.read).toHaveBeenCalledTimes(2);
    repository.applyChanges.mockRejectedValueOnce(new AppError("createdElsewhere", { url: "x" }));
    await expect(useCases.editReleaseDraft(courseDraft().url, [{ kind: "retire", of: "card", id: "q-loose" }])).resolves.toMatchObject({ ok: true });
    repository.read.mockClear();
    repository.applyChanges.mockRejectedValue(new AppError("changedElsewhere", { url: "x" }));
    await expect(useCases.editReleaseDraft(courseDraft().url, [{ kind: "retire", of: "card", id: "q-loose" }])).rejects.toMatchObject({
      code: "changedElsewhere",
    });
    expect(repository.read).toHaveBeenCalledTimes(3);
    repository.applyChanges.mockRejectedValue(new Error("offline"));
    await expect(useCases.editReleaseDraft(courseDraft().url, [{ kind: "retire", of: "card", id: "q-loose" }])).rejects.toThrow("offline");
  });

  it("keeps what an attempt cut short wrote, when making the changes again is refused for it", async () => {
    const { useCases, repository } = setUp();
    const changes: DraftChange[] = [{ kind: "addChapter", id: "ch-c", at: 1 }];
    const intended = applyDraftChanges(courseDraft(), changes) as ReleaseDraft;
    // The new chapter's document is written, then a sibling's write is refused (412).
    const partial = { ...courseDraft(), chapters: [...courseDraft().chapters, intended.chapters.find((node) => node.id === "ch-c")!] };
    repository.read.mockResolvedValueOnce({ draft: courseDraft(), version: "v1" }).mockResolvedValueOnce({ draft: partial, version: "v2" });
    repository.applyChanges.mockRejectedValueOnce(new AppError("changedElsewhere", { url: "x" }));
    const edit = await useCases.editReleaseDraft(courseDraft().url, changes);
    expect(edit).toMatchObject({ ok: true });
    expect(repository.applyChanges).toHaveBeenLastCalledWith(partial, expect.anything(), "v2");
    const written = (repository.applyChanges.mock.calls.at(-1) as unknown as [ReleaseDraft, ReleaseDraft, string])[1];
    expect(Object.fromEntries(written.chapters.map((node) => [node.id, node.data.position]))).toEqual({ "ch-a": 0, "ch-b": 2, "ch-c": 1 });
  });

  it("refuses the changes again when what they change was changed elsewhere otherwise", async () => {
    const { useCases, repository } = setUp();
    const changes: DraftChange[] = [{ kind: "addChapter", id: "ch-c", at: 1 }];
    const theirs = { ...courseDraft(), chapters: [...courseDraft().chapters, { id: "ch-c", data: { title: { en: "Theirs" }, course: courseDraft().url, position: 5, reviewQuestion: [] } }] };
    repository.read.mockResolvedValueOnce({ draft: courseDraft(), version: "v1" }).mockResolvedValueOnce({ draft: theirs, version: "v2" });
    repository.applyChanges.mockRejectedValueOnce(new AppError("changedElsewhere", { url: "x" }));
    await expect(useCases.editReleaseDraft(courseDraft().url, changes)).resolves.toEqual({ ok: false, refusal: { refused: "idTaken", id: "ch-c" } });
    expect(repository.applyChanges).toHaveBeenCalledTimes(1);
  });
});
