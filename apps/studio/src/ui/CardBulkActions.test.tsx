// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { planCardEdit, type CardEdit } from "@solid-memo/domain/cardBulk";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { CardBulkActions, type ReviewEdit } from "./CardBulkActions";
import type { CardTransfer } from "./TransferCardsDialog";
import { choose } from "../test/choose";
import { answer, dialog, pick } from "../test/dialogs";
import { makeCard, makeDeck } from "../test/fixtures";

const deck = makeDeck("deck-1", { en: "Kanji N5" });
const nouns = makeDeck("nouns", { en: "Nouns" });
const water = { ...makeCard(deck, "water"), front: { "": "水" }, back: { en: "water" } };
const fire = {
  ...makeCard(deck, "fire", true),
  front: { ja: "火" },
  back: { en: "fire" },
  textFormat: SM.markdown,
};
const cards = [water, fire];

function renderActions(
  onEdit = vi.fn(async (_edit: CardEdit, _plan: unknown) => true),
  busy = false,
  onReviewEdit = vi.fn(async (_edit: ReviewEdit) => true),
  onTransfer = vi.fn(async (_transfer: CardTransfer) => true),
) {
  const plan = vi.fn((edit: CardEdit) => planCardEdit(cards, ["water", "fire"], edit));
  render(
    <CardBulkActions
      cards={cards}
      languages={["en", "ja"]}
      busy={busy}
      plan={plan}
      onEdit={onEdit}
      today="2026-10-09"
      onReviewEdit={onReviewEdit}
      decks={[nouns]}
      onTransfer={onTransfer}
    />,
  );
  return { plan, onEdit, onReviewEdit, onTransfer };
}

const press = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const EDIT = "Edit the selected cards";
const SCHEDULE = "Schedule the selected cards";
const TRANSFER = "Move or copy the selected cards";

describe("CardBulkActions", () => {
  it("makes an edit with the plan made of the cards as they are", () => {
    const { plan, onEdit } = renderActions();
    press("Retire");
    expect(plan).toHaveBeenCalledWith({ kind: "retire" });
    expect(onEdit).toHaveBeenCalledWith({ kind: "retire" }, plan.mock.results[0]!.value);
    pick(EDIT, "Write in Markdown");
    expect(onEdit).toHaveBeenLastCalledWith(
      { kind: "setTextFormat", markdown: true },
      expect.anything(),
    );
    pick(EDIT, "Write as plain text");
    expect(onEdit).toHaveBeenLastCalledWith(
      { kind: "setTextFormat", markdown: false },
      expect.anything(),
    );
    press("Restore");
    expect(onEdit).toHaveBeenLastCalledWith({ kind: "restore" }, expect.anything());
  });

  it("makes no edit that would change none of the cards, and says so", () => {
    const onEdit = vi.fn(async () => true);
    const markdownOnly = vi.fn((edit: CardEdit) => planCardEdit([fire], ["fire"], edit));
    render(
      <CardBulkActions
        cards={[fire]}
        languages={[]}
        busy={false}
        plan={markdownOnly}
        onEdit={onEdit}
        today="2026-10-09"
        onReviewEdit={vi.fn()}
        decks={[]}
        onTransfer={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retire" }));
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "None of the selected cards would change.",
    );
    // Said in the form, while one is open.
    pick("Edit the selected cards", "State language");
    fireEvent.input(screen.getByRole("textbox", { name: "Language code" }), {
      target: { value: "ja" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onEdit).not.toHaveBeenCalled();
    expect(within(dialog("State language")).getByRole("status")).toHaveTextContent(
      "None of the selected cards would change.",
    );
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("deletes the cards once the user confirms", () => {
    const { onEdit } = renderActions();
    press("Delete");
    expect(dialog("Delete the selected cards")).toHaveTextContent(
      "Delete 2 cards and their progress? You can undo it until your next edit or until you leave this page.",
    );
    answer("Delete the selected cards", "Cancel");
    expect(onEdit).not.toHaveBeenCalled();
    press("Delete");
    answer("Delete the selected cards", "Delete");
    expect(onEdit).toHaveBeenCalledWith(
      { kind: "remove" },
      expect.objectContaining({ remove: ["water", "fire"] }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("states the language of the cards' untagged sides, refusing what is no language code", async () => {
    const { onEdit } = renderActions();
    pick(EDIT, "State language");
    expect(dialog("State language")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Only a side whose language is not stated yet changes. Its text stays as it is.",
      ),
    ).toBeInTheDocument();
    fireEvent.input(screen.getByRole("textbox", { name: "Language code" }), {
      target: { value: "Japanese" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByRole("alert")).toHaveTextContent("“Japanese” is not a language code.");
    expect(onEdit).not.toHaveBeenCalled();
    fireEvent.input(screen.getByRole("textbox", { name: "Language code" }), {
      target: { value: "ja" },
    });
    choose("Of", "front");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onEdit).toHaveBeenCalledWith(
      { kind: "stateLanguage", tag: "ja", side: "front" },
      expect.anything(),
    );
    // Made, the form closes.
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "Language code" })).not.toBeInTheDocument(),
    );
  });

  it("states the language of both sides unless one is chosen, and keeps the form open when the edit fails", async () => {
    const { onEdit } = renderActions(vi.fn(async () => false));
    pick(EDIT, "State language");
    fireEvent.input(screen.getByRole("textbox", { name: "Language code" }), {
      target: { value: "ja" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onEdit).toHaveBeenCalledWith({ kind: "stateLanguage", tag: "ja" }, expect.anything());
    await Promise.resolve();
    expect(screen.getByRole("textbox", { name: "Language code" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox", { name: "Language code" })).not.toBeInTheDocument();
    // Its dialog's Close leaves it too.
    pick(EDIT, "State language");
    fireEvent.click(within(dialog("State language")).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("opens the find and replace, which makes the edit it previewed, and closes again", async () => {
    const { onEdit } = renderActions();
    pick(EDIT, "Find and replace");
    fireEvent.input(screen.getByRole("textbox", { name: "Find" }), { target: { value: "water" } });
    fireEvent.input(screen.getByRole("textbox", { name: "Replace with" }), {
      target: { value: "aqua" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Replace in 1 card" }));
    expect(onEdit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "replaceText", find: "water", replace: "aqua" }),
      expect.anything(),
    );
    await waitFor(() =>
      expect(screen.queryByRole("form", { name: "Find and replace" })).not.toBeInTheDocument(),
    );
    pick(EDIT, "Find and replace");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("form", { name: "Find and replace" })).not.toBeInTheDocument();
  });

  it("forgets the cards' progress once the user confirms", () => {
    const { onReviewEdit } = renderActions();
    pick(SCHEDULE, "Forget progress");
    expect(dialog("Forget the selected cards' progress")).toHaveTextContent(
      "Forget the progress of 2 cards? They become new again. Their answers stay in the history.",
    );
    answer("Forget the selected cards' progress", "Cancel");
    expect(onReviewEdit).not.toHaveBeenCalled();
    pick(SCHEDULE, "Forget progress");
    answer("Forget the selected cards' progress", "Forget progress");
    expect(onReviewEdit).toHaveBeenCalledWith({ kind: "reset" });
  });

  it("sets the cards due on a day, today to start with, the form closing once it is done", async () => {
    const { onReviewEdit } = renderActions(
      undefined,
      false,
      vi.fn(async () => false),
    );
    pick(SCHEDULE, "Set due date");
    const day = screen.getByLabelText("Due on");
    expect(day).toHaveValue("2026-10-09");
    expect(screen.getByText("A card not studied yet stays new.")).toBeInTheDocument();
    fireEvent.input(day, { target: { value: "2026-10-20" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onReviewEdit).toHaveBeenCalledWith({ kind: "reschedule", due: "2026-10-20" });
    // Not made: the form stays.
    await Promise.resolve();
    expect(screen.getByLabelText("Due on")).toBeInTheDocument();
    onReviewEdit.mockResolvedValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(screen.queryByLabelText("Due on")).not.toBeInTheDocument());
    pick(SCHEDULE, "Set due date");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Due on")).not.toBeInTheDocument();
    pick(SCHEDULE, "Set due date");
    fireEvent.click(within(dialog("Set due date")).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("takes no due day while an edit is being made", () => {
    const props = {
      cards,
      languages: [],
      plan: vi.fn(),
      onEdit: vi.fn(),
      today: "2026-10-09",
      onReviewEdit: vi.fn(),
      decks: [],
      onTransfer: vi.fn(),
    };
    const { rerender } = render(<CardBulkActions {...props} busy={false} />);
    pick(SCHEDULE, "Set due date");
    rerender(<CardBulkActions {...props} busy={true} />);
    expect(screen.getByLabelText("Due on")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  it("groups its edits in menus, and makes nothing while an edit is being made", () => {
    const { onEdit } = renderActions(undefined, true);
    for (const name of ["Retire", "Restore", "Delete"])
      expect(screen.getByRole("button", { name })).toBeDisabled();
    for (const [menu, items] of [
      [EDIT, ["Write in Markdown", "Write as plain text", "State language", "Find and replace"]],
      [SCHEDULE, ["Set due date", "Forget progress"]],
      [TRANSFER, ["Move to deck…", "Copy to deck…"]],
    ] as const) {
      fireEvent.click(screen.getByRole("button", { name: menu }));
      expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(items);
      for (const item of screen.getAllByRole("menuitem"))
        expect(item).toHaveAttribute("aria-disabled", "true");
      // Held, an item does nothing, and the menu stays open until it is left.
      fireEvent.click(screen.getByRole("menuitem", { name: items[0] }));
      fireEvent.keyDown(screen.getByRole("menuitem", { name: items[0] }), { key: "Escape" });
      expect(screen.queryByRole("menu")).toBeNull();
    }
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("moves or copies the cards to another deck, the form closing once it is done", async () => {
    const onTransfer = vi.fn(async (_transfer: CardTransfer) => false);
    renderActions(undefined, false, undefined, onTransfer);
    pick(TRANSFER, "Move to deck…");
    expect(dialog("Move cards to another deck")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move 2 cards" }));
    expect(onTransfer).toHaveBeenCalledWith({ to: nouns, mode: "move", keepProgress: true });
    // Not made: the form stays.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Move 2 cards" })).toBeInTheDocument(),
    );

    onTransfer.mockResolvedValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    pick(TRANSFER, "Copy to deck…");
    fireEvent.click(screen.getByRole("button", { name: "Copy 2 cards" }));
    expect(onTransfer).toHaveBeenLastCalledWith({ to: nouns, mode: "copy", keepProgress: true });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Copy 2 cards" })).toBeNull());
    pick(TRANSFER, "Move to deck…");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Move 2 cards" })).toBeNull();
  });
});
