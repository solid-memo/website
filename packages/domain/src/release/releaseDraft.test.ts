import { describe, expect, it } from "vitest";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { card, courseDraft, deckDraft, DRAFT, link, NOW, of } from "../testing/releaseDraft.ts";
import {
  activitiesOf,
  applyDraftChange,
  applyDraftChanges,
  attributionOf,
  attributionText,
  authorNames,
  blankDraft,
  checkActivityTriples,
  generatingActivities,
  idIn,
  idsInUse,
  iriIn,
  isRefusal,
  liveChapters,
  mergedDraft,
  liveSteps,
  makingNotesOf,
  ownMakingOf,
  placeOf,
  publishedIdsOf,
  RDF_TYPE,
  readCheckActivity,
  turtleDistribution,
  unsupportedIdOf,
  type CheckActivity,
  type DraftChange,
  type ReleaseDraft,
} from "./releaseDraft.ts";
import { rebaseDraft } from "./releaseToDraft.ts";
import { nextVersionDraft } from "./releaseVersion.ts";

const PROV = "http://www.w3.org/ns/prov#";

/** The draft after the change, which must be made. */
function made(draft: ReleaseDraft, ...changes: DraftChange[]): ReleaseDraft {
  const result = applyDraftChanges(draft, changes);
  if (isRefusal(result)) throw new Error(`Refused: ${JSON.stringify(result)}`);
  return result;
}

const positions = (draft: ReleaseDraft, list: "chapters" | "steps") =>
  Object.fromEntries(draft[list].map((node) => [node.id, node.data.position]));

const check: CheckActivity = {
  check: "ai",
  label: "Facts",
  scope: "every chapter",
  outcome: "two answers fixed",
  endedAt: NOW,
  language: "en",
};

describe("a blank draft", () => {
  it("is version 1 of a series of its own, with its Turtle distribution, nothing published", () => {
    const draft = blankDraft({ url: DRAFT, course: true, title: { en: "Solid" }, now: NOW });
    expect(draft.root).toMatchObject({
      title: { en: "Solid" },
      created: NOW,
      version: "1",
      inSeries: of("series"),
      isVersionOf: of("series"),
      distribution: [of("turtle")],
      studyDirection: SM.frontToBack,
      // A course is about education, as a course release says.
      theme: ["http://publications.europa.eu/resource/authority/data-theme/EDUC"],
    });
    expect(draft.distributions).toEqual([{ id: "turtle", data: turtleDistribution(DRAFT) }]);
    expect(draft.course).toBe(true);
    expect(draft.published).toEqual({ ids: {}, activities: [] });
  });

  it("leaves out a title with no text, and the ids other subjects will have", () => {
    const draft = blankDraft({ url: DRAFT, course: false, title: {}, now: NOW, taken: ["turtle", "series", "series-2"] });
    expect(draft.root.title).toBeUndefined();
    expect(draft.root.theme).toEqual([]);
    expect(draft.root.inSeries).toBe(of("series-3"));
    expect(draft.distributions[0]!.id).toBe("turtle-2");
  });
});

describe("ids", () => {
  it("are fragments of the draft's release document", () => {
    expect(iriIn({ url: DRAFT }, "q1")).toBe(of("q1"));
    expect(idIn({ url: DRAFT }, of("q1"))).toBe("q1");
    expect(idIn({ url: DRAFT }, "https://elsewhere.example/#q1")).toBeNull();
  });

  it("in use are every subject's and every IRI of the draft a statement or the root names", () => {
    const ids = idsInUse(courseDraft());
    for (const id of ["ch-a", "ch-a-1", "q-a-1a", "q-a-1a-d1", "turtle", "series", "compilation"]) expect(ids.has(id)).toBe(true);
    expect(ids.has("https://source.example/")).toBe(false);
  });
});

describe("applyDraftChange", () => {
  it("changes nothing in a draft that was released", () => {
    const draft = courseDraft();
    const released = { ...draft, root: { ...draft.root, releasedAs: "https://pod.example/releases/solid/v2.ttl" } };
    expect(applyDraftChange(released, { kind: "retire", of: "card", id: "q-loose" })).toEqual({ refused: "released" });
  });

  it("stops at the first change refused", () => {
    expect(applyDraftChanges(courseDraft(), [{ kind: "retire", of: "card", id: "q-loose" }, { kind: "retire", of: "card", id: "gone" }])).toEqual({
      refused: "missing",
      id: "gone",
    });
  });

  describe("setMeta", () => {
    it("sets the fields given and clears those given as null", () => {
      const draft = made(courseDraft(), {
        kind: "setMeta",
        meta: { description: { en: "About" }, title: null, theme: null, keyword: null, versionNotes: "First release.", license: undefined },
      });
      expect(draft.root.description).toEqual({ en: "About" });
      expect(draft.root.title).toBeUndefined();
      expect(draft.root.theme).toEqual([]);
      expect(draft.root.keyword).toEqual({});
      expect(draft.root.versionNotes).toBe("First release.");
    });

    it("makes a deck studied front to back a course, and refuses a course studied otherwise", () => {
      expect(applyDraftChange(deckDraft(), { kind: "setMeta", meta: { course: true } })).toEqual({ refused: "notFrontToBack" });
      const course = made(deckDraft(), { kind: "setMeta", meta: { course: true, studyDirection: SM.frontToBack as never } });
      expect(course.course).toBe(true);
      expect(applyDraftChange(course, { kind: "setMeta", meta: { studyDirection: SM.backToFront as never } })).toEqual({ refused: "notFrontToBack" });
      expect(made(course, { kind: "setMeta", meta: { course: false } }).course).toBe(false);
    });
  });

  describe("setAgent", () => {
    it("adds an agent, changes it, and removes it with every mention of it", () => {
      const added = made(
        courseDraft(),
        { kind: "setAgent", id: "alice", agent: { name: "Alice" } },
        { kind: "setAgent", id: "bob", agent: { name: "Bob" } },
        { kind: "setAgent", id: "alice", agent: { name: "Alice A.", mbox: "mailto:alice@example.org" } },
        { kind: "setMeta", meta: { creator: [of("alice"), of("bob")], publisher: of("alice") } },
      );
      expect(added.agents).toEqual([
        { id: "alice", data: { name: "Alice A.", mbox: "mailto:alice@example.org" } },
        { id: "bob", data: { name: "Bob" } },
      ]);
      const withLink = { ...added, triples: [...added.triples, link(of("compilation"), `${PROV}wasAssociatedWith`, of("alice"))] };
      const removed = made(withLink, { kind: "setAgent", id: "alice", agent: null });
      expect(removed.agents.map((node) => node.id)).toEqual(["bob"]);
      expect(removed.root.creator).toEqual([of("bob")]);
      expect(removed.root.publisher).toBeUndefined();
      expect(removed.triples.some((triple) => triple.object.kind === "iri" && triple.object.value === of("alice"))).toBe(false);
      expect(made(added, { kind: "setAgent", id: "bob", agent: null }).root.publisher).toBe(of("alice"));
    });

    it("refuses removing an agent the draft does not have, and an id another subject has", () => {
      expect(applyDraftChange(courseDraft(), { kind: "setAgent", id: "nobody", agent: null })).toEqual({ refused: "missing", id: "nobody" });
      expect(applyDraftChange(courseDraft(), { kind: "setAgent", id: "q-loose", agent: { name: "Q" } })).toEqual({ refused: "idTaken", id: "q-loose" });
    });
  });

  describe("chapters", () => {
    it("adds one at a place among those in use, numbering them again, or last", () => {
      const draft = made(courseDraft(), { kind: "addChapter", id: "ch-c", text: { title: { en: "C" } }, at: 1 });
      expect(positions(draft, "chapters")).toEqual({ "ch-a": 0, "ch-b": 2, "ch-c": 1 });
      expect(draft.chapters.at(-1)).toEqual({ id: "ch-c", data: { title: { en: "C" }, course: DRAFT, reviewQuestion: [], position: 1 } });
      expect(positions(made(courseDraft(), { kind: "addChapter", id: "ch-c" }), "chapters")).toEqual({ "ch-a": 0, "ch-b": 1, "ch-c": 2 });
      expect(positions(made(courseDraft(), { kind: "addChapter", id: "ch-c", at: -3 }), "chapters")).toEqual({ "ch-a": 1, "ch-b": 2, "ch-c": 0 });
    });

    it("are a course's only, by an id of their own", () => {
      expect(applyDraftChange(deckDraft(), { kind: "addChapter", id: "ch-a" })).toEqual({ refused: "notACourse" });
      expect(applyDraftChange(courseDraft(), { kind: "addChapter", id: "ch-a" })).toEqual({ refused: "idTaken", id: "ch-a" });
      expect(applyDraftChange(courseDraft(), { kind: "addChapter", id: "-a" })).toEqual({ refused: "idInvalid", id: "-a" });
      expect(applyDraftChange(courseDraft({ ids: { "ch-old": "chapter" }, activities: [] }), { kind: "addChapter", id: "ch-old" })).toEqual({
        refused: "idTaken",
        id: "ch-old",
      });
    });

    it("changes a chapter's text, leaving what it asks", () => {
      const draft = made(courseDraft(), { kind: "editChapter", id: "ch-a", text: { description: { en: "About A" }, textFormat: SM.markdown } });
      expect(draft.chapters[0]!.data).toEqual({
        description: { en: "About A" },
        textFormat: SM.markdown,
        course: DRAFT,
        position: 0,
        reviewQuestion: [of("q-a-r01")],
      });
      expect(applyDraftChange(courseDraft(), { kind: "editChapter", id: "ch-z", text: {} })).toEqual({ refused: "missing", id: "ch-z" });
    });

    it("moves one among those in use; a retired one stays where it is", () => {
      expect(positions(made(courseDraft(), { kind: "moveChapter", id: "ch-b", to: 0 }), "chapters")).toEqual({ "ch-a": 1, "ch-b": 0 });
      const retired = made(courseDraft(), { kind: "retire", of: "chapter", id: "ch-a" });
      expect(made(retired, { kind: "moveChapter", id: "ch-a", to: 1 })).toEqual(retired);
      expect(applyDraftChange(courseDraft(), { kind: "moveChapter", id: "ch-z", to: 0 })).toEqual({ refused: "missing", id: "ch-z" });
    });

    it("are in use in their order, by position then id, one without a position last", () => {
      const draft = courseDraft();
      const unplaced = {
        ...draft,
        chapters: [
          { id: "ch-z", data: { course: DRAFT, reviewQuestion: [] } },
          { id: "ch-y", data: { course: DRAFT, reviewQuestion: [] } },
          ...draft.chapters.map((node) => ({ id: node.id, data: { ...node.data, position: 0 } })),
        ],
      };
      expect(liveChapters(unplaced).map((node) => node.id)).toEqual(["ch-a", "ch-b", "ch-y", "ch-z"]);
    });
  });

  describe("steps", () => {
    it("adds one to a chapter at a place among its steps in use", () => {
      const draft = made(courseDraft(), { kind: "addStep", id: "ch-a-3", chapter: "ch-a", text: { theory: { en: "Three" } }, at: 0 });
      expect(positions(draft, "steps")).toEqual({ "ch-a-1": 1, "ch-a-2": 2, "ch-a-3": 0 });
      expect(draft.steps.at(-1)!.data).toEqual({ theory: { en: "Three" }, chapter: of("ch-a"), checkedBy: [], position: 0 });
      expect(made(courseDraft(), { kind: "addStep", id: "ch-b-1", chapter: "ch-b" }).steps.at(-1)!.data.position).toBe(0);
    });

    it("are refused outside a course, in a chapter the draft does not have, or by an id another has", () => {
      expect(applyDraftChange(deckDraft(), { kind: "addStep", id: "s", chapter: "ch-a" })).toEqual({ refused: "notACourse" });
      expect(applyDraftChange(courseDraft(), { kind: "addStep", id: "s", chapter: "ch-z" })).toEqual({ refused: "missing", id: "ch-z" });
      expect(applyDraftChange(courseDraft(), { kind: "addStep", id: "ch-a", chapter: "ch-b" })).toEqual({ refused: "idTaken", id: "ch-a" });
    });

    it("changes a step's theory, leaving what checks it", () => {
      const draft = made(courseDraft(), { kind: "editStep", id: "ch-a-1", text: { theory: { en: "Uno" } } });
      expect(draft.steps[0]!.data).toEqual({ theory: { en: "Uno" }, chapter: of("ch-a"), position: 0, checkedBy: [of("q-a-1a")] });
    });

    it("moves one within its chapter, or to another, numbering both again", () => {
      expect(positions(made(courseDraft(), { kind: "moveStep", id: "ch-a-2", chapter: "ch-a", to: 0 }), "steps")).toEqual({ "ch-a-1": 1, "ch-a-2": 0 });
      const moved = made(courseDraft(), { kind: "moveStep", id: "ch-a-1", chapter: "ch-b", to: 0 });
      expect(moved.steps.find((node) => node.id === "ch-a-1")!.data).toMatchObject({ chapter: of("ch-b"), position: 0 });
      expect(moved.steps.find((node) => node.id === "ch-a-2")!.data.position).toBe(0);
      expect(liveSteps(moved, "ch-b").map((node) => node.id)).toEqual(["ch-a-1"]);
    });

    it("moves a retired one to another chapter without a place among those in use", () => {
      const retired = made(courseDraft(), { kind: "retire", of: "step", id: "ch-a-1" });
      const moved = made(retired, { kind: "moveStep", id: "ch-a-1", chapter: "ch-b", to: 0 });
      expect(moved.steps.find((node) => node.id === "ch-a-1")!.data).toMatchObject({ chapter: of("ch-b"), position: 0, deprecated: true });
    });

    it("moves a step of no chapter into one", () => {
      const draft = courseDraft();
      const loose = { ...draft, steps: [...draft.steps, { id: "loose", data: { checkedBy: [] } }] };
      expect(made(loose, { kind: "moveStep", id: "loose", chapter: "ch-b", to: 3 }).steps.at(-1)!.data).toEqual({ checkedBy: [], chapter: of("ch-b"), position: 0 });
    });

    it("refuses moving a step or into a chapter the draft does not have", () => {
      expect(applyDraftChange(courseDraft(), { kind: "moveStep", id: "s", chapter: "ch-a", to: 0 })).toEqual({ refused: "missing", id: "s" });
      expect(applyDraftChange(courseDraft(), { kind: "moveStep", id: "ch-a-1", chapter: "ch-z", to: 0 })).toEqual({ refused: "missing", id: "ch-z" });
    });
  });

  describe("cards and questions", () => {
    it("adds a card asked nowhere, and changes its content, keeping its distractors, creation and retirement", () => {
      const draft = made(deckDraft(), { kind: "addCard", id: "w2", card: { front: { sv: "två" }, back: { en: "two" }, frontNote: undefined } });
      expect(draft.cards.at(-1)).toEqual({ id: "w2", data: { front: { sv: "två" }, back: { en: "two" }, distractor: [] } });
      const course = made(courseDraft(), { kind: "retire", of: "card", id: "q-a-1a" }, { kind: "editCard", id: "q-a-1a", card: { front: { en: "New" }, back: { en: "Yes" } } });
      expect(course.cards[0]!.data).toEqual({
        front: { en: "New" },
        back: { en: "Yes" },
        created: NOW,
        deprecated: true,
        distractor: [of("q-a-1a-d1"), of("q-a-1a-d2")],
      });
      const recreated = made(courseDraft(), { kind: "editCard", id: "q-a-2a", card: { back: { en: "B" }, created: "2026-01-01T00:00:00.000Z" } });
      expect(recreated.cards[1]!.data).toEqual({ back: { en: "B" }, created: "2026-01-01T00:00:00.000Z", distractor: [] });
    });

    it("asks a card from one place only", () => {
      const asked = made(courseDraft(), { kind: "addQuestion", card: "q-loose", place: { kind: "step", step: "ch-a-2" } });
      expect(asked.steps[1]!.data.checkedBy).toEqual([of("q-a-2a"), of("q-loose")]);
      expect(placeOf(asked, "q-loose")).toEqual({ kind: "step", step: "ch-a-2" });
      expect(applyDraftChange(asked, { kind: "addQuestion", card: "q-loose", place: { kind: "review", chapter: "ch-b" } })).toEqual({
        refused: "askedElsewhere",
        card: "q-loose",
        place: { kind: "step", step: "ch-a-2" },
      });
      expect(applyDraftChange(courseDraft(), { kind: "addQuestion", card: "q-a-r01", place: { kind: "step", step: "ch-a-1" } })).toEqual({
        refused: "askedElsewhere",
        card: "q-a-r01",
        place: { kind: "review", chapter: "ch-a" },
      });
      const reviewed = made(courseDraft(), { kind: "addQuestion", card: "q-loose", place: { kind: "review", chapter: "ch-b" } });
      expect(reviewed.chapters[1]!.data.reviewQuestion).toEqual([of("q-loose")]);
      expect(placeOf(courseDraft(), "q-loose")).toBeNull();
    });

    it("refuses asking outside a course, a card the draft does not have, or from a place it does not have", () => {
      expect(applyDraftChange(deckDraft(), { kind: "addQuestion", card: "w1", place: { kind: "step", step: "s" } })).toEqual({ refused: "notACourse" });
      expect(applyDraftChange(courseDraft(), { kind: "addQuestion", card: "q-z", place: { kind: "step", step: "ch-a-1" } })).toEqual({
        refused: "missing",
        id: "q-z",
      });
      expect(applyDraftChange(courseDraft(), { kind: "addQuestion", card: "q-loose", place: { kind: "step", step: "s" } })).toEqual({
        refused: "missing",
        id: "s",
      });
      expect(applyDraftChange(courseDraft(), { kind: "addQuestion", card: "q-loose", place: { kind: "review", chapter: "c" } })).toEqual({
        refused: "missing",
        id: "c",
      });
    });

    it("moves a question to another place, or to none", () => {
      const moved = made(courseDraft(), { kind: "moveQuestion", card: "q-a-1a", place: { kind: "review", chapter: "ch-b" } });
      expect(moved.steps[0]!.data.checkedBy).toEqual([]);
      expect(moved.chapters[1]!.data.reviewQuestion).toEqual([of("q-a-1a")]);
      const unasked = made(courseDraft(), { kind: "moveQuestion", card: "q-a-r01", place: null });
      expect(unasked.chapters[0]!.data.reviewQuestion).toEqual([]);
      expect(made(deckDraft(), { kind: "moveQuestion", card: "w1", place: null })).toEqual(deckDraft());
      expect(applyDraftChange(deckDraft(), { kind: "moveQuestion", card: "w1", place: { kind: "review", chapter: "c" } })).toEqual({ refused: "notACourse" });
      expect(applyDraftChange(courseDraft(), { kind: "moveQuestion", card: "q-z", place: null })).toEqual({ refused: "missing", id: "q-z" });
    });

    it("adds a distractor to a card and changes it, keeping its retirement", () => {
      const added = made(courseDraft(), { kind: "addDistractor", card: "q-a-2a", id: "q-a-2a-d1", distractor: { text: { en: "No" }, note: undefined } });
      expect(added.cards[1]!.data.distractor).toEqual([of("q-a-2a-d1")]);
      expect(added.distractors.at(-1)).toEqual({ id: "q-a-2a-d1", data: { text: { en: "No" } } });
      const edited = made(added, { kind: "retire", of: "distractor", id: "q-a-2a-d1" }, { kind: "editDistractor", id: "q-a-2a-d1", distractor: { text: { en: "Nope" } } });
      expect(edited.distractors.at(-1)!.data).toEqual({ text: { en: "Nope" }, deprecated: true });
      expect(made(courseDraft(), { kind: "editDistractor", id: "q-a-1a-d1", distractor: { text: { en: "N" } } }).distractors[0]!.data).toEqual({ text: { en: "N" } });
      expect(applyDraftChange(courseDraft(), { kind: "addDistractor", card: "q-z", id: "d", distractor: { text: { en: "No" } } })).toEqual({
        refused: "missing",
        id: "q-z",
      });
      expect(applyDraftChange(courseDraft(), { kind: "addDistractor", card: "q-a-2a", id: "q-a-1a-d1", distractor: { text: { en: "No" } } })).toEqual({
        refused: "idTaken",
        id: "q-a-1a-d1",
      });
    });
  });

  describe("retiring and restoring", () => {
    it("retires a chapter, numbering those in use again, and restores it", () => {
      const retired = made(courseDraft(), { kind: "retire", of: "chapter", id: "ch-a" });
      expect(retired.chapters[0]!.data).toMatchObject({ deprecated: true, position: 0 });
      expect(retired.chapters[1]!.data.position).toBe(0);
      const restored = made(retired, { kind: "restore", of: "chapter", id: "ch-a" });
      expect(restored.chapters[0]!.data.deprecated).toBeUndefined();
      expect(positions(restored, "chapters")).toEqual({ "ch-a": 0, "ch-b": 1 });
    });

    it("retires a card, a step and a distractor, and refuses one the draft does not have", () => {
      const draft = made(
        courseDraft(),
        { kind: "retire", of: "card", id: "q-loose" },
        { kind: "retire", of: "step", id: "ch-a-1" },
        { kind: "retire", of: "distractor", id: "q-a-1a-d1" },
      );
      expect(draft.cards[3]!.data.deprecated).toBe(true);
      expect(positions(draft, "steps")).toEqual({ "ch-a-1": 0, "ch-a-2": 0 });
      expect(draft.distractors[0]!.data.deprecated).toBe(true);
      expect(applyDraftChange(courseDraft(), { kind: "restore", of: "card", id: "q-z" })).toEqual({ refused: "missing", id: "q-z" });
    });
  });

  describe("delete", () => {
    it("deletes a card never published, its distractors with it, asked from nowhere after", () => {
      const draft = made(courseDraft(), { kind: "delete", of: "card", id: "q-a-1a" });
      expect(draft.cards.map((node) => node.id)).toEqual(["q-a-2a", "q-a-r01", "q-loose"]);
      expect(draft.distractors).toEqual([]);
      expect(draft.steps[0]!.data.checkedBy).toEqual([]);
      expect(made(courseDraft(), { kind: "delete", of: "card", id: "q-a-r01" }).chapters[0]!.data.reviewQuestion).toEqual([]);
    });

    it("deletes a chapter with its steps, whose questions stay, asked from nowhere", () => {
      const draft = made(courseDraft(), { kind: "delete", of: "chapter", id: "ch-a" });
      expect(draft.chapters).toEqual([{ id: "ch-b", data: { title: { en: "B" }, course: DRAFT, position: 0, reviewQuestion: [] } }]);
      expect(draft.steps).toEqual([]);
      expect(draft.cards.map((node) => node.id)).toEqual(["q-a-1a", "q-a-2a", "q-a-r01", "q-loose"]);
    });

    it("deletes a step, numbering its chapter's again, and a distractor, which its card no longer names", () => {
      expect(positions(made(courseDraft(), { kind: "delete", of: "step", id: "ch-a-1" }), "steps")).toEqual({ "ch-a-2": 0 });
      const draft = made(courseDraft(), { kind: "delete", of: "distractor", id: "q-a-1a-d1" });
      expect(draft.cards[0]!.data.distractor).toEqual([of("q-a-1a-d2")]);
    });

    it("deletes what statements say of it, and refuses what the draft does not have", () => {
      const draft = courseDraft();
      const said = { ...draft, triples: [...draft.triples, link(of("q-loose"), "https://other.example/note", "https://other.example/x")] };
      expect(made(said, { kind: "delete", of: "card", id: "q-loose" }).triples).toEqual(draft.triples);
      expect(applyDraftChange(draft, { kind: "delete", of: "step", id: "s" })).toEqual({ refused: "missing", id: "s" });
    });

    it("refuses deleting what an earlier release published, or what goes with it, offering to retire it", () => {
      const published = courseDraft({ ids: { "q-a-1a-d2": "distractor", "ch-a-2": "step" }, activities: [] });
      expect(applyDraftChange(published, { kind: "delete", of: "card", id: "q-a-1a" })).toEqual({ refused: "published", of: "distractor", id: "q-a-1a-d2" });
      expect(applyDraftChange(published, { kind: "delete", of: "chapter", id: "ch-a" })).toEqual({ refused: "published", of: "step", id: "ch-a-2" });
      expect(isRefusal(applyDraftChange(published, { kind: "delete", of: "distractor", id: "q-a-1a-d1" }))).toBe(false);
    });

    it("leaves a dangling distractor link out of what goes with a card", () => {
      const draft = courseDraft();
      const dangling = { ...draft, cards: [{ id: "q-x", data: card("x", { distractor: [of("gone"), "https://elsewhere.example/#d"] }) }, ...draft.cards] };
      expect(made(dangling, { kind: "delete", of: "card", id: "q-x" }).cards).toEqual(draft.cards);
    });
  });

  describe("sources", () => {
    const source = {
      statements: [{ predicate: "http://purl.org/dc/terms/title", object: { kind: "literal" as const, value: "Wiki", language: "", datatype: "http://www.w3.org/2001/XMLSchema#string" } }],
      derivedFrom: true,
      used: true,
    };

    it("sets a source the release is drawn from and its making used", () => {
      const draft = made(courseDraft(), { kind: "setSource", iri: "https://wiki.example/", source });
      expect(draft.root.wasDerivedFrom).toEqual(["https://source.example/", "https://wiki.example/"]);
      expect(draft.triples).toContainEqual(link(of("compilation"), `${PROV}used`, "https://wiki.example/"));
      expect(draft.triples).toContainEqual({ subject: "https://wiki.example/", ...source.statements[0] });
      const only = made(courseDraft(), { kind: "setSource", iri: "https://source.example/", source: { statements: [], derivedFrom: true, used: false } });
      expect(only.root.wasDerivedFrom).toEqual(["https://source.example/"]);
      expect(only.triples.some((triple) => triple.subject === "https://source.example/" || triple.predicate === `${PROV}used`)).toBe(false);
    });

    it("refuses a source the release would be neither derived from nor have used", () => {
      for (const draft of [courseDraft(), blankDraft({ url: DRAFT, course: false, title: {}, now: NOW })]) {
        expect(applyDraftChange(draft, { kind: "setSource", iri: "https://source.example/", source: { ...source, derivedFrom: false, used: false } })).toEqual({
          refused: "unusedSource",
          id: "https://source.example/",
        });
      }
    });

    it("gives a release that names no making one, `#compilation`, for the source it used", () => {
      const blank = blankDraft({ url: DRAFT, course: false, title: {}, now: NOW });
      expect(generatingActivities(blank)).toEqual([]);
      const draft = made(blank, { kind: "setSource", iri: "https://wiki.example/", source: { ...source, derivedFrom: false } });
      expect(generatingActivities(draft)).toEqual([of("compilation")]);
      expect(draft.triples).toContainEqual(link(of("compilation"), RDF_TYPE, `${PROV}Activity`));
      expect(draft.triples).toContainEqual(link(of("compilation"), `${PROV}used`, "https://wiki.example/"));
      expect(draft.root.wasDerivedFrom).toEqual([]);
    });

    it("removes a source with every mention of it, refusing one the draft does not have", () => {
      const draft = made(courseDraft(), { kind: "setSource", iri: "https://source.example/", source: null });
      expect(draft.root.wasDerivedFrom).toEqual([]);
      expect(draft.triples.map((triple) => triple.subject)).toEqual([DRAFT, of("compilation")]);
      expect(applyDraftChange(courseDraft(), { kind: "setSource", iri: "https://none.example/", source: null })).toEqual({
        refused: "missing",
        id: "https://none.example/",
      });
    });
  });

  describe("check activities", () => {
    it("records a check as an activity informing the release's making, never as a human review", () => {
      const draft = made(courseDraft(), { kind: "addCheckActivity", id: "review-1", activity: check });
      expect(activitiesOf(draft)).toEqual(["compilation", "review-1"]);
      expect(draft.triples).toContainEqual(link(of("compilation"), `${PROV}wasInformedBy`, of("review-1")));
      const comments = draft.triples.filter((triple) => triple.subject === of("review-1")).map((triple) => triple.object.value);
      expect(comments).toEqual([
        `${PROV}Activity`,
        NOW,
        "Facts (AI)",
        "Scope: every chapter; an AI check, not a human review.",
        "Outcome: two answers fixed",
      ]);
    });

    it("words a machine check, and one in Swedish, as no human review either", () => {
      expect(checkActivityTriples(of("r"), { ...check, check: "machine", label: " Machine checks " }).map((triple) => triple.object.value).slice(2)).toEqual([
        "Machine checks",
        "Scope: every chapter; a machine check, not a human review.",
        "Outcome: two answers fixed",
      ]);
      const swedish = checkActivityTriples(of("r"), { ...check, language: "sv" });
      expect(swedish.map((triple) => triple.object.value).slice(2)).toEqual([
        "Facts (AI)",
        "Omfattning: every chapter; en kontroll av AI, inte en granskning av en människa.",
        "Utfall: two answers fixed",
      ]);
      expect(swedish[2]!.object).toMatchObject({ language: "sv" });
      expect(checkActivityTriples(of("r"), { ...check, check: "machine", language: "sv" })[3]!.object.value).toBe(
        "Omfattning: every chapter; en maskinell kontroll, inte en granskning av en människa.",
      );
      expect(checkActivityTriples(of("r"), { ...check, language: "de" })[2]!.object).toMatchObject({ language: "en" });
    });

    it("changes and deletes a check of this draft's, never one carried from an earlier release", () => {
      const draft = made(courseDraft(), { kind: "addCheckActivity", id: "review-1", activity: check });
      const edited = made(draft, { kind: "editCheckActivity", id: "review-1", activity: { ...check, outcome: "none" } });
      expect(edited.triples.filter((triple) => triple.subject === of("review-1")).at(-1)!.object.value).toBe("Outcome: none");
      expect(edited.triples).toContainEqual(link(of("compilation"), `${PROV}wasInformedBy`, of("review-1")));
      const deleted = made(draft, { kind: "deleteActivity", id: "review-1" });
      expect(deleted.triples).toEqual(courseDraft().triples);
      const carried = { ...draft, published: { ids: {}, activities: ["compilation"] } };
      expect(applyDraftChange(carried, { kind: "deleteActivity", id: "compilation" })).toEqual({ refused: "carriedActivity", id: "compilation" });
      expect(applyDraftChange(carried, { kind: "editCheckActivity", id: "compilation", activity: check })).toEqual({ refused: "carriedActivity", id: "compilation" });
      expect(applyDraftChange(draft, { kind: "deleteActivity", id: "review-9" })).toEqual({ refused: "missing", id: "review-9" });
      expect(applyDraftChange(draft, { kind: "addCheckActivity", id: "review-1", activity: check })).toEqual({ refused: "idTaken", id: "review-1" });
      expect(applyDraftChange({ ...draft, published: { ids: {}, activities: ["review-2"] } }, { kind: "addCheckActivity", id: "review-2", activity: check })).toEqual({
        refused: "idTaken",
        id: "review-2",
      });
    });

    it("takes, with a making deleted, what the draft states of a source nothing else names", () => {
      const title = { kind: "literal" as const, value: "Wiki", language: "", datatype: "http://www.w3.org/2001/XMLSchema#string" };
      const used = made(courseDraft(), {
        kind: "setSource",
        iri: "https://wiki.example/",
        source: { statements: [{ predicate: "http://purl.org/dc/terms/title", object: title }], derivedFrom: false, used: true },
      });
      const both = made(used, { kind: "setSource", iri: "https://source.example/", source: { statements: [{ predicate: "http://purl.org/dc/terms/title", object: title }], derivedFrom: true, used: true } });
      const deleted = made(both, { kind: "deleteActivity", id: "compilation" });
      expect(deleted.triples.some((triple) => triple.subject === "https://wiki.example/")).toBe(false);
      expect(deleted.triples).toContainEqual({ subject: "https://source.example/", predicate: "http://purl.org/dc/terms/title", object: title });
      const named = { ...both, triples: [...both.triples, link("https://other.example/", "http://www.w3.org/2000/01/rdf-schema#seeAlso", "https://wiki.example/")] };
      expect(made(named, { kind: "deleteActivity", id: "compilation" }).triples).toContainEqual({ subject: "https://wiki.example/", predicate: "http://purl.org/dc/terms/title", object: title });
    });

    it("stands alone in a release that names no activity it was generated by", () => {
      const draft = made(deckDraft(), { kind: "addCheckActivity", id: "review-1", activity: check });
      expect(generatingActivities(draft)).toEqual([]);
      expect(draft.triples).toEqual(checkActivityTriples(of("review-1"), check));
    });
  });
});

describe("the licence", () => {
  const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";
  const BY = "https://creativecommons.org/licenses/by/4.0/";
  const typed = (iri: string) => link(iri, RDF_TYPE, "http://purl.org/dc/terms/LicenseDocument");

  it("is set typed a licence document, once, and the one it replaces loses its type", () => {
    const cc0 = made(courseDraft(), { kind: "setLicense", license: CC0 });
    expect(cc0.root.license).toBe(CC0);
    expect(cc0.triples.filter((triple) => triple.subject === CC0)).toEqual([typed(CC0)]);
    expect(made(cc0, { kind: "setLicense", license: CC0 }).triples).toEqual(cc0.triples);
    const by = made(cc0, { kind: "setLicense", license: BY });
    expect(by.triples).toContainEqual(typed(BY));
    expect(by.triples).not.toContainEqual(typed(CC0));
    const none = made(by, { kind: "setLicense", license: null });
    expect(none.root.license).toBeUndefined();
    expect(none.triples).toEqual(courseDraft().triples);
  });

  it("keeps the type of a licence a source still names", () => {
    const cc0 = made(courseDraft(), { kind: "setLicense", license: CC0 });
    const named = { ...cc0, triples: [...cc0.triples, link("https://source.example/", "http://purl.org/dc/terms/license", CC0)] };
    expect(made(named, { kind: "setLicense", license: BY }).triples).toContainEqual(typed(CC0));
  });
});

describe("the attribution", () => {
  const authored = (draft: ReleaseDraft, ...names: string[]) =>
    made(
      draft,
      ...names.map((name, n): DraftChange => ({ kind: "setAgent", id: `a${n}`, agent: { name } })),
      { kind: "setMeta", meta: { creator: names.map((_name, n) => of(`a${n}`)) } },
    );
  const comments = (draft: ReleaseDraft, activity: string) =>
    draft.triples.filter((triple) => triple.subject === activity && triple.predicate === "http://www.w3.org/2000/01/rdf-schema#comment").map((triple) => triple.object);

  it("is worded in English and Swedish, the names joined by the language's and", () => {
    expect(attributionText(["Ann"], false, "en")).toBe("Compiled by Ann.");
    expect(attributionText(["Ann", "Bo"], true, "en")).toBe("Compiled by Ann and Bo with the help of AI.");
    expect(attributionText(["Ann", "Bo", "Cy"], true, "sv")).toBe("Sammanställd av Ann, Bo och Cy med hjälp av AI.");
    expect(attributionText(["Ann"], false, "de")).toBe("Compiled by Ann.");
  });

  it("names the authors, as the making of the release states it, with or without AI", () => {
    const draft = authored(courseDraft(), "Ann", "Bo");
    expect(authorNames({ ...draft, root: { ...draft.root, creator: [...draft.root.creator, "https://elsewhere.example/#c", of("nobody")] } })).toEqual(["Ann", "Bo"]);
    const attributed = made(draft, { kind: "setAttribution", attribution: { ai: true } });
    expect(comments(attributed, of("compilation")).map((term) => [term.value, (term as { language: string }).language])).toEqual([
      ["Compiled by Ann and Bo with the help of AI.", "en"],
      ["Sammanställd av Ann och Bo med hjälp av AI.", "sv"],
    ]);
    expect(attributionOf(attributed)).toEqual({ ai: true, text: "Compiled by Ann and Bo with the help of AI." });
    const plain = made(attributed, { kind: "setAttribution", attribution: { ai: false } });
    expect(comments(plain, of("compilation"))).toHaveLength(2);
    expect(attributionOf(plain)).toEqual({ ai: false, text: "Compiled by Ann and Bo." });
    expect(attributionOf(made(plain, { kind: "setAttribution", attribution: null }))).toBeNull();
    expect(attributionOf(courseDraft())).toBeNull();
  });

  it("reads a Swedish attribution alone", () => {
    const draft = authored(courseDraft(), "Ann");
    const swedish = { ...draft, triples: [...draft.triples, { subject: of("compilation"), predicate: "http://www.w3.org/2000/01/rdf-schema#comment", object: { kind: "literal" as const, value: "Sammanställd av Ann.", language: "sv", datatype: "" } }] };
    expect(attributionOf(swedish)).toEqual({ ai: false, text: "Sammanställd av Ann." });
  });

  it("is refused without authors, and gives a release that names no making one", () => {
    expect(applyDraftChange(courseDraft(), { kind: "setAttribution", attribution: { ai: true } })).toEqual({ refused: "noAuthors" });
    const deck = made(authored(deckDraft(), "Ann"), { kind: "setAttribution", attribution: { ai: false } });
    expect(generatingActivities(deck)).toEqual([of("compilation")]);
    expect(ownMakingOf(deck)).toBe(of("compilation"));
    expect(made(deckDraft(), { kind: "setAttribution", attribution: null })).toEqual(deckDraft());
    const taken = { ...deckDraft(), agents: [{ id: "compilation", data: { name: "C" } }] };
    expect(generatingActivities(made(authored(taken, "Ann"), { kind: "setAttribution", attribution: { ai: false } }))).toEqual([of("compilation-2")]);
  });
});

describe("the notes of the making", () => {
  it("are each language's comments beside the attribution, a paragraph each", () => {
    const draft = made(
      courseDraft(),
      { kind: "setAgent", id: "ann", agent: { name: "Ann" } },
      { kind: "setMeta", meta: { creator: [of("ann")] } },
      { kind: "setAttribution", attribution: { ai: true } },
      { kind: "setMakingNotes", notes: { en: "Sources: 2 documents.\n\n  Structure: 2 chapters.  \n \n", sv: "Källor: 2.", "": "Plain." } },
    );
    expect(makingNotesOf(draft)).toEqual({ en: "Sources: 2 documents.\n\nStructure: 2 chapters.", sv: "Källor: 2.", "": "Plain." });
    expect(attributionOf(draft)!.ai).toBe(true);
    const cleared = made(draft, { kind: "setMakingNotes", notes: {} });
    expect(makingNotesOf(cleared)).toEqual({});
    expect(attributionOf(cleared)).not.toBeNull();
    expect(makingNotesOf(deckDraft())).toEqual({});
    expect(made(deckDraft(), { kind: "setMakingNotes", notes: { en: " " } })).toEqual(deckDraft());
  });

  it("keep a note that only starts as an attribution, which the attribution leaves as it is", () => {
    const draft = made(
      courseDraft(),
      { kind: "setAgent", id: "ann", agent: { name: "Ann" } },
      { kind: "setMeta", meta: { creator: [of("ann")] } },
      { kind: "setMakingNotes", notes: { en: "Compiled by hand from two books.", sv: "Sammanställd av Bo." } },
    );
    expect(makingNotesOf(draft)).toEqual({ en: "Compiled by hand from two books.", sv: "Sammanställd av Bo." });
    expect(attributionOf(draft)).toBeNull();
    const attributed = made(draft, { kind: "setAttribution", attribution: { ai: false } });
    expect(attributionOf(attributed)).toEqual({ ai: false, text: "Compiled by Ann." });
    expect(makingNotesOf(made(attributed, { kind: "setAttribution", attribution: null }))).toEqual(makingNotesOf(draft));
  });
});

describe("readCheckActivity", () => {
  it("reads back a check as it was recorded, by machine or AI, in English or Swedish", () => {
    for (const activity of [check, { ...check, check: "machine" as const }, { ...check, language: "sv" }, { ...check, check: "machine" as const, language: "sv", label: "Maskin" }]) {
      const draft = made(courseDraft(), { kind: "addCheckActivity", id: "review-1", activity });
      expect(readCheckActivity(draft, "review-1")).toEqual(activity);
    }
  });

  it("is null for an activity written otherwise", () => {
    const draft = made(courseDraft(), { kind: "addCheckActivity", id: "review-1", activity: check });
    expect(readCheckActivity(draft, "compilation")).toBeNull();
    const more = { ...draft, triples: [...draft.triples, link(of("review-1"), `${PROV}used`, "https://source.example/")] };
    expect(readCheckActivity(more, "review-1")).toBeNull();
    const reworded = {
      ...draft,
      triples: draft.triples.map((triple) =>
        triple.subject === of("review-1") && triple.object.value.startsWith("Outcome") ? { ...triple, object: { ...triple.object, value: "Result: fine" } } : triple,
      ),
    };
    expect(readCheckActivity(reworded, "review-1")).toBeNull();
    const short = { ...draft, triples: draft.triples.filter((triple) => !(triple.subject === of("review-1") && triple.object.value.startsWith("Scope"))) };
    expect(readCheckActivity(short, "review-1")).toBeNull();
  });
});

describe("publishedIdsOf", () => {
  it("is every card, chapter, step and distractor of a release, and its activities, with what it carried itself", () => {
    const release = courseDraft({ ids: { "q-old": "card" }, activities: ["older"] });
    expect(publishedIdsOf(release)).toEqual({
      ids: {
        "q-old": "card",
        "q-a-1a": "card",
        "q-a-2a": "card",
        "q-a-r01": "card",
        "q-loose": "card",
        "ch-a": "chapter",
        "ch-b": "chapter",
        "ch-a-1": "step",
        "ch-a-2": "step",
        "q-a-1a-d1": "distractor",
        "q-a-1a-d2": "distractor",
      },
      activities: ["older", "compilation"],
    });
  });

  it("counts an activity of another document as none of the release's", () => {
    const draft = courseDraft();
    const elsewhere = { ...draft, triples: [...draft.triples, link("https://other.example/#a", "http://www.w3.org/1999/02/22-rdf-syntax-ns#type", `${PROV}Activity`)] };
    expect(publishedIdsOf(elsewhere).activities).toEqual(["compilation"]);
  });
});

describe("what an earlier release published", () => {
  it("stays in the draft whatever changes are made, in any order", () => {
    const published = publishedIdsOf(courseDraft());
    const ids = Object.keys(published.ids);
    // A seeded random source, so a failure can be run again.
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)]!;
    for (let run = 0; run < 50; run++) {
      let draft = courseDraft(published);
      for (let step = 0; step < 20; step++) {
        const id = pick(ids);
        const of = published.ids[id]!;
        const change = pick<DraftChange>([
          { kind: "delete", of, id },
          { kind: "retire", of, id },
          { kind: "restore", of, id },
          { kind: "moveQuestion", card: id, place: null },
          { kind: "addCard", id, card: { back: { en: "x" } } },
          { kind: "addChapter", id: `ch-new-${step}` },
          { kind: "delete", of: "chapter", id: `ch-new-${step - 1}` },
        ]);
        const next = applyDraftChange(draft, change);
        if (!isRefusal(next)) draft = next;
        const kept = new Set([...draft.cards, ...draft.chapters, ...draft.steps, ...draft.distractors].map((node) => node.id));
        for (const one of ids) expect(kept.has(one)).toBe(true);
      }
    }
  });
});

describe("blank nodes", () => {
  it("go with the statements that named them, however deep, unless another still names them", () => {
    const draft = courseDraft();
    const blank = (value: string) => ({ kind: "blank" as const, value });
    const withBlanks = {
      ...draft,
      triples: [
        ...draft.triples,
        { subject: "https://source.example/", predicate: "https://p.example/sum", object: blank("b0") },
        { subject: "_:b0", predicate: "https://p.example/inner", object: blank("b1") },
        { subject: "_:b1", predicate: "https://p.example/value", object: { kind: "iri" as const, value: "https://p.example/v" } },
        { subject: "https://source.example/", predicate: "https://p.example/also", object: blank("b2") },
        { subject: of("compilation"), predicate: "https://p.example/also", object: blank("b2") },
        { subject: "_:b2", predicate: "https://p.example/value", object: { kind: "iri" as const, value: "https://p.example/w" } },
      ],
    };
    const removed = made(withBlanks, { kind: "setSource", iri: "https://source.example/", source: null });
    expect(removed.triples.map((triple) => triple.subject)).toEqual([DRAFT, of("compilation"), of("compilation"), "_:b2"]);
  });
});

describe("how an earlier release was made", () => {
  const V1 = "https://pod.example/solid-memo/main/releases/solid/v1.ttl";
  /** The next version of the course fixture, whose compilation was associated with `#alice` and used `<https://source.example/>`. */
  function next(): ReleaseDraft {
    const release = rebaseDraft(courseDraft(), V1);
    const alice = `${V1}#alice`;
    return nextVersionDraft(
      { ...release, agents: [{ id: "alice", data: { name: "Alice" } }], triples: [...release.triples, link(`${V1}#compilation`, `${PROV}wasAssociatedWith`, alice)] },
      DRAFT,
    );
  }
  const compilation = (draft: ReleaseDraft) => draft.triples.filter((triple) => triple.subject === of("compilation"));

  it("is never rewritten: a check informs, and a source is used by, an activity of the version's own", () => {
    const draft = next();
    expect(draft.root.version).toBe("2");
    const checked = made(draft, { kind: "addCheckActivity", id: "review-1", activity: check });
    expect(compilation(checked)).toEqual(compilation(draft));
    expect(generatingActivities(checked)).toEqual([of("compilation"), of("revision-2")]);
    expect(checked.triples).toContainEqual(link(of("revision-2"), RDF_TYPE, `${PROV}Activity`));
    expect(checked.triples).toContainEqual(link(of("revision-2"), `${PROV}wasInformedBy`, of("review-1")));
    const sourced = made(checked, { kind: "setSource", iri: "https://wiki.example/", source: { statements: [], derivedFrom: true, used: true } });
    expect(compilation(sourced)).toEqual(compilation(draft));
    expect(generatingActivities(sourced)).toEqual([of("compilation"), of("revision-2")]);
    expect(sourced.triples).toContainEqual(link(of("revision-2"), `${PROV}used`, "https://wiki.example/"));
    const unused = made(sourced, { kind: "setSource", iri: "https://wiki.example/", source: { statements: [], derivedFrom: true, used: false } });
    expect(unused.triples).not.toContainEqual(link(of("revision-2"), `${PROV}used`, "https://wiki.example/"));
  });

  it("gives the version's own activity an id no subject has, nor the check", () => {
    const checked = made(next(), { kind: "addCheckActivity", id: "revision-2", activity: check });
    expect(generatingActivities(checked)).toEqual([of("compilation"), of("revision-2-2")]);
    const taken = { ...next(), published: { ...next().published, activities: [...next().published.activities, "revision-2-2"] } };
    expect(generatingActivities(made(taken, { kind: "addCheckActivity", id: "revision-2", activity: check }))).toEqual([of("compilation"), of("revision-2-3")]);
    const unnumbered = { ...next(), root: { ...next().root, version: undefined } };
    expect(generatingActivities(made(unnumbered, { kind: "addCheckActivity", id: "review-1", activity: check }))).toEqual([of("compilation"), of("revision-1")]);
  });

  it("keeps what an earlier activity used and was associated with, refusing to remove an agent it names", () => {
    const draft = next();
    const removed = made(draft, { kind: "setSource", iri: "https://source.example/", source: null });
    expect(compilation(removed)).toEqual(compilation(draft));
    // A source that making used may be neither derived from nor used by this version's.
    const kept = made(draft, { kind: "setSource", iri: "https://source.example/", source: { statements: [], derivedFrom: false, used: false } });
    expect(compilation(kept)).toEqual(compilation(draft));
    expect(kept.root.wasDerivedFrom).toEqual([]);
    expect(applyDraftChange(draft, { kind: "setAgent", id: "alice", agent: null })).toEqual({ refused: "carriedActivity", id: "compilation" });
    expect(made(draft, { kind: "setAgent", id: "alice", agent: { name: "Alice B." } }).agents[0]!.data.name).toBe("Alice B.");
  });
});

describe("unsupportedIdOf", () => {
  it("is the first id a draft cannot keep, of a subject or one a statement names", () => {
    expect(unsupportedIdOf(courseDraft())).toBeNull();
    const draft = courseDraft();
    for (const id of ["kapitel-ö", "_intro", "a/b", "a%20b"]) {
      expect(unsupportedIdOf({ ...draft, chapters: [...draft.chapters, { id, data: { course: DRAFT, reviewQuestion: [] } }] })).toBe(id);
    }
    expect(unsupportedIdOf({ ...draft, triples: [...draft.triples, link(DRAFT, `${PROV}wasGeneratedBy`, of("making ö"))] })).toBe("making ö");
  });
});

describe("mergedDraft", () => {
  const base = courseDraft();
  const mine = made(base, { kind: "addChapter", id: "ch-c", at: 1 }, { kind: "addCheckActivity", id: "review-1", activity: check }, { kind: "setMeta", meta: { versionNotes: "Mine." } });

  it("is what mine changed, on what theirs changed besides", () => {
    // Theirs: part of mine written (the new chapter, not the renumbered ones), and a card of their own retired.
    const theirs = {
      ...made(base, { kind: "retire", of: "card", id: "q-loose" }),
      chapters: [...base.chapters, mine.chapters.find((node) => node.id === "ch-c")!],
    };
    const merged = mergedDraft(base, mine, theirs)!;
    expect(positions(merged, "chapters")).toEqual({ "ch-a": 0, "ch-b": 2, "ch-c": 1 });
    expect(merged.cards.find((node) => node.id === "q-loose")!.data.deprecated).toBe(true);
    expect(merged.root.versionNotes).toBe("Mine.");
    expect(activitiesOf(merged)).toEqual(["compilation", "review-1"]);
    expect(merged.triples).toContainEqual(link(of("compilation"), `${PROV}wasInformedBy`, of("review-1")));
  });

  it("drops what mine deleted, and keeps what theirs has whatever order its fields are in", () => {
    const deleted = made(base, { kind: "delete", of: "card", id: "q-loose" });
    const theirs = { ...base, root: Object.fromEntries(Object.entries(base.root).reverse()) as ReleaseDraft["root"] };
    const merged = mergedDraft(base, deleted, theirs)!;
    expect(merged.cards.map((node) => node.id)).not.toContain("q-loose");
    expect(merged.root).toBe(theirs.root);
  });

  it("is null when theirs changed what mine did, otherwise", () => {
    const theirs = made(base, { kind: "setMeta", meta: { versionNotes: "Theirs." } });
    expect(mergedDraft(base, mine, theirs)).toBeNull();
  });
});
