// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import { planCardEdit, type CardEdit, type CardEditPlan } from "@solid-memo/domain/cardBulk";
import { LIST_LIMIT } from "@solid-memo/ui/bounded";
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
  const plan = vi.fn((edit: CardEdit) =>
    planCardEdit(
      cards,
      cards.map((card) => card.id),
      edit,
    ),
  );
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

const type = (name: string, value: string) =>
  fireEvent.input(screen.getByRole("textbox", { name }), { target: { value } });
const preview = () => screen.getByRole("region", { name: "Preview" });
const confirm = () => screen.getByRole("button", { name: /^Replace in/ });

describe("FindReplaceDialog", () => {
  it("previews nothing until there is text to find, and writes nothing until confirmed", () => {
    const { plan, onConfirm } = renderDialog();
    expect(screen.getByRole("form", { name: "Find and replace" })).toBeInTheDocument();
    expect(
      within(preview()).getByText("Type the text to find. Nothing changes until you confirm."),
    ).toBeInTheDocument();
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
    expect(
      within(first)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Front, English (en): cat → dog", "Note under the front, English (en): cat → dog"]);
    expect(first.querySelector("del")).toHaveTextContent("cat");
    expect(first.querySelector("ins")).toHaveTextContent("dog");
    // "Kitten", "katt" and "kattunge" hold no "cat"; the untagged front cannot be saved so once changed.
    expect(within(shown).getByText("1 card is left as it is:")).toBeInTheDocument();
    expect(
      within(shown).getByText("cat: its text states no language; state it first"),
    ).toBeInTheDocument();
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
    expect(onConfirm.mock.calls[0]![1].save.map((card: { id: string }) => card.id)).toEqual([
      "kitten",
    ]);
  });

  it("looks only in the fields checked, and says when no card has the text", () => {
    renderDialog();
    type("Find", "cat");
    type("Replace with", "dog");
    for (const field of ["Front", "Back", "Notes", "Label", "Wrong options"]) {
      fireEvent.click(screen.getByRole("checkbox", { name: field }));
    }
    expect(
      within(preview()).getByText("None of the selected cards has this text."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Back" }));
    expect(within(preview()).getByText("1 card changes:")).toBeInTheDocument();
  });

  it("says a text the replace empties is removed, and offers text of no stated language", () => {
    renderDialog();
    type("Find", "cat");
    fireEvent.click(screen.getByRole("checkbox", { name: "Front" }));
    expect(within(preview()).getByText("(removed)")).toBeInTheDocument();
    choose("In the language", "unstated");
    expect(
      within(preview()).getByText("None of the selected cards has this text."),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("combobox", { name: "In the language" }))
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Any language", "English (en)", "Swedish — svenska (sv)", "No language stated"]);
  });

  it("names untagged text so, and cancels", () => {
    const { onCancel } = renderDialog({
      cards: [untagged],
      plan: () => ({
        ...planCardEdit([], [], { kind: "retire" }),
        save: [{ ...untagged, front: { "": "dog" } }],
      }),
    });
    type("Find", "cat");
    expect(
      within(preview())
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toContain("Front, No language stated: cat → dog");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("lists a distractor several cards share once, under the first of them", () => {
    const shared = { id: "shared", text: { sv: "cat?" } };
    const both = [
      { ...makeCard(deck, "one"), front: { en: "one" }, distractors: [shared] },
      { ...makeCard(deck, "two"), front: { en: "two" }, distractors: [shared] },
    ];
    renderDialog({
      cards: both,
      plan: (edit) =>
        planCardEdit(
          both,
          both.map((card) => card.id),
          edit,
        ),
    });
    type("Find", "cat");
    type("Replace with", "dog");
    const shown = preview();
    expect(within(shown).getByText("2 cards change:")).toBeInTheDocument();
    const listed = (name: string) =>
      within(within(shown).getByText(name, { selector: "strong" }).closest("li")!)
        .queryAllByRole("listitem")
        .map((item) => item.textContent);
    expect(listed("one")).toEqual(["Wrong option, Swedish — svenska (sv): cat? → dog?"]);
    expect(listed("two")).toEqual([]);
  });

  it("cannot be confirmed while an edit is being made", () => {
    renderDialog({ busy: true });
    type("Find", "cat");
    expect(confirm()).toBeDisabled();
  });

  it("bounds the preview of a card with many long wrong options, and confirms the whole plan", () => {
    const long = "the ".repeat(4_000);
    const hostile = {
      ...makeCard(deck, "hostile"),
      front: { en: "hello" },
      back: { en: "x" },
      distractors: Array.from({ length: 1_000 }, (_, at) => ({
        id: `d${at}`,
        text: { en: `${long}${at}` },
      })),
    };
    const { onConfirm } = renderDialog({
      cards: [hostile],
      plan: (edit) => planCardEdit([hostile], [hostile.id], edit),
    });
    type("Find", "t");
    const shown = preview();
    const items = within(shown).getAllByRole("listitem");
    // The card, and ten of its 1,000 changed wrong options.
    expect(items).toHaveLength(11);
    expect(shown.textContent!.length).toBeLessThan(5_000);
    const first = shown.querySelector("del")!.textContent!;
    expect(first.startsWith("the the")).toBe(true);
    expect(first.endsWith("…")).toBe(true);
    expect(Array.from(first)).toHaveLength(121);
    expect(within(shown).getByText("990 more changes in this card.")).toBeInTheDocument();
    fireEvent.click(confirm());
    const saved: CardEditPlan = onConfirm.mock.calls[0]![1];
    expect(saved.save).toHaveLength(1);
    expect(saved.save[0]!.distractors!.every((d) => !d.text.en!.includes("t"))).toBe(true);
  });

  it("shows each changed text from a little before where it first changes, never inside a character", () => {
    const text = `x😀${"y".repeat(29)}cat${"z".repeat(200)}`;
    const card = { ...makeCard(deck, "far"), front: { en: text }, back: { en: "x" } };
    renderDialog({ cards: [card], plan: (edit) => planCardEdit([card], [card.id], edit) });
    type("Find", "cat");
    type("Replace with", "dog");
    const shown = preview();
    expect(shown.querySelector("del")!.textContent).toMatch(/^…😀y+catz+…$/);
    expect(shown.querySelector("ins")!.textContent).toMatch(/^…😀y+dogz+…$/);
  });

  it("shows a text that starts with half a character from its start", () => {
    const card = {
      ...makeCard(deck, "half"),
      front: { en: `\udc00abc${"z".repeat(200)}` },
      back: { en: "x" },
    };
    renderDialog({ cards: [card], plan: (edit) => planCardEdit([card], [card.id], edit) });
    type("Find", "a");
    type("Replace with", "x");
    const shown = preview();
    expect(shown.querySelector("del")!.textContent).toMatch(/^\udc00abcz+…$/);
    expect(shown.querySelector("ins")!.textContent).toMatch(/^\udc00xbcz+…$/);
  });

  it("cuts long card names and language names in the preview", () => {
    const name = "cat ".repeat(5_000);
    const tag = `en-x-${Array.from({ length: 500 }, () => "abcdefgh").join("-")}`;
    const long = { ...makeCard(deck, "long"), front: { en: name }, back: { [tag]: "cat" } };
    const untold = { ...makeCard(deck, "untold"), front: { "": name }, back: { en: "x" } };
    const both = [long, untold];
    renderDialog({
      cards: both,
      plan: (edit) =>
        planCardEdit(
          both,
          both.map((card) => card.id),
          edit,
        ),
    });
    type("Find", "cat");
    type("Replace with", "dog");
    const shown = preview();
    const strong = shown.querySelector("strong")!.textContent!;
    expect(Array.from(strong)).toHaveLength(81);
    expect(strong.endsWith("…")).toBe(true);
    for (const item of within(shown).getAllByRole("listitem")) {
      expect(item.textContent!.length).toBeLessThan(1_000);
    }
    expect(within(shown).getByText(/its text states no language/)).toBeInTheDocument();
    expect(shown.textContent!.length).toBeLessThan(2_000);
  });

  it("shows a text a plan adds as an empty before", () => {
    const card = { ...makeCard(deck, "added"), front: { en: "cat" }, back: { en: "x" } };
    renderDialog({
      cards: [card],
      plan: () => ({
        ...planCardEdit([], [], { kind: "retire" }),
        save: [{ ...card, front: { en: "cat", sv: "katt" } }],
      }),
    });
    type("Find", "cat");
    expect(
      within(preview())
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toContain("Front, Swedish — svenska (sv):  → katt");
  });

  it("lists the first changed cards and cards left as they are, and how many more, and confirms them all", () => {
    const many = Array.from({ length: LIST_LIMIT + 3 }, (_, at) => ({
      ...makeCard(deck, `c${at}`),
      front: { en: `cat ${at}` },
      back: { en: "x" },
    }));
    const untold = Array.from({ length: LIST_LIMIT + 2 }, (_, at) => ({
      ...makeCard(deck, `u${at}`),
      front: { "": `cat ${at}` },
      back: { en: "x" },
    }));
    const all = [...many, ...untold];
    const { onConfirm } = renderDialog({
      cards: all,
      plan: (edit) =>
        planCardEdit(
          all,
          all.map((card) => card.id),
          edit,
        ),
    });
    type("Find", "cat");
    type("Replace with", "dog");
    const shown = preview();
    expect(within(shown).getByText(`${LIST_LIMIT + 3} cards change:`)).toBeInTheDocument();
    expect(within(shown).getAllByText(/^cat \d+$/, { selector: "strong" })).toHaveLength(
      LIST_LIMIT,
    );
    expect(within(shown).getByText("3 more cards change.")).toBeInTheDocument();
    expect(
      within(shown).getByText(`${LIST_LIMIT + 2} cards are left as they are:`),
    ).toBeInTheDocument();
    expect(within(shown).getAllByText(/its text states no language/)).toHaveLength(LIST_LIMIT);
    expect(within(shown).getByText("2 more cards are left as they are.")).toBeInTheDocument();
    fireEvent.click(confirm());
    expect(onConfirm.mock.calls[0]![1].save).toHaveLength(LIST_LIMIT + 3);
  });
});
