import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { TransferCardsDialog } from "./TransferCardsDialog";
import { choose } from "../test/choose";
import { makeDeck } from "../test/fixtures";

const verbs = makeDeck("verbs", { en: "Verbs" });
const nouns = makeDeck("nouns", { en: "Nouns" });

function renderDialog(overrides: Partial<Parameters<typeof TransferCardsDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <TransferCardsDialog mode="move" count={2} decks={[verbs, nouns]} busy={false} onConfirm={onConfirm} onCancel={onCancel} {...overrides} />,
  );
  return { onConfirm, onCancel };
}

describe("TransferCardsDialog", () => {
  it("moves the cards to the deck chosen, with their progress to start with, saying what becomes of their history", () => {
    const { onConfirm } = renderDialog();
    expect(screen.getByText(/Their past answers stay with this deck/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Keep their progress" })).toBeChecked();
    choose("To the deck", nouns.url);
    fireEvent.click(screen.getByRole("button", { name: "Move 2 cards" }));
    expect(onConfirm).toHaveBeenCalledWith({ to: nouns, mode: "move", keepProgress: true });
  });

  it("copies the cards without their progress when asked", () => {
    const { onConfirm } = renderDialog({ mode: "copy", count: 1 });
    expect(screen.getByText(/This deck keeps the cards/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Keep their progress" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy 1 card" }));
    expect(onConfirm).toHaveBeenCalledWith({ to: verbs, mode: "copy", keepProgress: false });
  });

  it("says when the instance has no other deck, and can be closed", () => {
    const { onCancel } = renderDialog({ decks: [] });
    expect(screen.getByText("This instance has no other deck to put the cards in.")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("waits while an edit is being made", () => {
    renderDialog({ busy: true });
    expect(screen.getByRole("button", { name: "Move 2 cards" })).toBeDisabled();
  });
});
