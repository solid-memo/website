import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import { applyDraftChanges, blankDraft, type ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { recentLanguages } from "@solid-memo/ui/remembered";
import type { DraftEditor } from "./draftEditor";
import { DraftOverviewScreen } from "./DraftOverviewScreen";
import { courseDraft, DRAFT_URL, draftLinks } from "../test/fixtures";

const idle = { saving: false, failure: null };

function renderScreen(draft: ReleaseDraft = courseDraft(), onEdit = vi.fn<DraftEditor["edit"]>(() => null)) {
  render(<DraftOverviewScreen draft={draft} readOnly={null} status={idle} links={draftLinks} onEdit={onEdit} />);
  return onEdit;
}

beforeEach(() => localStorage.clear());

/** States the language of the field's main text: English. */
function pickEnglish(field: HTMLElement) {
  const group = field.closest<HTMLElement>(".lang-text-field")!;
  fireEvent.click(within(group).getByRole("button", { name: "Language: not stated" }));
  fireEvent.click(within(group).getByRole("radio", { name: "English (en)" }));
}

describe("DraftOverviewScreen", () => {
  it("names the draft, its kind and version, and saves what it says of itself as it is typed", () => {
    const onEdit = renderScreen();
    expect(screen.getByRole("heading", { level: 2, name: "Solid" })).toBeInTheDocument();
    expect(screen.getByText("Course, version 1")).toBeInTheDocument();
    expect(screen.getByText("All changes saved.")).toHaveAttribute("role", "status");
    fireEvent.input(screen.getByRole("textbox", { name: "Title" }), { target: { value: "Solid basics" } });
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "setMeta", meta: { title: { en: "Solid basics" } } }], { debounce: true });
    const description = screen.getByRole("textbox", { name: "Description" });
    fireEvent.input(description, { target: { value: "About pods" } });
    pickEnglish(description);
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "setMeta", meta: { description: { en: "About pods" } } }], { debounce: true });
    fireEvent.input(description, { target: { value: "" } });
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "setMeta", meta: { description: null } }], { debounce: true });
  });

  it("shows the outline, counts the questions and says the release check is still to come", () => {
    const onEdit = renderScreen();
    expect(screen.getByRole("link", { name: "Step 1.1" })).toHaveAttribute("href", "#/step/ch-pods-1");
    expect(screen.getByText("2 cards in all.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All cards" })).toHaveAttribute("href", "#/draft-cards");
    expect(screen.getByText(/release check, which counts this draft's problems/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Actions for Pods" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    expect(onEdit).toHaveBeenCalledWith([{ kind: "moveChapter", id: "ch-pods", to: 1 }]);
    // A course's cards are added where they are asked.
    expect(screen.queryByRole("group", { name: "New card" })).toBeNull();
  });

  it("adds a chapter under the id made of its title, or another the user writes", () => {
    const onEdit = vi.fn<DraftEditor["edit"]>().mockReturnValueOnce({ refused: "idTaken", id: "ch-ideas" }).mockReturnValue(null);
    renderScreen(courseDraft(), onEdit);
    const form = screen.getByRole("group", { name: "New chapter" });
    const title = within(form).getByRole("textbox", { name: "Title of the chapter" });
    fireEvent.input(title, { target: { value: "Ideas" } });
    fireEvent.click(within(form).getByRole("button", { name: "Add the chapter" }));
    expect(onEdit).not.toHaveBeenCalled();
    expect(within(form).getByText("Choose the language of the title to save it.")).toBeInTheDocument();
    pickEnglish(title);
    expect(within(form).getByRole("textbox", { name: "Id" })).toHaveValue("ch-ideas");
    fireEvent.click(within(form).getByRole("button", { name: "Add the chapter" }));
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "addChapter", id: "ch-ideas", text: { title: { en: "Ideas" } } }]);
    // Refused (made elsewhere meanwhile, say): the form keeps it.
    expect(title).toHaveValue("Ideas");
    fireEvent.input(within(form).getByRole("textbox", { name: "Id" }), { target: { value: "ch-pods" } });
    fireEvent.click(within(form).getByRole("button", { name: "Add the chapter" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    fireEvent.input(within(form).getByRole("textbox", { name: "Id" }), { target: { value: "ch-thoughts" } });
    fireEvent.click(within(form).getByRole("button", { name: "Add the chapter" }));
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "addChapter", id: "ch-thoughts", text: { title: { en: "Ideas" } } }]);
    expect(title).toHaveValue("");
    expect(recentLanguages("deck")).toEqual(["en"]);
    // A chapter of no title yet, by number.
    expect(within(form).getByRole("textbox", { name: "Id" })).toHaveValue("ch-1");
    fireEvent.click(within(form).getByRole("button", { name: "Add the chapter" }));
    expect(onEdit).toHaveBeenLastCalledWith([{ kind: "addChapter", id: "ch-1" }]);
  });

  it("lists the chapters retired, to restore", () => {
    const draft = applyDraftChanges(courseDraft(), [
      { kind: "retire", of: "chapter", id: "ch-apps" },
      { kind: "addChapter", id: "ch-x" },
      { kind: "retire", of: "chapter", id: "ch-x" },
    ]) as ReleaseDraft;
    const onEdit = renderScreen(draft);
    const retired = screen.getByRole("heading", { name: "Retired chapters" }).nextElementSibling as HTMLElement;
    expect(within(retired).getByRole("link", { name: "Apps" })).toHaveAttribute("href", "#/chapter/ch-apps");
    expect(within(retired).getByRole("link", { name: "ch-x" })).toHaveAttribute("href", "#/chapter/ch-x");
    fireEvent.click(within(retired).getAllByRole("button", { name: "Restore" })[0]!);
    expect(onEdit).toHaveBeenCalledWith([{ kind: "restore", of: "chapter", id: "ch-apps" }]);
  });

  it("adds a deck's cards here, and names a draft of no title", () => {
    const blank = blankDraft({ url: DRAFT_URL, course: false, title: {}, now: "2026-10-10T10:00:00.000Z" });
    // One that states no version is a first.
    const { version: _version, ...root } = blank.root;
    const deck = { ...blank, root };
    const onEdit = renderScreen(deck);
    expect(screen.getByRole("heading", { level: 2, name: "Untitled draft" })).toBeInTheDocument();
    expect(screen.getByText("Deck, version 1")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Outline" })).toBeNull();
    const form = screen.getByRole("group", { name: "New card" });
    expect(within(form).getByRole("textbox", { name: "Id" })).toHaveValue("card-1");
    for (const side of ["Front", "Back"]) {
      const field = within(form).getByRole("textbox", { name: side });
      fireEvent.input(field, { target: { value: side } });
      pickEnglish(field);
    }
    fireEvent.click(within(form).getByRole("button", { name: "Add the question" }));
    expect(onEdit).toHaveBeenCalledWith([expect.objectContaining({ kind: "addCard", id: "card-1" })]);
  });
});
