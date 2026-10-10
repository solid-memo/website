import { describe, expect, it, vi } from "vitest";
import { AppError } from "@solid-memo/domain/appError";
import type { Card, Deck } from "@solid-memo/domain/deck";
import { draftSummaryOf, draftUrlOf, type ReleaseDraftSummary } from "@solid-memo/domain/release/draftLayout";
import { applyDraftChanges, blankDraft, type DraftChange, type ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { rebaseDraft } from "@solid-memo/domain/release/releaseToDraft";
import { nextVersionDraft } from "@solid-memo/domain/release/releaseVersion";
import { courseDraft, NOW } from "@solid-memo/domain/testing/releaseDraft";
import { problem } from "@solid-memo/domain/release/problems";
import { SM } from "@solid-memo/vocab/vocab.generated";
import type { DeckLibrary, DeckRepository, FileExchange, ReleaseDraftRepository, ShapeValidator } from "./ports";
import { createReleaseDraftUseCases } from "./releaseDrafts";

const INSTANCE = "https://pod.example/solid-memo/main/";
const V1 = "https://pod.example/solid-memo/main/releases/solid/v1.ttl";
const DECKS = "https://site.example/decks/";
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
  const deckLibrary = {
    readLibraryIndex: vi.fn(async () => ({ url: INDEX, publisher: `${INDEX}#solid-memo`, releases: [`${DECKS}solid/v1.ttl`] })),
  } as unknown as DeckLibrary & { readLibraryIndex: ReturnType<typeof vi.fn> };
  const shapeValidator = {
    validateRelease: vi.fn(async (draft: ReleaseDraft) => [problem(draft.url, { code: "unshaped", params: {} }, { severity: "warning" })]),
  } as unknown as ShapeValidator & { validateRelease: ReturnType<typeof vi.fn> };
  const useCases = createReleaseDraftUseCases({
    releaseDraftRepository: repository,
    deckRepository,
    deckLibrary,
    shapeValidator,
    fileExchange,
    now: () => new Date(NOW),
  });
  const created = () => repository.create.mock.calls.at(-1)![1];
  return { repository, deckRepository, deckLibrary, shapeValidator, fileExchange, useCases, created };
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

  it("is read with the version its documents were at, by readReleaseDraft", async () => {
    const { useCases } = setUp();
    await expect(useCases.readReleaseDraft(courseDraft().url)).resolves.toEqual({ draft: courseDraft(), version: "v1" });
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

describe("checkReleaseDraft", () => {
  /** A Markdown check that finds one thing in every text, and counts its calls. */
  const markdownCheck = { problems: vi.fn(() => [{ code: "html" }]), chunks: () => ({ chunks: 1, empty: 0 }) };
  /** The course, its first question written in Markdown. */
  function marked(): ReleaseDraft {
    const draft = courseDraft();
    return { ...draft, cards: draft.cards.map((card, at) => (at === 0 ? { ...card, data: { ...card.data, textFormat: SM.markdown } } : card)) };
  }

  it("checks the draft for a pod by the domain's rules, once for each draft, the shapes only when asked", async () => {
    const { useCases, deckLibrary, shapeValidator, repository } = setUp();
    markdownCheck.problems.mockClear();
    const draft = marked();
    const check = await useCases.checkReleaseDraft(draft, markdownCheck, "pod");
    expect(check.rules.map((p) => p.code)).toContain("chapterWithoutStep");
    expect(check.library).toEqual([]);
    expect(check.drops).toEqual([]);
    expect(check.markdown.map((p) => [p.code, p.subject])).toContainEqual(["markdown", `${draft.url}#q-a-1a`]);
    expect(check.shapes).toBeNull();
    expect(deckLibrary.readLibraryIndex).not.toHaveBeenCalled();
    expect(repository.readRelease).not.toHaveBeenCalled();
    const calls = markdownCheck.problems.mock.calls.length;
    await expect(useCases.checkReleaseDraft(draft, markdownCheck, "pod")).resolves.toEqual(check);
    expect(markdownCheck.problems.mock.calls.length).toBe(calls);
    expect(shapeValidator.validateRelease).not.toHaveBeenCalled();

    const shaped = await useCases.checkReleaseDraft(draft, markdownCheck, "pod", { shapes: true });
    expect(shaped).toEqual({ ...check, shapes: [problem(draft.url, { code: "unshaped", params: {} }, { severity: "warning" })] });
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
    const check = await useCases.checkReleaseDraft(draft, markdownCheck, "library", { shapes: true });
    expect(check.rules.map((p) => p.code)).toContain("missingLanguage");
    // The fixture states version 1, its place version 2.
    expect(check.library.map((p) => [p.code, p.subject, p.field])).toEqual([
      ["versionMismatch", draft.url, "http://www.w3.org/ns/dcat#version"],
      ["linkMismatch", draft.url, "http://www.w3.org/ns/dcat#inSeries"],
      ["linkMismatch", draft.url, "http://www.w3.org/ns/dcat#isVersionOf"],
      ["linkMismatch", draft.url, "http://purl.org/dc/terms/publisher"],
      ["linkMismatch", draft.url, "http://www.w3.org/ns/dcat#prev"],
      ["linkMismatch", draft.url, "http://www.w3.org/ns/dcat#previousVersion"],
    ]);
    expect(shapeValidator.validateRelease).toHaveBeenCalledWith(draft, `${DECKS}solid/v2.ttl`, INDEX);
    expect(deckLibrary.readLibraryIndex).toHaveBeenCalledTimes(2);
  });

  it("checks the draft against the release it follows, read once, and again when it could not be", async () => {
    const { useCases, repository } = setUp();
    const draft = courseDraft();
    const next: ReleaseDraft = { ...draft, root: { ...draft.root, prev: V1, version: "2" }, cards: draft.cards.slice(1) };
    repository.readRelease.mockRejectedValueOnce(new AppError("releaseUnreadable", { url: V1 }));
    // The rest of the check stands.
    const unread = await useCases.checkReleaseDraft(next, markdownCheck, "pod");
    expect(unread.drops).toEqual([problem(next.url, { code: "previousUnread", params: { previous: V1 } }, { related: [V1] })]);
    expect(unread.rules.map((p) => p.code)).toContain("chapterWithoutStep");
    const check = await useCases.checkReleaseDraft(next, markdownCheck, "pod");
    expect(check.drops).toEqual([expect.objectContaining({ code: "cardsDropped", params: { ids: ["q-a-1a"], previous: V1 } })]);
    await useCases.checkReleaseDraft({ ...next }, markdownCheck, "pod");
    expect(repository.readRelease).toHaveBeenCalledTimes(2);
  });

  it("runs the shapes again when they failed", async () => {
    const { useCases, shapeValidator } = setUp();
    const draft = courseDraft();
    shapeValidator.validateRelease.mockRejectedValueOnce(new Error("offline"));
    await expect(useCases.checkReleaseDraft(draft, markdownCheck, "pod", { shapes: true })).rejects.toThrow("offline");
    await expect(useCases.checkReleaseDraft(draft, markdownCheck, "pod", { shapes: true })).resolves.toMatchObject({ shapes: expect.any(Array) });
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
