import { describe, expect, it } from "vitest";
import { deckDraft, DRAFT, of, playableCourseDraft } from "@solid-memo/domain/testing/releaseDraft";
import { LATEST_VERSION } from "@solid-memo/vocab/types.generated";
import { createDraftDeckLibrary } from "./draftDeckLibrary";

describe("createDraftDeckLibrary", () => {
  it("is a library of the draft alone, as the listing preview lists it", async () => {
    const draft = { ...playableCourseDraft(), root: { ...playableCourseDraft().root, publisher: "https://anna.example/#me" } };
    const library = createDraftDeckLibrary(draft);
    expect((await library.listLibraryDecks()).map((deck) => [deck.url, deck.isCourse])).toEqual([[DRAFT, true]]);
    expect(await library.readLibraryIndex()).toEqual({ url: DRAFT, publisher: "https://anna.example/#me", releases: [DRAFT] });
    expect((await createDraftDeckLibrary(deckDraft()).readLibraryIndex()).publisher).toBeNull();
  });

  it("reads the draft's cards and outline as a release's", async () => {
    const library = createDraftDeckLibrary(playableCourseDraft());
    const content = await library.fetchLibraryDeck(DRAFT);
    expect(content).toMatchObject({ url: DRAFT, title: { en: "Solid" }, formatVersion: LATEST_VERSION.libraryDeck, isCourse: true, direction: "front-to-back" });
    expect(content).not.toHaveProperty("releases");
    expect(content.cards.map((card) => card.id).sort()).toEqual(["q-a-1a", "q-a-2a", "q-a-r01", "q-loose"]);
    expect(content.cards.find((card) => card.id === "q-a-1a")!.distractors).toHaveLength(2);
    const outline = await library.fetchCourseOutline(DRAFT);
    expect(outline.chapters.map((chapter) => [chapter.url, chapter.steps.map((step) => step.id), chapter.reviewQuestionIds])).toEqual([
      [of("ch-a"), ["ch-a-1", "ch-a-2"], ["q-a-r01"]],
    ]);
  });

  it("reads each time the draft as it is, and no other release", async () => {
    const library = createDraftDeckLibrary(deckDraft());
    expect((await library.fetchLibraryDeck(DRAFT)).cards.map((card) => card.id)).toEqual(["w1"]);
    expect((await library.fetchCourseOutline(DRAFT)).chapters).toEqual([]);
    await expect(library.fetchLibraryDeck("https://pod.example/other.ttl")).rejects.toMatchObject({ code: "releaseUnreadable" });
  });
});
