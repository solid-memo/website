// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { AppError } from "@solid-memo/domain/appError";
import type { UnclaimedDeck } from "@solid-memo/domain/validation";
import { makeUseCasesFake } from "../test/useCasesFake";
import { UnclaimedDecksNotice } from "./UnclaimedDecksNotice";

const INSTANCE = "https://pod.example/";
const SPANISH: UnclaimedDeck = {
  deckUrl: `${INSTANCE}catalog.ttl#deck-1`,
  title: { en: "Spanish" },
  documents: [`${INSTANCE}spanish.ttl`, `${INSTANCE}spanish-reviews.ttl`],
};

function renderNotice(useCases: UseCases, decks: readonly UnclaimedDeck[] = [SPANISH]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const view = render(
    <QueryClientProvider client={queryClient}>
      <UnclaimedDecksNotice useCases={useCases} instanceUrl={INSTANCE} decks={decks} />
    </QueryClientProvider>,
  );
  return { ...view, invalidate };
}

describe("UnclaimedDecksNotice", () => {
  it("says nothing when every deck's documents are its own", () => {
    const { container } = renderNotice(makeUseCasesFake(), []);
    expect(container).toBeEmptyDOMElement();
  });

  it("names each deck with its documents' addresses, and claims them once the user confirms", async () => {
    const useCases = makeUseCasesFake();
    const { invalidate } = renderNotice(useCases);
    expect(screen.getByRole("region", { name: "Decks to confirm" })).toBeInTheDocument();
    expect(
      screen.getByText(/its documents don't say they belong to this deck/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: new RegExp(`^${INSTANCE}spanish.ttl`) }),
    ).toHaveAttribute("href", `${INSTANCE}spanish.ttl`);

    // Asked once more, and nothing written until then; the user may step back.
    fireEvent.click(screen.getByRole("button", { name: "These are this deck's documents" }));
    expect(screen.getByText(/will mark these documents as the documents of/)).toHaveTextContent(
      SPANISH.documents.join(", "),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Mark them as the deck's" })).toBeNull();
    expect(useCases.claimDeckDocuments).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "These are this deck's documents" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark them as the deck's" }));
    await waitFor(() =>
      expect(useCases.claimDeckDocuments).toHaveBeenCalledWith(INSTANCE, SPANISH.deckUrl),
    );
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["validation", INSTANCE] }),
    );
    expect(screen.queryByRole("button", { name: "Mark them as the deck's" })).toBeNull();
  });

  it("says why a claim failed, and shows it is under way meanwhile", async () => {
    let fail: (error: Error) => void = () => undefined;
    const useCases = makeUseCasesFake({
      claimDeckDocuments: vi.fn(
        () =>
          new Promise<void>((_, reject) => {
            fail = reject;
          }),
      ),
    });
    renderNotice(useCases);
    fireEvent.click(screen.getByRole("button", { name: "These are this deck's documents" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark them as the deck's" }));
    expect(await screen.findByRole("button", { name: "Marking…" })).toBeDisabled();
    fail(new AppError("changedElsewhere", { url: SPANISH.documents[0]! }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
