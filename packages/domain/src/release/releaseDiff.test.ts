import { describe, expect, it } from "vitest";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { card, courseDraft, deckDraft, DRAFT } from "../testing/releaseDraft.ts";
import type { DraftNode, ReleaseDraft } from "./releaseDraft.ts";
import { releaseDiff, simulateLearnerUpgrade } from "./releaseDiff.ts";
import { rebaseDraft } from "./releaseToDraft.ts";
import { nextVersionDraft } from "./releaseVersion.ts";

const V1 = "https://pod.example/solid-memo/main/releases/solid/v1.ttl";

/** The course fixture as release 1, at V1. */
const v1 = (draft: ReleaseDraft = courseDraft()): ReleaseDraft => rebaseDraft(draft, V1);

/** The node of a list with its record changed by `change`; the others as they are. */
function edit<T>(nodes: readonly DraftNode<T>[], id: string, change: (data: T) => T): DraftNode<T>[] {
  return nodes.map((node) => (node.id === id ? { id, data: change(node.data) } : node));
}

describe("releaseDiff", () => {
  it("finds nothing in the next version as it starts: every subject as the release has it", () => {
    const release = v1();
    expect(releaseDiff(release, nextVersionDraft(release, DRAFT))).toEqual({
      about: [],
      subjects: [],
      unchanged: { chapter: 2, step: 2, card: 4, distractor: 2 },
    });
  });

  it("lists each subject added, changed, retired or restored, chapters first, then steps, cards and wrong options", () => {
    const release = { ...v1(), distractors: edit(v1().distractors, "q-a-1a-d1", (data) => ({ ...data, deprecated: true })) };
    const next = nextVersionDraft(release, DRAFT);
    const draft: ReleaseDraft = {
      ...next,
      chapters: edit(next.chapters, "ch-b", (data) => ({ ...data, title: { en: "Bee" } })),
      steps: edit(next.steps, "ch-a-2", (data) => ({ ...data, position: 5 })),
      cards: [
        ...edit(
          edit(
            edit(next.cards, "q-a-2a", (data) => ({ ...data, front: { en: "Two A" } })),
            "q-loose",
            (data) => ({ ...data, deprecated: true }),
          ),
          "q-a-r01",
          (data) => ({ ...data, deprecated: true, back: { en: "Other" } }),
        ),
        { id: "q-new", data: card("new") },
      ],
      distractors: edit(
        edit(next.distractors, "q-a-1a-d1", ({ deprecated: _retired, ...data }) => data),
        "q-a-1a-d2",
        (data) => ({ ...data, note: { en: "Because" } }),
      ),
    };
    const diff = releaseDiff(release, draft);
    expect(diff.subjects).toEqual([
      { kind: "chapter", id: "ch-b", status: "changed" },
      { kind: "step", id: "ch-a-2", status: "changed" },
      { kind: "card", id: "q-a-2a", status: "changed" },
      { kind: "card", id: "q-a-r01", status: "retired", alsoChanged: true },
      { kind: "card", id: "q-loose", status: "retired" },
      { kind: "card", id: "q-new", status: "added" },
      { kind: "distractor", id: "q-a-1a-d1", status: "restored" },
      { kind: "distractor", id: "q-a-1a-d2", status: "changed" },
    ]);
    expect(diff.unchanged).toEqual({ chapter: 1, step: 1, card: 1, distractor: 0 });
  });

  it("takes a card's wrong options, when it was made, the order of links and a plain text format stated or not as no change", () => {
    const release = v1();
    const next = nextVersionDraft(release, DRAFT);
    const draft: ReleaseDraft = {
      ...next,
      chapters: edit(next.chapters, "ch-a", (data) => ({ ...data, reviewQuestion: [...data.reviewQuestion].reverse() })),
      cards: edit(
        edit(next.cards, "q-a-1a", (data) => ({ ...data, distractor: [...data.distractor].reverse(), created: "2027-01-01T00:00:00Z" })),
        "q-a-2a",
        (data) => ({ ...data, textFormat: SM.plainText as typeof data.textFormat }),
      ),
    };
    expect(releaseDiff(release, draft).subjects).toEqual([]);
  });

  it("compares a card without text on a side, which no learner gets, by its record", () => {
    const blank = (front: string) => ({ ...courseDraft(), cards: [{ id: "q-a-1a", data: card(front, { front: {}, back: { en: "x" } }) }] });
    const release = v1(blank("a"));
    const next = nextVersionDraft(release, DRAFT);
    expect(releaseDiff(release, next).subjects).toEqual([]);
    const changed = { ...next, cards: edit(next.cards, "q-a-1a", (data) => ({ ...data, back: { en: "y" } })) };
    expect(releaseDiff(release, changed).subjects).toEqual([{ kind: "card", id: "q-a-1a", status: "changed" }]);
  });

  it("names what the release says of itself that the draft changes", () => {
    const release = v1();
    const next = nextVersionDraft(release, DRAFT);
    const draft: ReleaseDraft = {
      ...next,
      course: false,
      agents: [{ id: "anton", data: { name: "Anton" } }],
      root: {
        ...next.root,
        title: { en: "Solid 2" },
        description: { en: "About" },
        keyword: { en: ["pods"] },
        theme: ["http://publications.europa.eu/resource/authority/data-theme/EDUC"],
        studyDirection: SM.bidirectional as ReleaseDraft["root"]["studyDirection"],
        license: "https://creativecommons.org/publicdomain/zero/1.0/",
        creator: [`${DRAFT}#anton`],
        language: ["http://publications.europa.eu/resource/authority/language/ENG"],
        wasDerivedFrom: [],
      },
    };
    expect(releaseDiff(release, draft).about).toEqual([
      "course",
      "title",
      "description",
      "keywords",
      "themes",
      "direction",
      "license",
      "authors",
      "languages",
      "sources",
    ]);
  });
});

describe("simulateLearnerUpgrade", () => {
  it("offers a learner nothing to change for a next version as it starts, and loses nothing", () => {
    const release = v1();
    expect(simulateLearnerUpgrade(release, nextVersionDraft(release, DRAFT))).toEqual({ newer: true, plan: null, lost: { cards: [], chapters: [] } });
  });

  it("plans a course learner's upgrade, who reached every question: what changes, what retires, nothing added until reached", () => {
    const release = v1();
    const next = nextVersionDraft(release, DRAFT);
    const draft: ReleaseDraft = {
      ...next,
      root: { ...next.root, versionNotes: "Clearer." },
      cards: [
        ...edit(
          edit(next.cards, "q-a-2a", (data) => ({ ...data, front: { en: "Two A" } })),
          "q-loose",
          (data) => ({ ...data, deprecated: true }),
        ),
        { id: "q-new", data: card("new") },
      ],
    };
    const upgrade = simulateLearnerUpgrade(release, draft);
    expect(upgrade.newer).toBe(true);
    expect(upgrade.lost).toEqual({ cards: [], chapters: [] });
    expect(upgrade.plan).toMatchObject({ fromVersion: "1", toVersion: "2", releaseUrl: DRAFT, notes: [{ version: "2", notes: "Clearer." }], add: [] });
    expect(upgrade.plan!.change.map((one) => one.id)).toEqual(["q-a-2a"]);
    expect(upgrade.plan!.retire.map((one) => one.id)).toEqual(["q-loose"]);
    // The copy's card is the release's, its wrong options with it.
    expect(upgrade.plan!.retire[0]!.url).toBe("https://learner.solid-memo.invalid/solid-memo/decks/learner.ttl#q-loose");
  });

  it("adds a deck's new cards to a learner's copy, and follows its new title and licence", () => {
    const deck = { ...deckDraft(), root: { ...deckDraft().root, license: "https://creativecommons.org/licenses/by/4.0/", description: { en: "Words." } } };
    const release = v1(deck);
    const next = nextVersionDraft(release, DRAFT);
    const draft = { ...next, root: { ...next.root, title: { en: "More words" } }, cards: [...next.cards, { id: "w2", data: card("w2") }] };
    const plan = simulateLearnerUpgrade(release, draft).plan!;
    expect(plan.add.map((one) => one.id)).toEqual(["w2"]);
    expect(plan.title).toEqual({ en: "More words" });
  });

  it("says what progress a draft that drops cards and chapters would lose", () => {
    const release = v1();
    const next = nextVersionDraft(release, DRAFT);
    const draft = { ...next, cards: next.cards.filter((node) => node.id !== "q-loose"), chapters: next.chapters.filter((node) => node.id !== "ch-b") };
    const upgrade = simulateLearnerUpgrade(release, draft);
    expect(upgrade.lost).toEqual({ cards: ["q-loose"], chapters: ["ch-b"] });
    expect(upgrade.plan!.remove.map((one) => one.id)).toEqual(["q-loose"]);
  });

  it("offers nothing for a draft whose version does not come after the release's, and still says what it would lose", () => {
    const release = v1();
    const next = nextVersionDraft(release, DRAFT);
    const draft = { ...next, root: { ...next.root, version: "1" }, cards: next.cards.filter((node) => node.id !== "q-loose") };
    expect(simulateLearnerUpgrade(release, draft)).toEqual({ newer: false, plan: null, lost: { cards: ["q-loose"], chapters: [] } });
  });
});
