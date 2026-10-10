import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import { applyDraftChanges, blankDraft, type DraftChange, type ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import type { DraftEditor } from "./draftEditor";
import { DraftCardsScreen, type DraftCardsView } from "./DraftCardsScreen";
import { choose } from "../test/choose";
import { courseDraft, DRAFT_URL, draftLinks } from "../test/fixtures";

function renderScreen(draft: ReleaseDraft = courseDraft(), view: DraftCardsView = {}) {
  const onView = vi.fn();
  const onEdit = vi.fn<DraftEditor["edit"]>(() => null);
  render(<DraftCardsScreen draft={draft} view={view} readOnly={null} status={{ saving: false, failure: null }} links={draftLinks} onView={onView} onEdit={onEdit} />);
  return { onView, onEdit };
}

const table = () => screen.getByRole("table", { name: "The draft's cards" });
const fronts = () => within(table()).getAllByRole("rowheader").map((cell) => cell.textContent);

describe("DraftCardsScreen", () => {
  it("lists a course's cards by id: where each is asked, and its wrong options", () => {
    const draft = applyDraftChanges(courseDraft(), [
      { kind: "addCard", id: "q-loose", card: { front: { en: "Loose" }, back: { en: "Yes" } } },
      { kind: "addCard", id: "q-old", card: { front: { en: "Old" }, back: { en: "Yes" } } },
      { kind: "retire", of: "card", id: "q-old" },
      { kind: "retire", of: "step", id: "ch-pods-2" },
    ]) as ReleaseDraft;
    const twice: ReleaseDraft = {
      ...draft,
      chapters: draft.chapters.map((node) => (node.id === "ch-apps" ? { ...node, data: { ...node.data, reviewQuestion: [`${DRAFT_URL}#q-loose`] } } : node)),
      steps: [
        ...draft.steps.map((node) => (node.id === "ch-pods-2" ? { ...node, data: { ...node.data, checkedBy: [`${DRAFT_URL}#q-old`] } } : node)),
        { id: "ch-gone-1", data: { chapter: `${DRAFT_URL}#ch-gone`, checkedBy: [`${DRAFT_URL}#q-loose`] } },
      ],
    };
    renderScreen(twice);
    expect(screen.getByRole("heading", { level: 2, name: "Questions of Solid" })).toBeInTheDocument();
    expect(screen.getByText("4 cards")).toBeInTheDocument();
    expect(fronts()).toEqual(["Loose", "Old (retired)", "What holds data?", "Who owns a pod?"]);
    const cells = (front: string) => within(within(table()).getByRole("rowheader", { name: new RegExp(front) }).closest("tr")!).getAllByRole("cell").map((cell) => cell.textContent);
    expect(cells("What holds data")).toEqual(["A pod", "Pods, step 1", "1", "q-pods-1a"]);
    expect(cells("Who owns")).toEqual(["Its user", "Pods, final review", "0", "q-pods-r01"]);
    expect(cells("Loose")).toEqual(["Yes", "Asked from 2 places", "0", "q-loose"]);
    // A step retired is named by its id.
    expect(cells("Old")).toEqual(["Yes", "ch-pods-2", "0", "q-old"]);
    expect(within(table()).getByRole("link", { name: "What holds data?" })).toHaveAttribute("href", "#/question/q-pods-1a");
  });

  it("names a place in a chapter of no title, or a step of a chapter gone, by its id", () => {
    const draft = courseDraft();
    renderScreen({
      ...draft,
      root: { ...draft.root, title: undefined },
      chapters: draft.chapters.map((node) => ({ ...node, data: { ...node.data, title: undefined } })),
      steps: [...draft.steps, { id: "lost-1", data: { chapter: `${DRAFT_URL}#ch-lost`, checkedBy: [`${DRAFT_URL}#q-lost`] } }],
      cards: [
        ...draft.cards,
        { id: "q-pic", data: { frontImage: "https://x.example/a.png", backImage: "https://x.example/b.png", distractor: [] } },
        { id: "q-lost", data: { front: { en: "Lost" }, back: { en: "Yes" }, distractor: [] } },
      ],
    });
    expect(screen.getByRole("heading", { level: 2, name: "Questions of Untitled draft" })).toBeInTheDocument();
    expect(screen.getByText("lost-1")).toBeInTheDocument();
    expect(screen.getByText("ch-pods, step 1")).toBeInTheDocument();
    expect(screen.getByText("ch-pods, final review")).toBeInTheDocument();
    expect(screen.getByText("Nowhere yet")).toBeInTheDocument();
    // A card of pictures, by its id.
    expect(within(table()).getByRole("link", { name: "q-pic" })).toBeInTheDocument();
  });

  it("filters them by what the URL says, back to the first page on a change", () => {
    const { onView } = renderScreen(courseDraft(), { filter: "fewDistractors", language: "fi", page: 2 });
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "Show" }).value).toBe("fewDistractors");
    // The URL's language is offered though no card has it.
    expect([...screen.getByRole<HTMLSelectElement>("combobox", { name: "Language" }).options].map((option) => option.text)).toEqual(["Any language", "en", "fi"]);
    expect(screen.getByText("0 cards")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    choose("Show", "unasked");
    expect(onView).toHaveBeenLastCalledWith({ filter: "unasked", language: "fi" });
    choose("Show", "");
    expect(onView).toHaveBeenLastCalledWith({ language: "fi" });
    choose("Language", "en");
    expect(onView).toHaveBeenLastCalledWith({ filter: "fewDistractors", language: "en" });
    choose("Language", "");
    expect(onView).toHaveBeenLastCalledWith({ filter: "fewDistractors" });
  });

  it("pages a deck's cards, offers only the filters a deck has, and adds one", () => {
    const changes: DraftChange[] = Array.from({ length: 51 }, (_, n) => ({
      kind: "addCard" as const,
      id: `card-${String(n + 1).padStart(2, "0")}`,
      card: { front: { en: `Front ${n + 1}` }, back: { "": `${n + 1}` } },
    }));
    const deck = applyDraftChanges(blankDraft({ url: DRAFT_URL, course: false, title: { en: "Words" }, now: "2026-10-10T10:00:00.000Z" }), changes) as ReleaseDraft;
    const { onView, onEdit } = renderScreen(deck, { page: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onView).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 2, name: "Cards of Words" })).toBeInTheDocument();
    expect([...screen.getByRole<HTMLSelectElement>("combobox", { name: "Show" }).options].map((option) => option.value)).toEqual(["", "fewDistractors", "retired"]);
    expect([...screen.getByRole<HTMLSelectElement>("combobox", { name: "Language" }).options].map((option) => option.text)).toEqual([
      "Any language",
      "en",
      "No language stated",
    ]);
    expect(within(table()).queryByRole("columnheader", { name: "Asked" })).toBeNull();
    expect(fronts()).toEqual(["Front 51"]);
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(onView).toHaveBeenCalledWith({});
    onView.mockClear();
    const form = screen.getByRole("group", { name: "New card" });
    expect(within(form).getByRole("textbox", { name: "Id" })).toHaveValue("card-52");
    for (const side of ["Front", "Back"]) {
      const field = within(form).getByRole("textbox", { name: side });
      fireEvent.input(field, { target: { value: side } });
      const group = field.closest<HTMLElement>(".lang-text-field")!;
      fireEvent.click(within(group).getByRole("button", { name: "Language: not stated" }));
      fireEvent.click(within(group).getByRole("radio", { name: "English (en)" }));
    }
    fireEvent.click(within(form).getByRole("button", { name: "Add the question" }));
    expect(onEdit).toHaveBeenCalledWith([expect.objectContaining({ kind: "addCard", id: "card-52" })]);
  });

  it("goes to the next page", () => {
    const changes: DraftChange[] = Array.from({ length: 51 }, (_, n) => ({ kind: "addCard" as const, id: `c${n}`, card: { front: { en: "F" }, back: { en: "B" } } }));
    const { onView } = renderScreen(applyDraftChanges(courseDraft(), changes) as ReleaseDraft);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onView).toHaveBeenCalledWith({ page: 2 });
  });
});
