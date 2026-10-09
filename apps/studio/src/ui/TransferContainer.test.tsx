import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { AppError } from "@solid-memo/domain/appError";
import type { DeckFile } from "@solid-memo/domain/deckFile";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { TransferContainer } from "./TransferContainer";
import { instanceA, invalidReport, makeCard, makeDeck } from "../test/fixtures";

const kanji = makeDeck("deck-1", { en: "Kanji N5" });
const verbs = makeDeck("deck-2", { en: "Verbs" });
const capitals = makeDeck("deck-x", { en: "Capitals" });
const file: DeckFile = {
  name: "capitals.ttl",
  format: "turtle",
  content: { deck: capitals, cards: [makeCard(capitals, "a")], upgraded: [], dropped: [] },
};

function renderContainer(useCases: UseCases, chosen: readonly string[] = []) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const onChoose = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <TransferContainer useCases={useCases} instance={instanceA} chosen={chosen} onChoose={onChoose} cardsHref={(deck) => `#/cards?deck=${deck.id}`} healthHref="#/health" />
    </QueryClientProvider>,
  );
  return { invalidate, onChoose };
}

describe("TransferContainer", () => {
  it("exports the decks ticked one after another, saying which it is at", async () => {
    let finish: () => void = () => undefined;
    const useCases = makeUseCasesFake({ listDecks: vi.fn(async () => [kanji, verbs]) });
    vi.mocked(useCases.exportDeckFile)
      .mockImplementationOnce(() => new Promise((resolve) => (finish = () => resolve())))
      .mockResolvedValueOnce(undefined);
    const { onChoose } = renderContainer(useCases, [kanji.url, verbs.url]);
    expect(screen.getByText("Loading decks…")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Kanji N5" }));
    expect(onChoose).toHaveBeenCalledWith([verbs.url]);
    fireEvent.click(screen.getByRole("button", { name: "Export 2 decks" }));
    expect(await screen.findByText("Exporting Kanji N5 (1 of 2)…")).toBeInTheDocument();
    finish();
    expect(await screen.findByText(/^Handed 2 decks to your browser/)).toBeInTheDocument();
    expect(useCases.exportDeckFile).toHaveBeenNthCalledWith(1, kanji, { format: "turtle", withProgress: false });
    expect(useCases.exportDeckFile).toHaveBeenNthCalledWith(2, verbs, { format: "turtle", withProgress: false });
  });

  it("says why an export failed", async () => {
    const useCases = makeUseCasesFake({ listDecks: vi.fn(async () => [kanji]) });
    vi.mocked(useCases.exportDeckFile).mockRejectedValueOnce(new AppError("deckGone", { deck: kanji.title }));
    renderContainer(useCases, [kanji.url]);
    fireEvent.click(await screen.findByRole("button", { name: "Export 1 deck" }));
    expect(await screen.findByText("The deck “Kanji N5” no longer exists. Perhaps it was removed in another tab or app.")).toBeInTheDocument();
    expect(screen.queryByText(/Exporting/)).toBeNull();
  });

  it("opens a file, keeps it when none is picked next, imports it, and reads the decks afresh", async () => {
    const useCases = makeUseCasesFake({ listDecks: vi.fn(async () => [kanji]) });
    vi.mocked(useCases.openDeckFile).mockResolvedValueOnce(file).mockResolvedValueOnce(null);
    vi.mocked(useCases.importDeckFile).mockResolvedValueOnce(capitals);
    const { invalidate } = renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Choose a file…" }));
    expect(await screen.findByRole("heading", { name: "capitals.ttl: Capitals" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Choose a file…" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Choose a file…" }));
    await waitFor(() => expect(useCases.openDeckFile).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("heading", { name: "capitals.ttl: Capitals" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Import into Deck set A" }));
    expect(await screen.findByRole("link", { name: "Capitals" })).toHaveAttribute("href", "#/cards?deck=deck-x");
    expect(useCases.importDeckFile).toHaveBeenCalledWith(instanceA.url, file, { withProgress: false });
    expect(screen.queryByRole("heading", { name: "capitals.ttl: Capitals" })).toBeNull();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["decks", instanceA.url] });
  });

  it("says why a file could not be read, or imported", async () => {
    const useCases = makeUseCasesFake({ listDecks: vi.fn(async () => []) });
    vi.mocked(useCases.openDeckFile).mockRejectedValueOnce(new AppError("deckFileTooNew")).mockResolvedValueOnce(file);
    vi.mocked(useCases.importDeckFile).mockRejectedValueOnce(new AppError("alreadyExists"));
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Choose a file…" }));
    expect(await screen.findByText(/written by a newer version of Solid Memo/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Choose a file…" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Choose a file…" }));
    fireEvent.click(await screen.findByRole("button", { name: "Import into Deck set A" }));
    expect(await screen.findByText(/Something is already kept at that place/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "capitals.ttl: Capitals" })).toBeInTheDocument();
  });

  it("holds the import while the catalogue is set aside", async () => {
    const useCases = makeUseCasesFake({ listDecks: vi.fn(async () => [kanji]), checkInstance: vi.fn(async () => invalidReport([], { catalogue: true })) });
    vi.mocked(useCases.openDeckFile).mockResolvedValueOnce(file);
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Choose a file…" }));
    expect(await screen.findByText(/catalogue or one of its groups has invalid data/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Import into Deck set A" })).toBeDisabled();
  });

  it("says why the decks could not be read", async () => {
    const useCases = makeUseCasesFake({ listDecks: vi.fn(async () => Promise.reject(new Error("offline"))) });
    renderContainer(useCases);
    expect(await screen.findByText(/offline/)).toBeInTheDocument();
  });
});
