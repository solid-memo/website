import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { planCardEdit, type CardEdit } from "@solid-memo/domain/cardBulk";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { CardBulkActions, type ReviewEdit } from "./CardBulkActions";
import type { CardTransfer } from "./TransferCardsDialog";
import { choose } from "../test/choose";
import { makeCard, makeDeck } from "../test/fixtures";

const deck = makeDeck("deck-1", { en: "Kanji N5" });
const nouns = makeDeck("nouns", { en: "Nouns" });
const water = { ...makeCard(deck, "water"), front: { "": "水" }, back: { en: "water" } };
const fire = { ...makeCard(deck, "fire", true), front: { ja: "火" }, back: { en: "fire" }, textFormat: SM.markdown };
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

const bulk = () => screen.getByRole("group", { name: "Selected cards" });
const press = (name: string) => fireEvent.click(within(bulk()).getByRole("button", { name }));

afterEach(() => vi.unstubAllGlobals());

describe("CardBulkActions", () => {
  it("makes an edit with the plan made of the cards as they are", () => {
    const { plan, onEdit } = renderActions();
    press("Retire");
    expect(plan).toHaveBeenCalledWith({ kind: "retire" });
    expect(onEdit).toHaveBeenCalledWith({ kind: "retire" }, plan.mock.results[0]!.value);
    press("Write in Markdown");
    expect(onEdit).toHaveBeenLastCalledWith({ kind: "setTextFormat", markdown: true }, expect.anything());
    press("Write as plain text");
    expect(onEdit).toHaveBeenLastCalledWith({ kind: "setTextFormat", markdown: false }, expect.anything());
    press("Restore");
    expect(onEdit).toHaveBeenLastCalledWith({ kind: "restore" }, expect.anything());
  });

  it("makes no edit that would change none of the cards, and says so", () => {
    const { onEdit } = renderActions();
    const markdownOnly = vi.fn((edit: CardEdit) => planCardEdit([fire], ["fire"], edit));
    render(
      <CardBulkActions cards={[fire]} languages={[]} busy={false} plan={markdownOnly} onEdit={onEdit} today="2026-10-09" onReviewEdit={vi.fn()} decks={[]} onTransfer={vi.fn()} />,
    );
    fireEvent.click(within(screen.getAllByRole("group", { name: "Selected cards" })[1]!).getByRole("button", { name: "Retire" }));
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("None of the selected cards would change.");
  });

  it("deletes the cards once the user confirms", () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    const { onEdit } = renderActions();
    press("Delete");
    expect(confirm).toHaveBeenCalledWith("Delete 2 cards and their progress? You can undo it until your next edit or until you leave this page.");
    expect(onEdit).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    press("Delete");
    expect(onEdit).toHaveBeenCalledWith({ kind: "remove" }, expect.objectContaining({ remove: ["water", "fire"] }));
  });

  it("states the language of the cards' untagged sides, refusing what is no language code", async () => {
    const { onEdit } = renderActions();
    press("State language");
    expect(within(bulk()).getByRole("button", { name: "State language" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Only a side whose language is not stated yet changes. Its text stays as it is.")).toBeInTheDocument();
    fireEvent.input(screen.getByRole("textbox", { name: "Language code" }), { target: { value: "Japanese" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByRole("alert")).toHaveTextContent("“Japanese” is not a language code.");
    expect(onEdit).not.toHaveBeenCalled();
    fireEvent.input(screen.getByRole("textbox", { name: "Language code" }), { target: { value: "ja" } });
    choose("Of", "front");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onEdit).toHaveBeenCalledWith({ kind: "stateLanguage", tag: "ja", side: "front" }, expect.anything());
    // Made, the form closes.
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Language code" })).not.toBeInTheDocument());
  });

  it("states the language of both sides unless one is chosen, and keeps the form open when the edit fails", async () => {
    const { onEdit } = renderActions(vi.fn(async () => false));
    press("State language");
    fireEvent.input(screen.getByRole("textbox", { name: "Language code" }), { target: { value: "ja" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onEdit).toHaveBeenCalledWith({ kind: "stateLanguage", tag: "ja" }, expect.anything());
    await Promise.resolve();
    expect(screen.getByRole("textbox", { name: "Language code" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox", { name: "Language code" })).not.toBeInTheDocument();
  });

  it("opens the find and replace, which makes the edit it previewed, and closes again", () => {
    const { onEdit } = renderActions();
    press("Find and replace");
    fireEvent.input(screen.getByRole("textbox", { name: "Find" }), { target: { value: "water" } });
    fireEvent.input(screen.getByRole("textbox", { name: "Replace with" }), { target: { value: "aqua" } });
    fireEvent.click(screen.getByRole("button", { name: "Replace in 1 card" }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ kind: "replaceText", find: "water", replace: "aqua" }), expect.anything());
    press("Find and replace");
    expect(screen.queryByRole("form", { name: "Find and replace" })).not.toBeInTheDocument();
    press("Find and replace");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("form", { name: "Find and replace" })).not.toBeInTheDocument();
  });

  it("forgets the cards' progress once the user confirms, an open form closing only then", async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    const { onReviewEdit } = renderActions();
    press("Find and replace");
    press("Forget progress");
    expect(confirm).toHaveBeenCalledWith("Forget the progress of 2 cards? They become new again. Their answers stay in the history.");
    expect(onReviewEdit).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Find" })).toBeInTheDocument();
    confirm.mockReturnValue(true);
    press("Forget progress");
    expect(onReviewEdit).toHaveBeenCalledWith({ kind: "reset" });
    expect(screen.queryByRole("textbox", { name: "Find" })).not.toBeInTheDocument();
  });

  it("sets the cards due on a day, today to start with, the form closing once it is done", async () => {
    const { onReviewEdit } = renderActions(undefined, false, vi.fn(async () => false));
    press("Set due date");
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
    press("Set due date");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Due on")).not.toBeInTheDocument();
  });

  it("takes no due day while an edit is being made", () => {
    const props = { cards, languages: [], plan: vi.fn(), onEdit: vi.fn(), today: "2026-10-09", onReviewEdit: vi.fn(), decks: [], onTransfer: vi.fn() };
    const { rerender } = render(<CardBulkActions {...props} busy={false} />);
    press("Set due date");
    rerender(<CardBulkActions {...props} busy={true} />);
    expect(screen.getByLabelText("Due on")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  it("makes nothing while an edit is being made", () => {
    renderActions(undefined, true);
    for (const name of ["Retire", "Restore", "Write in Markdown", "Write as plain text", "State language", "Find and replace", "Set due date", "Forget progress", "Move to deck…", "Copy to deck…", "Delete"]) {
      expect(within(bulk()).getByRole("button", { name })).toBeDisabled();
    }
  });

  it("moves or copies the cards to another deck, the form closing once it is done", async () => {
    const onTransfer = vi.fn(async (_transfer: CardTransfer) => false);
    renderActions(undefined, false, undefined, onTransfer);
    press("Move to deck…");
    expect(within(bulk()).getByRole("button", { name: "Move to deck…" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Move 2 cards" }));
    expect(onTransfer).toHaveBeenCalledWith({ to: nouns, mode: "move", keepProgress: true });
    // Not made: the form stays.
    await waitFor(() => expect(screen.getByRole("button", { name: "Move 2 cards" })).toBeInTheDocument());

    onTransfer.mockResolvedValue(true);
    press("Copy to deck…");
    fireEvent.click(screen.getByRole("button", { name: "Copy 2 cards" }));
    expect(onTransfer).toHaveBeenLastCalledWith({ to: nouns, mode: "copy", keepProgress: true });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Copy 2 cards" })).toBeNull());
    press("Move to deck…");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Move 2 cards" })).toBeNull();
  });
});
