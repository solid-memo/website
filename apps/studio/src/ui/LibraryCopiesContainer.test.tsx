import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { DeckUpgradeOutcome } from "@solid-memo/domain/deckUpgrade";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { LibraryCopiesContainer } from "./LibraryCopiesContainer";
import { capitals, instanceA, makeCopy, makePlan } from "../test/fixtures";

const old = makeCopy("deck-1", { en: "Capitals" }, "1");
const other = makeCopy("deck-2", { en: "More capitals" }, "1");
const fresh = makeCopy("deck-3", { en: "Fresh capitals" }, "2");

function renderContainer(useCases: UseCases) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <LibraryCopiesContainer
        useCases={useCases}
        instance={instanceA}
        deckHref={(deck) => `#/about?deck=${deck.id}`}
        libraryHref="#/library"
      />
    </QueryClientProvider>,
  );
  return { invalidate };
}

describe("LibraryCopiesContainer", () => {
  it("lists the copies, plans the update of those the library has a newer release of, and updates them in turn", async () => {
    const useCases = makeUseCasesFake({
      listLibraryUpdates: vi.fn(async () => [
        { deck: old, series: capitals, version: "1", newer: true },
        { deck: other, series: capitals, version: "1", newer: true },
        { deck: fresh, series: capitals, version: "2", newer: false },
      ]),
      planLibraryUpgrade: vi.fn(async (deck) => makePlan(deck)),
    });
    let finish: (outcome: DeckUpgradeOutcome) => void = () => undefined;
    vi.mocked(useCases.applyLibraryUpgrade)
      .mockImplementationOnce(async (_deck, _plan, onProgress) => {
        onProgress!({ step: "read", done: 0, total: 6, part: { done: 1, total: 3 } });
        onProgress!({ step: "cards", done: 1, total: 4 });
        return new Promise((resolve) => (finish = resolve));
      })
      .mockImplementationOnce(async () => ({ ok: false, step: "entry", error: new Error("boom"), changed: true }));
    const { invalidate } = renderContainer(useCases);
    expect(screen.getByText("Looking up the library…")).toBeInTheDocument();
    const select = await screen.findByRole("checkbox", { name: "Select every deck that can be updated" });
    await waitFor(() => expect(screen.getAllByText(/updating adds 1 card/)).toHaveLength(2));
    expect(useCases.listLibraryUpdates).toHaveBeenCalledWith(instanceA.url);
    // Only the copies with a newer release are planned.
    expect(useCases.planLibraryUpgrade).toHaveBeenCalledTimes(2);
    expect(useCases.planLibraryUpgrade).not.toHaveBeenCalledWith(fresh, expect.anything());
    // With the series the copies' one read of the index found.
    expect(useCases.planLibraryUpgrade).toHaveBeenCalledWith(old, capitals);

    fireEvent.click(select);
    fireEvent.click(screen.getByRole("button", { name: "Update 2 decks" }));
    expect(await screen.findByText(/^Updating Capitals/)).toHaveTextContent("Updating Capitals (1 of 2)");
    expect(screen.getByRole("region", { name: "Updating the deck" })).toHaveTextContent("Writing the updated cards");
    finish({ ok: true, deck: old });
    await waitFor(() => expect(screen.getByText(/More capitals: the update failed/)).toBeInTheDocument());
    expect(screen.getByText(/Capitals: updated to release 2\./)).toBeInTheDocument();
    expect(useCases.applyLibraryUpgrade).toHaveBeenCalledWith(old, makePlan(old), expect.any(Function));
    expect(useCases.applyLibraryUpgrade).toHaveBeenCalledWith(other, makePlan(other), expect.any(Function));
    // The upgraded deck is read afresh, and the failed one planned again, read afresh too as it changed in part.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["cards", old.cardsDocumentUrl] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["libraryUpgrade", other.url] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["cards", other.cardsDocumentUrl] });
    expect(screen.queryByRole("region", { name: "Updating the deck" })).toBeNull();
  });

  it("reads the decks afresh when every update fails, so a deck changed elsewhere is planned as it now is", async () => {
    const useCases = makeUseCasesFake({
      listLibraryUpdates: vi.fn(async () => [
        { deck: old, series: capitals, version: "1", newer: true },
        { deck: other, series: capitals, version: "1", newer: true },
      ]),
      planLibraryUpgrade: vi.fn(async (deck) => makePlan(deck)),
      applyLibraryUpgrade: vi.fn(async () => ({ ok: false, step: "read", error: new Error("changed"), changed: false }) as const),
    });
    const { invalidate } = renderContainer(useCases);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Select every deck that can be updated" }));
    fireEvent.click(screen.getByRole("button", { name: "Update 2 decks" }));
    await waitFor(() => expect(screen.getAllByText(/the update failed/)).toHaveLength(2));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["decks"] }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["libraryUpgrade", old.url] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["libraryUpgrade", other.url] });
    // Neither changed: their documents are not read again.
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["cards", old.cardsDocumentUrl] });
  });

  it("takes an update that could not even start as that deck's failure, and goes on", async () => {
    const useCases = makeUseCasesFake({
      listLibraryUpdates: vi.fn(async () => [{ deck: old, series: capitals, version: "1", newer: true }]),
      planLibraryUpgrade: vi.fn(async (deck) => makePlan(deck)),
      applyLibraryUpgrade: vi.fn(async () => Promise.reject(new Error("fenced"))),
    });
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Select Capitals" }));
    fireEvent.click(screen.getByRole("button", { name: "Update 1 deck" }));
    const said = await screen.findByText(/Capitals: the update failed while reading the deck and its cards/);
    expect(within(said.closest("li")!).getByText(/Your deck was not changed\./)).toBeInTheDocument();
  });

  it("says what an update would change could not be read", async () => {
    renderContainer(
      makeUseCasesFake({
        listLibraryUpdates: vi.fn(async () => [{ deck: old, series: capitals, version: "1", newer: true }]),
        planLibraryUpgrade: vi.fn(async () => Promise.reject(new Error("offline"))),
      }),
    );
    expect(await screen.findByText("Release 2 is out, but what it would change could not be read.")).toBeInTheDocument();
  });

  it("says why the copies could not be listed", async () => {
    renderContainer(makeUseCasesFake({ listLibraryUpdates: vi.fn(async () => Promise.reject(new Error("offline"))) }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
