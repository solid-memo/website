// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentProps } from "preact";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Deck } from "@solid-memo/domain/deck";
import { PauseDeckDialog } from "./PauseDeckDialog";
import { makeUseCasesFake } from "../test/useCasesFake";

const deck: Deck = {
  id: "deck-kanji",
  url: "https://pod.example/solid-memo/main/catalog.ttl#deck-kanji",
  title: { en: "Kanji" },
  cardsDocumentUrl: "https://pod.example/solid-memo/main/decks/deck-kanji.ttl",
  reviewsDocumentUrl: "https://pod.example/solid-memo/main/reviews/deck-kanji.ttl",
  createdAt: "2026-01-01T00:00:00.000Z",
  formatVersion: 6,
  direction: "front-to-back",
  authors: [],
};

function open(props: Partial<ComponentProps<typeof PauseDeckDialog>> = {}) {
  const useCases = makeUseCasesFake({
    getPauseOutlook: vi.fn(async (_instanceUrl, _deck, resumesOn) => ({
      day: resumesOn ?? "2026-03-31",
      recall: 0.85,
    })),
  });
  const onPause = vi.fn(async () => true);
  const onClose = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <PauseDeckDialog
        useCases={useCases}
        instanceUrl="https://pod.example/solid-memo/main/"
        deck={deck}
        today="2026-03-01"
        busy={false}
        error={null}
        onPause={onPause}
        onClose={onClose}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { useCases, onPause, onClose };
}

describe("PauseDeckDialog", () => {
  it("opens as a dialog named after the deck, until resumed, with what 30 days are likely to cost", async () => {
    const { useCases } = open();
    expect(screen.getByRole("dialog", { name: "Pause Kanji" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Until I resume it" })).toBeChecked();
    expect(screen.getByLabelText("Day to resume on")).toBeDisabled();
    expect(
      await screen.findByText(
        "After 30 days, you’ll likely still remember about 85% of this deck.",
      ),
    ).toBeInTheDocument();
    expect(useCases.getPauseOutlook).toHaveBeenCalledWith(
      "https://pod.example/solid-memo/main/",
      deck,
      null,
      expect.any(Date),
    );
  });

  it("pauses until a day after today, saying what that day is likely to cost, and refuses today", async () => {
    const { onPause, onClose } = open();
    fireEvent.click(screen.getByRole("radio", { name: "Until a day:" }));
    const day = screen.getByLabelText("Day to resume on");
    expect(day).toHaveValue("2026-03-02");
    expect(day).toHaveAttribute("min", "2026-03-02");
    fireEvent.input(day, { target: { value: "2026-03-15" } });
    expect(
      await screen.findByText(
        "If you resume on March 15, 2026, you’ll likely still remember about 85% of this deck.",
      ),
    ).toBeInTheDocument();
    fireEvent.input(day, { target: { value: "2026-03-01" } });
    expect(screen.getByText("Choose a day after today.")).toBeInTheDocument();
    expect(day).toHaveAttribute("aria-invalid", "true");
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(onPause).not.toHaveBeenCalled();
    // Back to until resumed, and to the day again.
    fireEvent.click(screen.getByRole("radio", { name: "Until I resume it" }));
    expect(day).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Until a day:" }));
    fireEvent.input(day, { target: { value: "2026-03-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(onPause).toHaveBeenCalledWith("2026-03-15");
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("pauses until resumed, and stays open with the error when the pause was not made", async () => {
    const onPause = vi.fn(async () => false);
    const { onClose } = open({ onPause, error: "The deck could not be paused." });
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(onPause).toHaveBeenCalledWith(null);
    await Promise.resolve();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("The deck could not be paused.");
  });

  it("does nothing while the pause is being written, and closes on Cancel", () => {
    const { onPause, onClose } = open({ busy: true });
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(onPause).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("says there is nothing to forget in a deck nothing of which was studied", async () => {
    open({
      useCases: makeUseCasesFake(),
    });
    expect(
      await screen.findByText(
        "Nothing in this deck has been studied yet, so there is nothing to forget.",
      ),
    ).toBeInTheDocument();
  });
});
