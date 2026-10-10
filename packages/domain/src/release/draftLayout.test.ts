import { describe, expect, it } from "vitest";
import { card, courseDraft, DRAFT, link, of } from "../testing/releaseDraft.ts";
import { applyDraftChanges, type ReleaseDraft } from "./releaseDraft.ts";
import {
  cardsDocumentOf,
  changedDocuments,
  chapterDocumentOf,
  draftContainerOf,
  draftDocuments,
  draftDocumentUrl,
  draftNameFor,
  draftPlaceOf,
  draftSummaryOf,
  draftsContainerOf,
  draftUrlOf,
  isDraftDocumentName,
  unreadableDraftSummary,
} from "./draftLayout.ts";

const INSTANCE = "https://pod.example/solid-memo/main/";
const CONTAINER = `${INSTANCE}drafts/solid/v2/`;

describe("where a draft is kept", () => {
  it("is a container of the instance's drafts, by name and version", () => {
    expect(draftsContainerOf(INSTANCE.slice(0, -1))).toBe(`${INSTANCE}drafts/`);
    expect(draftUrlOf(INSTANCE, "solid", 2)).toBe(DRAFT);
    expect(draftContainerOf(DRAFT)).toBe(CONTAINER);
    expect(draftPlaceOf(DRAFT)).toEqual({ instanceUrl: INSTANCE, name: "solid", version: 2 });
    expect(draftPlaceOf(`${INSTANCE}catalog.ttl`)).toBeNull();
    expect(draftPlaceOf(`${INSTANCE}drafts/solid/v0/release.ttl`)).toBeNull();
  });

  it("has a release document, a cards document and one per chapter", () => {
    expect(chapterDocumentOf(DRAFT, "ch-a")).toBe(`${CONTAINER}chapter-ch-a.ttl`);
    expect(cardsDocumentOf(DRAFT)).toBe(`${CONTAINER}cards.ttl`);
    expect(draftDocumentUrl(DRAFT, { kind: "release" })).toBe(DRAFT);
    expect(draftDocumentUrl(DRAFT, { kind: "cards" })).toBe(`${CONTAINER}cards.ttl`);
    expect(draftDocumentUrl(DRAFT, { kind: "chapter", chapter: "ch-a" })).toBe(`${CONTAINER}chapter-ch-a.ttl`);
    for (const name of ["release.ttl", "cards.ttl", "chapter-ch-a.ttl"]) expect(isDraftDocumentName(name)).toBe(true);
    for (const name of ["notes.ttl", "chapter-.ttl", "chapter-ch-a.ttl.acl", "release.ttl.meta"]) expect(isDraftDocumentName(name)).toBe(false);
  });
});

describe("draftDocuments", () => {
  it("keeps a chapter with its steps, the cards they ask and their distractors; the rest in the cards or release document", () => {
    const draft = courseDraft();
    const places = draftDocuments({
      ...draft,
      triples: [
        ...draft.triples,
        link(of("q-a-1a"), "https://other.example/says", "https://other.example/x"),
        { subject: of("compilation"), predicate: "https://other.example/checksum", object: { kind: "blank", value: "b0" } },
        { subject: "_:b0", predicate: "https://other.example/inner", object: { kind: "blank", value: "b1" } },
        { subject: "_:b1", predicate: "https://other.example/value", object: { kind: "iri", value: "https://other.example/v" } },
        { subject: of("q-loose"), predicate: "https://other.example/blank", object: { kind: "blank", value: "b2" } },
        { subject: "_:b2", predicate: "https://other.example/value", object: { kind: "iri", value: "https://other.example/v" } },
        { subject: "_:b3", predicate: "https://other.example/loop", object: { kind: "blank", value: "b4" } },
        { subject: "_:b4", predicate: "https://other.example/loop", object: { kind: "blank", value: "b3" } },
      ],
    });
    const a = { kind: "chapter", chapter: "ch-a" };
    expect(places.get(DRAFT)).toEqual({ kind: "release" });
    expect(places.get(of("ch-a"))).toEqual(a);
    expect(places.get(of("ch-b"))).toEqual({ kind: "chapter", chapter: "ch-b" });
    expect(places.get(of("ch-a-1"))).toEqual(a);
    for (const id of ["q-a-1a", "q-a-2a", "q-a-r01", "q-a-1a-d1", "q-a-1a-d2"]) expect(places.get(of(id))).toEqual(a);
    expect(places.get(of("q-loose"))).toEqual({ kind: "cards" });
    expect(places.get(of("compilation"))).toEqual({ kind: "release" });
    expect(places.get("https://source.example/")).toEqual({ kind: "release" });
    expect(places.get("_:b1")).toEqual({ kind: "release" });
    expect(places.get("_:b2")).toEqual({ kind: "cards" });
    expect(places.get("_:b3")).toEqual({ kind: "release" });
  });

  it("keeps a step of no chapter the draft has, and a distractor no card names, where they can be", () => {
    const draft = courseDraft();
    const places = draftDocuments({
      ...draft,
      steps: [...draft.steps, { id: "loose", data: { checkedBy: [of("q-loose")] } }, { id: "lost", data: { chapter: of("ch-gone"), checkedBy: [] } }],
      cards: [...draft.cards, { id: "q-x", data: card("x", { distractor: [of("q-a-1a-d1")] }) }],
      distractors: [...draft.distractors, { id: "orphan", data: { text: { en: "O" } } }],
    });
    expect(places.get(of("loose"))).toEqual({ kind: "release" });
    expect(places.get(of("lost"))).toEqual({ kind: "release" });
    expect(places.get(of("q-loose"))).toEqual({ kind: "release" });
    expect(places.get(of("orphan"))).toEqual({ kind: "cards" });
    // A distractor two cards name stays with the first.
    expect(places.get(of("q-a-1a-d1"))).toEqual({ kind: "chapter", chapter: "ch-a" });
  });
});

describe("draftNameFor", () => {
  it("is the title as letters, digits and dashes, unlike any taken", () => {
    expect(draftNameFor("Solid: Fundamentals", [])).toBe("solid-fundamentals");
    expect(draftNameFor("Huvudstäder", ["huvudstader", "huvudstader-2"])).toBe("huvudstader-3");
    expect(draftNameFor("¿?", [])).toBe("draft");
  });
});

describe("changedDocuments", () => {
  const draft = courseDraft();
  const after = (...changes: Parameters<typeof applyDraftChanges>[1]) => applyDraftChanges(draft, changes) as ReleaseDraft;

  it("names the one document a chapter's text is in", () => {
    expect(changedDocuments(draft, after({ kind: "editChapter", id: "ch-b", text: { title: { en: "Bee" } } }))).toEqual([chapterDocumentOf(DRAFT, "ch-b")]);
    expect(changedDocuments(draft, after({ kind: "setMeta", meta: { title: { en: "Solid!" } } }))).toEqual([DRAFT]);
    expect(changedDocuments(draft, after({ kind: "setAgent", id: "ada", agent: { name: "Ada" } }))).toEqual([DRAFT]);
    expect(changedDocuments(draft, draft)).toEqual([]);
    // The same text again, its fields in another order: no change.
    expect(changedDocuments(draft, after({ kind: "editChapter", id: "ch-a", text: { title: { en: "A" } } }))).toEqual([]);
  });

  it("names every document a move writes, one it empties or makes among them", () => {
    expect(changedDocuments(draft, after({ kind: "moveChapter", id: "ch-b", to: 0 })).sort()).toEqual(
      [chapterDocumentOf(DRAFT, "ch-a"), chapterDocumentOf(DRAFT, "ch-b")].sort(),
    );
    // The loose card goes from the cards document to the chapter's.
    expect(changedDocuments(draft, after({ kind: "addQuestion", card: "q-loose", place: { kind: "step", step: "ch-a-1" } })).sort()).toEqual(
      [cardsDocumentOf(DRAFT), chapterDocumentOf(DRAFT, "ch-a")].sort(),
    );
    expect(changedDocuments(draft, after({ kind: "addChapter", id: "ch-c" }))).toEqual([chapterDocumentOf(DRAFT, "ch-c")]);
  });
});

describe("a draft's summary", () => {
  it("says where it is and what its release document says of it", () => {
    const draft = courseDraft();
    expect(draftSummaryOf(draft)).toEqual({ url: DRAFT, instanceUrl: INSTANCE, name: "solid", version: 2, readable: true, title: { en: "Solid" }, course: true });
    const released = { ...draft, root: { ...draft.root, title: undefined, releasedAs: "https://pod.example/r.ttl" } };
    expect(draftSummaryOf(released)).toMatchObject({ title: {}, releasedAs: "https://pod.example/r.ttl" });
    expect(draftSummaryOf({ ...draft, url: `${INSTANCE}elsewhere.ttl` })).toBeNull();
  });

  it("says only where a draft is whose release document could not be read", () => {
    expect(unreadableDraftSummary(DRAFT, { instanceUrl: INSTANCE, name: "solid", version: 2 })).toEqual({
      url: DRAFT,
      instanceUrl: INSTANCE,
      name: "solid",
      version: 2,
      readable: false,
      title: {},
      course: false,
    });
  });
});
