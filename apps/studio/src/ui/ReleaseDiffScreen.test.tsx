import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/preact";
import type { DraftDiff } from "@solid-memo/application/releaseDrafts";
import { AppError } from "@solid-memo/domain/appError";
import { continuityProblems } from "@solid-memo/domain/release/continuityRules";
import { draftReleaseModel } from "@solid-memo/domain/release/draftModel";
import type { ProblemTarget } from "@solid-memo/domain/release/releaseCheck";
import { releaseDiff, simulateLearnerUpgrade } from "@solid-memo/domain/release/releaseDiff";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { rebaseDraft } from "@solid-memo/domain/release/releaseToDraft";
import { nextVersionDraft } from "@solid-memo/domain/release/releaseVersion";
import { courseDraft, DRAFT_URL } from "../test/fixtures";
import { ReleaseDiffScreen, subjectTarget } from "./ReleaseDiffScreen";

const V1 = "https://pod.example/solid-memo/a/releases/solid/v1.ttl";
const links = { targetHref: (target: ProblemTarget) => `#/${Object.values(target).join("/")}` };

/** The course fixture as release 1, at V1. */
const v1 = (): ReleaseDraft => rebaseDraft(courseDraft(), V1);

/** The diff the use case makes of the draft against release 1. */
function diffOf(draft: ReleaseDraft, previous = v1()): DraftDiff {
  return {
    previous,
    diff: releaseDiff(previous, draft),
    problems: continuityProblems(draftReleaseModel(previous), draftReleaseModel(draft)),
    upgrade: simulateLearnerUpgrade(previous, draft),
  };
}

function renderScreen(draft: ReleaseDraft, diff: DraftDiff | null | undefined, error: unknown = null) {
  render(<ReleaseDiffScreen draft={draft} diff={diff} error={error} links={links} />);
}

describe("ReleaseDiffScreen", () => {
  it("says a first version has nothing to compare with", () => {
    renderScreen(courseDraft(), null);
    expect(screen.getByRole("heading", { level: 2, name: "Changes since the previous version" })).toBeInTheDocument();
    expect(screen.getByText(/follows no release/)).toBeInTheDocument();
  });

  it("shows that it is comparing, or why it could not", () => {
    renderScreen(courseDraft(), undefined);
    expect(screen.getByText("Comparing the draft…")).toBeInTheDocument();
  });

  it("says why it could not compare", () => {
    renderScreen(courseDraft(), undefined, new AppError("releaseUnreadable", { url: V1 }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("finds nothing changed in a next version as it starts, which no learner loses anything by", () => {
    const draft = nextVersionDraft(v1(), DRAFT_URL);
    renderScreen(draft, diffOf(draft));
    expect(screen.getByText(`Compared with version 1, ${V1}.`)).toBeInTheDocument();
    expect(screen.getByText(/drops nothing/)).toBeInTheDocument();
    expect(screen.getByText("Unchanged.")).toBeInTheDocument();
    expect(screen.getByText(/Every chapter, step, card and wrong option is as it was/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "Chapters" })).toBeInTheDocument();
    expect(screen.getAllByText("2 as they were.")).toHaveLength(3);
    expect(screen.getByText("1 as it was.")).toBeInTheDocument();
    expect(screen.getByText("A learner's copy of version 1 would not change.")).toBeInTheDocument();
    expect(screen.getByText(/has reached every question/)).toBeInTheDocument();
    expect(screen.getByText(/No learner loses progress/)).toBeInTheDocument();
  });

  it("lists the rules it breaks, what it changes, each subject linking to its editor, and what learners get and lose", () => {
    const next = nextVersionDraft(v1(), DRAFT_URL);
    const draft: ReleaseDraft = {
      ...next,
      root: { ...next.root, title: { en: "Solid 2" }, license: "https://creativecommons.org/publicdomain/zero/1.0/" },
      chapters: next.chapters.filter((node) => node.id !== "ch-apps"),
      cards: [
        ...next.cards.map((node) => (node.id === "q-pods-1a" ? { ...node, data: { ...node.data, front: { en: "Where is data?" } } } : node)),
        { id: "q-new", data: { front: { en: "New" }, back: { en: "Yes" }, distractor: [] } },
      ],
      distractors: next.distractors.map((node) => ({ ...node, data: { ...node.data, deprecated: true } })),
    };
    renderScreen(draft, diffOf(draft));
    const rules = screen.getByRole("region", { name: "Rules of the series" });
    expect(within(rules).getByText(/^Drops #ch-apps/)).toBeInTheDocument();
    expect(screen.getByText("Changed: title, licence.")).toBeInTheDocument();
    const content = screen.getByRole("region", { name: "Its content" });
    expect(within(content).getByRole("link", { name: "Where is data?" })).toHaveAttribute("href", "#/question/q-pods-1a");
    expect(within(content).getByText(/: changed$/, { selector: "li" })).toBeInTheDocument();
    expect(within(content).getByRole("link", { name: "New" }).closest("li")).toHaveTextContent("New: added");
    expect(within(content).getByRole("link", { name: "Wrong option q-pods-1a-d1" })).toHaveAttribute("href", "#/question/q-pods-1a/distractor:q-pods-1a-d1");
    expect(within(content).getByRole("link", { name: "Wrong option q-pods-1a-d1" }).closest("li")).toHaveTextContent(": retired");
    expect(screen.getByText(/^Updating a learner's copy of version 1 changes 1 card/)).toBeInTheDocument();
    const lost = screen.getByRole("list", { name: "Progress learners would lose" });
    expect(lost).toHaveTextContent("The completion of 1 chapter the draft drops: ch-apps.");
  });

  it("says a card's history lost, a retired subject changed too, and a version that is not newer", () => {
    const next = nextVersionDraft(v1(), DRAFT_URL);
    const draft: ReleaseDraft = {
      ...next,
      root: { ...next.root, version: "1" },
      cards: next.cards.filter((node) => node.id !== "q-pods-r01"),
      steps: next.steps.map((node) => (node.id === "ch-pods-2" ? { ...node, data: { ...node.data, deprecated: true, theory: { en: "Gone" } } } : node)),
    };
    renderScreen(draft, diffOf(draft));
    expect(screen.getByText(/does not come after version 1/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ch-pods-2" }).closest("li")).toHaveTextContent("retired, and changed");
    expect(screen.getByRole("list", { name: "Progress learners would lose" })).toHaveTextContent("The review history of 1 card the draft drops: q-pods-r01.");
  });

  it("says a plan that changes only retired cards updates only those, which no author studies", () => {
    const retire = (draft: ReleaseDraft, front?: string): ReleaseDraft => ({
      ...draft,
      cards: draft.cards.map((node) =>
        node.id === "q-pods-1a" ? { ...node, data: { ...node.data, deprecated: true, ...(front === undefined ? {} : { front: { en: front } }) } } : node,
      ),
    });
    const previous = retire(v1());
    const draft = retire(nextVersionDraft(previous, DRAFT_URL), "Where is data kept?");
    renderScreen(draft, diffOf(draft, previous));
    expect(screen.getByText("Updating a learner's copy of version 1 updates only retired cards.")).toBeInTheDocument();
  });

  it("takes a release or draft that states no version for version 1", () => {
    const previous = v1();
    const unversioned = { ...previous, root: { ...previous.root, version: undefined } };
    const next = nextVersionDraft(previous, DRAFT_URL);
    const draft = { ...next, root: { ...next.root, version: undefined } };
    renderScreen(draft, diffOf(draft, unversioned));
    expect(screen.getByText(`Compared with version 1, ${V1}.`)).toBeInTheDocument();
    expect(screen.getByText(/version 1 does not come after version 1/)).toBeInTheDocument();
  });
});

describe("subjectTarget", () => {
  it("opens a chapter, a step or a card in its editor, a wrong option in its card's, one of no card in the overview", () => {
    const draft = courseDraft();
    expect(subjectTarget(draft, { kind: "chapter", id: "ch-pods" })).toEqual({ screen: "chapter", chapter: "ch-pods" });
    expect(subjectTarget(draft, { kind: "step", id: "ch-pods-1" })).toEqual({ screen: "step", step: "ch-pods-1" });
    expect(subjectTarget(draft, { kind: "card", id: "q-pods-1a" })).toEqual({ screen: "question", card: "q-pods-1a" });
    expect(subjectTarget(draft, { kind: "distractor", id: "loose" })).toEqual({ screen: "draft" });
  });
});
