import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { LibraryUpgradeContainer } from "./LibraryUpgradeContainer";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { LibraryUpgradePlan } from "@solid-memo/domain/libraryUpgrade";
import type { DeckUpgradeOutcome, DeckUpgradeProgress } from "@solid-memo/domain/deckUpgrade";
import { AppError } from "@solid-memo/domain/appError";
import { makeUseCasesFake } from "../test/useCasesFake";

const instance: Instance = {
  url: "https://pod.example/solid-memo/a/",
  name: "A",
};
const imported: Deck = {
  id: "deck-1",
  url: `${instance.url}catalog.ttl#deck-1`,
  title: { en: "Capitals" },
  cardsDocumentUrl: `${instance.url}decks/deck-1.ttl`,
  reviewsDocumentUrl: `${instance.url}reviews/deck-1.ttl`,
  direction: "front-to-back",
  createdAt: "2026-09-21T10:00:00.000Z",
  formatVersion: 1,
  authors: ["Anton Wiklund"],
  sourceUrl: "https://solid-memo.com/decks/capitals/v1.ttl",
};
const plan: LibraryUpgradePlan = {
  fromVersion: "1",
  toVersion: "2",
  releaseUrl: "https://solid-memo.com/decks/capitals/v2.ttl",
  notes: [],
  add: [{ id: "no", front: { "": "Norway" }, back: { "": "Oslo" }, formatVersion: 1 }],
  change: [],
  retire: [],
  restore: [],
  remove: [],
  kept: [],
  applied: [],
  gone: [],
  appliedAbout: [],
};

function renderContainer(useCases: UseCases, deck: Deck = imported) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const remove = vi.spyOn(queryClient, "removeQueries");
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <LibraryUpgradeContainer useCases={useCases} instance={instance} deck={deck} />
    </QueryClientProvider>,
  );
  return { container, invalidate, remove };
}

/** The deck page: the deck comes from the deck list, as Workspace gives it. */
function renderPage(useCases: UseCases) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const remove = vi.spyOn(queryClient, "removeQueries");
  function DeckPage() {
    const decks = useQuery({ queryKey: ["decks"], queryFn: () => useCases.listDecks(instance.url) });
    const deck = decks.data?.[0];
    return deck === undefined ? null : <LibraryUpgradeContainer useCases={useCases} instance={instance} deck={deck} />;
  }
  render(
    <QueryClientProvider client={queryClient}>
      <DeckPage />
    </QueryClientProvider>,
  );
  return { invalidate, remove };
}

describe("LibraryUpgradeContainer", () => {
  it("checks nothing for a home-made deck", async () => {
    const useCases = makeUseCasesFake();
    const { container } = renderContainer(useCases, {
      ...imported,
      sourceUrl: undefined,
    });
    expect(container).toBeEmptyDOMElement();
    expect(useCases.planLibraryUpgrade).not.toHaveBeenCalled();
  });

  it("gives the deck the languages its release adds, once, and refreshes the deck list when it did", async () => {
    const useCases = makeUseCasesFake({
      addReleaseLanguages: vi.fn(async (deck: Deck) => ({ ...deck, title: { en: "Capitals", sv: "Huvudstäder" } })),
    });
    const { invalidate } = renderContainer(useCases);
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["decks"] }));
    expect(useCases.addReleaseLanguages).toHaveBeenCalledOnce();
    expect(useCases.addReleaseLanguages).toHaveBeenCalledWith(imported);
  });

  it("shows nothing when the library has nothing newer, or cannot be read", async () => {
    const quiet = makeUseCasesFake();
    const { container } = renderContainer(quiet);
    await waitFor(() =>
      expect(quiet.planLibraryUpgrade).toHaveBeenCalledWith(imported),
    );
    expect(container.textContent).toBe("");

    const failing = makeUseCasesFake({
      planLibraryUpgrade: vi.fn(async () => {
        throw new Error("library offline");
      }),
    });
    const { container: other } = renderContainer(failing);
    await waitFor(() => expect(failing.planLibraryUpgrade).toHaveBeenCalled());
    expect(other.textContent).toBe("");
  });

  it("offers the upgrade, shows its steps while it runs, then refreshes what depends on the deck at once, and reports", async () => {
    let stored: Deck = imported;
    let report: ((progress: DeckUpgradeProgress) => void) | undefined;
    let finish: (() => void) | undefined;
    const useCases = makeUseCasesFake({
      listDecks: vi.fn(async () => [stored]),
      planLibraryUpgrade: vi.fn(async (deck: Deck) => (deck.sourceUrl === imported.sourceUrl ? plan : null)),
      applyLibraryUpgrade: vi.fn(
        (deck: Deck, applied: LibraryUpgradePlan, onProgress?: (progress: DeckUpgradeProgress) => void) =>
          new Promise<DeckUpgradeOutcome>((resolve) => {
            report = onProgress;
            finish = () => {
              stored = { ...deck, sourceUrl: applied.releaseUrl };
              resolve({ ok: true, deck: stored });
            };
          }),
      ),
    });
    const { invalidate, remove } = renderPage(useCases);

    const offer = await screen.findByRole("button", { name: "Update to release 2" });
    // Mounted, empty, before the update: screen readers hear it filled at the end.
    const announced = screen.getByRole("status");
    expect(announced.textContent).toBe("");
    fireEvent.click(offer);

    const region = await screen.findByRole("region", { name: "Updating the deck" });
    // The steps take the offer's place and its focus.
    expect(region).toHaveFocus();
    // The first step is said a frame after the region is up, so screen readers hear it.
    expect(within(region).getByRole("status").textContent).toBe("");
    await waitFor(() => expect(within(region).getByRole("status")).toHaveTextContent("Reading the deck and its cards…"));
    act(() => report!({ step: "reviews", done: 2, total: 4 }));
    expect(within(region).getByRole("status")).toHaveTextContent("Dropping the review states of removed cards…");
    expect(screen.getByRole("progressbar", { name: "Update progress" })).toHaveAttribute("value", "2");
    expect(screen.getByRole("progressbar", { name: "Update progress" })).toHaveAttribute("max", "5");
    const steps = within(region).getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual([
      "✓Reading the deck and its cards (done)",
      "✓Writing the updated cards (done)",
      "➜Dropping the review states of removed cards (in progress)",
      "·Moving the deck to the new release",
      "·Showing the updated deck",
    ]);
    expect(steps[2]).toHaveAttribute("aria-current", "step");
    act(() => report!({ step: "reviews", done: 2, total: 4, part: { done: 1, total: 2 } }));
    expect(within(region).getByRole("status")).toHaveTextContent(/^Dropping the review states of removed cards…$/);
    expect(within(region).getByText("1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Update progress" })).toHaveAttribute("value", "2.5");
    expect(region).toHaveTextContent("Should it be cut off, the deck can still be studied as it is, and updating it again finishes it.");
    expect(screen.queryByRole("button", { name: "Update to release 2" })).toBeNull();

    act(() => finish!());
    await waitFor(() => expect(announced).toHaveTextContent("Updated to release 2 from the library."));
    expect(useCases.applyLibraryUpgrade).toHaveBeenCalledWith(imported, plan, expect.any(Function));
    expect(remove).toHaveBeenCalledWith({ queryKey: ["studyQueue", imported.url] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["decks"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["cards", imported.cardsDocumentUrl] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["reviews", imported.reviewsDocumentUrl] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["migration", instance.url] });
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("offers nothing more once the deck is upgraded, though the offer is looked at again with the deck as it was", async () => {
    // The pod as the use cases see it: the deck moves to the next release, its documents where they were.
    let stored: Deck = imported;
    const useCases = makeUseCasesFake({
      listDecks: vi.fn(async () => [stored]),
      // As the real use case: a plan for a deck still on the old release, whatever deck object it is given.
      planLibraryUpgrade: vi.fn(async (deck: Deck) => (deck.sourceUrl === imported.sourceUrl ? plan : null)),
      applyLibraryUpgrade: vi.fn(async (deck: Deck, applied: LibraryUpgradePlan): Promise<DeckUpgradeOutcome> => {
        stored = { ...deck, sourceUrl: applied.releaseUrl };
        return { ok: true, deck: stored };
      }),
    });
    renderPage(useCases);

    fireEvent.click(await screen.findByRole("button", { name: "Update to release 2" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Updated to release 2 from the library."));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("button", { name: "Update to release 2" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Updated to release 2 from the library.");
  });

  it("says where a failed upgrade stopped and that the deck is as it was, and lets the user try again or close", async () => {
    const failed: DeckUpgradeOutcome = {
      ok: false,
      step: "cards",
      error: new AppError("changedElsewhere", { url: imported.cardsDocumentUrl }),
      changed: false,
    };
    const useCases = makeUseCasesFake({
      planLibraryUpgrade: vi.fn(async () => plan),
      applyLibraryUpgrade: vi.fn(async () => failed),
    });
    const { invalidate } = renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Update to release 2" }));

    const region = await screen.findByRole("region", { name: "Update failed" });
    // It takes the progress's focus, read out with why as its description.
    expect(region).toHaveFocus();
    expect(region).toHaveAccessibleDescription(/The update failed while writing the updated cards/);
    expect(region).toHaveTextContent(
      "The update failed while writing the updated cards: This was changed elsewhere, perhaps in another tab or app, since Solid Memo read it",
    );
    expect(region).toHaveTextContent(/Your deck was not changed\.Try again/);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["libraryUpgrade", imported.url] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["decks"] });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["cards", imported.cardsDocumentUrl] });

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(useCases.applyLibraryUpgrade).toHaveBeenCalledTimes(2));
    fireEvent.click(await screen.findByRole("button", { name: "Close" }));
    expect(await screen.findByRole("button", { name: "Update to release 2" })).toBeEnabled();
  });

  it("says when a failed upgrade changed the deck in part, reads it again, and finishes it when tried again with the deck as it now is", async () => {
    const finishing: LibraryUpgradePlan = { ...plan, add: [], applied: [{ ...plan.add[0]!, url: `${imported.cardsDocumentUrl}#no`, createdAt: "" }] };
    // The pod as the use cases see it: the cards written first, the entry, naming the release, last.
    let stored: Deck = imported;
    let current: LibraryUpgradePlan = plan;
    const applyLibraryUpgrade = vi
      .fn()
      .mockImplementationOnce(async (): Promise<DeckUpgradeOutcome> => {
        // The cards were written, the entry not: offered again, the cards are already as the release has them.
        current = finishing;
        return { ok: false, step: "entry", error: new TypeError("Failed to fetch"), changed: true };
      })
      .mockImplementation(async (deck: Deck, applied: LibraryUpgradePlan): Promise<DeckUpgradeOutcome> => {
        stored = { ...deck, sourceUrl: applied.releaseUrl };
        return { ok: true, deck: stored };
      });
    const useCases = makeUseCasesFake({
      listDecks: vi.fn(async () => [stored]),
      planLibraryUpgrade: vi.fn(async (deck: Deck) => (deck.sourceUrl === imported.sourceUrl ? current : null)),
      applyLibraryUpgrade,
    });
    const { invalidate, remove } = renderPage(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Update to release 2" }));
    const region = await screen.findByRole("region", { name: "Update failed" });
    expect(region).toHaveTextContent("The update failed while moving the deck to the new release:");
    expect(region).toHaveTextContent("Part of the new release may be in your deck already, which you can study as it is. Update it again to finish.");
    // What it wrote is read again, and so is the offer, with the deck as it now is.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["cards", imported.cardsDocumentUrl] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["reviews", imported.reviewsDocumentUrl] });
    expect(remove).toHaveBeenCalledWith({ queryKey: ["studyQueue", imported.url] });
    fireEvent.click(within(region).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(applyLibraryUpgrade).toHaveBeenCalledTimes(2));
    expect(applyLibraryUpgrade).toHaveBeenLastCalledWith(imported, finishing, expect.any(Function));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Updated to release 2 from the library."));
  });

  it("offers nothing more once the offer is gone, though the upgrade failed", async () => {
    let current: LibraryUpgradePlan | null = plan;
    const useCases = makeUseCasesFake({
      planLibraryUpgrade: vi.fn(async () => current),
      applyLibraryUpgrade: vi.fn(async (): Promise<DeckUpgradeOutcome> => {
        current = null;
        return { ok: false, step: "read", error: new AppError("deckChangedSinceOffer"), changed: false };
      }),
    });
    const { container } = renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Update to release 2" }));
    expect(await screen.findByRole("region", { name: "Update failed" })).toHaveTextContent("Your deck was not changed.");
    // Looked at again, the deck no longer calls for the offer: trying again shows nothing.
    await waitFor(() => expect(useCases.planLibraryUpgrade).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(container.textContent).toBe(""));
    expect(useCases.applyLibraryUpgrade).toHaveBeenCalledOnce();
  });

  it("keeps the offer up with the error when the update throws", async () => {
    renderContainer(
      makeUseCasesFake({
        planLibraryUpgrade: vi.fn(async () => plan),
        applyLibraryUpgrade: vi.fn(async () => {
          throw new Error("write refused");
        }),
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Update to release 2" }),
    );
    expect((await screen.findByText("write refused")).closest(".error")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Update to release 2" }),
    ).toBeEnabled();
  });
});
