import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import { planCardEdit, type CardEdit } from "@solid-memo/domain/cardBulk";
import { FindReplaceDialog } from "./FindReplaceDialog";
import { choose } from "../test/choose";
import { makeCard, makeDeck } from "../test/fixtures";

const deck = makeDeck("deck-1", { en: "Animals" });
const cat = {
  ...makeCard(deck, "cat"),
  front: { en: "cat" },
  back: { sv: "katt" },
  frontNote: { en: "cat" },
  distractors: [{ id: "d1", text: { sv: "hund" } }],
};
const kitten = { ...makeCard(deck, "kitten"), front: { en: "Kitten" }, back: { sv: "kattunge" } };
const lone = { ...makeCard(deck, "lone"), front: { en: "x" }, back: { sv: "cat" } };
const untagged = { ...makeCard(deck, "untagged"), front: { "": "cat" }, back: { sv: "x" } };
const cards = [cat, kitten, lone, untagged];

function renderDialog(overrides: Partial<Parameters<typeof FindReplaceDialog>[0]> = {}) {
  const plan = vi.fn((edit: CardEdit) => planCardEdit(cards, cards.map((card) => card.id), edit));
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <FindReplaceDialog
      cards={cards}
      languages={["en", "sv", "unstated"]}
      plan={plan}
      busy={false}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { plan, onConfirm, onCancel };
}

const type = (name: string, value: string) => fireEvent.input(screen.getByRole("textbox", { name }), { target: { value } });
const preview = () => screen.getByRole("region", { name: "Preview" });
const confirm = () => screen.getByRole("button", { name: /^Replace in/ });

describe("FindReplaceDialog", () => {
  it("previews nothing until there is text to find, and writes nothing until confirmed", () => {
    const { plan, onConfirm } = renderDialog();
    expect(screen.getByRole("form", { name: "Find and replace" })).toBeInTheDocument();
    expect(within(preview()).getByText("Type the text to find. Nothing changes until you confirm.")).toBeInTheDocument();
    expect(plan).not.toHaveBeenCalled();
    expect(confirm()).toHaveTextContent("Replace in 0 cards");
    expect(confirm()).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows each text a replace changes, before and after, and the cards it leaves as they are, and why", () => {
    renderDialog();
    type("Find", "cat");
    type("Replace with", "dog");
    const shown = preview();
    expect(within(shown).getByText("2 cards change:")).toBeInTheDocument();
    const first = within(shown).getByText("cat", { selector: "strong" }).closest("li")!;
    expect(within(first).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Front, English (en): cat → dog",
      "Note under the front, English (en): cat → dog",
    ]);
    expect(first.querySelector("del")).toHaveTextContent("cat");
    expect(first.querySelector("ins")).toHaveTextContent("dog");
    // "Kitten", "katt" and "kattunge" hold no "cat"; the untagged front cannot be saved so once changed.
    expect(within(shown).getByText("1 card is left as it is:")).toBeInTheDocument();
    expect(within(shown).getByText("cat: its text states no language; state it first")).toBeInTheDocument();
    expect(confirm()).toHaveTextContent("Replace in 2 cards");
  });

  it("confirms with the edit and the plan previewed", () => {
    const { plan, onConfirm } = renderDialog();
    type("Find", "Kitten");
    type("Replace with", "Puppy");
    fireEvent.click(screen.getByRole("checkbox", { name: "Match case" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Whole words only" }));
    choose("In the language", "en");
    fireEvent.click(confirm());
    const edit: CardEdit = {
      kind: "replaceText",
      find: "Kitten",
      replace: "Puppy",
      fields: ["front", "back", "note", "label", "distractor"],
      language: "en",
      caseSensitive: true,
      wholeWord: true,
    };
    expect(onConfirm).toHaveBeenCalledWith(edit, plan.mock.results.at(-1)!.value);
    expect(onConfirm.mock.calls[0]![1].save.map((card: { id: string }) => card.id)).toEqual(["kitten"]);
  });

  it("looks only in the fields ticked, and says when no card has the text", () => {
    renderDialog();
    type("Find", "cat");
    type("Replace with", "dog");
    for (const field of ["Front", "Back", "Notes", "Label", "Wrong options"]) {
      fireEvent.click(screen.getByRole("checkbox", { name: field }));
    }
    expect(within(preview()).getByText("None of the selected cards has this text.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Back" }));
    expect(within(preview()).getByText("1 card changes:")).toBeInTheDocument();
  });

  it("says a text the replace empties is removed, and offers text of no stated language", () => {
    renderDialog();
    type("Find", "cat");
    fireEvent.click(screen.getByRole("checkbox", { name: "Front" }));
    expect(within(preview()).getByText("(removed)")).toBeInTheDocument();
    choose("In the language", "unstated");
    expect(within(preview()).getByText("None of the selected cards has this text.")).toBeInTheDocument();
    expect(within(screen.getByRole("combobox", { name: "In the language" })).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Any language",
      "English (en)",
      "Swedish — svenska (sv)",
      "No language stated",
    ]);
  });

  it("names untagged text so, and cancels", () => {
    const { onCancel } = renderDialog({ cards: [untagged], plan: () => ({ ...planCardEdit([], [], { kind: "retire" }), save: [{ ...untagged, front: { "": "dog" } }] }) });
    type("Find", "cat");
    expect(within(preview()).getAllByRole("listitem").map((item) => item.textContent)).toContain("Front, No language stated: cat → dog");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("cannot be confirmed while an edit is being made", () => {
    renderDialog({ busy: true });
    type("Find", "cat");
    expect(confirm()).toBeDisabled();
  });
});
