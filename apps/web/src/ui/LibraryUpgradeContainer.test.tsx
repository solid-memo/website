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
import type { BackupRestore } from "@solid-memo/domain/backup";
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

  it("tidies away what an upgrade cut off half-way left, once", async () => {
    const useCases = makeUseCasesFake();
    renderContainer(useCases);
    await waitFor(() => expect(useCases.tidyInterruptedDeckUpgrade).toHaveBeenCalledWith(imported));
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
              resolve({ ok: true, deck: stored, tidied: true });
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
    act(() => report!({ step: "validate", done: 6, total: 9 }));
    expect(within(region).getByRole("status")).toHaveTextContent("Checking what was written…");
    expect(screen.getByRole("progressbar", { name: "Update progress" })).toHaveAttribute("value", "6");
    expect(screen.getByRole("progressbar", { name: "Update progress" })).toHaveAttribute("max", "10");
    const steps = within(region).getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual([
      "✓Reading the deck and its cards (done)",
      "✓Keeping an exact copy of the deck (done)",
      "✓Writing the updated copy (done)",
      "✓Checking the updated copy (done)",
      "✓Making sure nothing changed meanwhile (done)",
      "✓Writing the updated cards (done)",
      "➜Checking what was written (in progress)",
      "·Moving the deck to the new release",
      "·Removing the copies",
      "·Showing the updated deck",
    ]);
    expect(steps[6]).toHaveAttribute("aria-current", "step");
    act(() => report!({ step: "validate", done: 6, total: 9, part: { done: 1, total: 2 } }));
    expect(within(region).getByRole("status")).toHaveTextContent(/^Checking what was written…$/);
    expect(within(region).getByText("1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Update progress" })).toHaveAttribute("value", "6.5");
    // Failed at a step, it says it puts the deck back.
    act(() => report!({ step: "validate", done: 6, total: 9, part: { done: 0, total: 2 }, undoing: true }));
    expect(within(region).getByRole("status")).toHaveTextContent(/^Putting the deck back as it was…$/);
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
        return { ok: true, deck: stored, tidied: true };
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
      step: "backup",
      error: new AppError("deckChangedDuringUpgrade", { url: imported.cardsDocumentUrl }),
      asItWas: true,
      undo: null,
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
    expect(region).toHaveAccessibleDescription(/The update failed while keeping an exact copy of the deck/);
    expect(region).toHaveTextContent(
      "The update failed while keeping an exact copy of the deck: The deck changed while it was being updated, perhaps in another tab or app. Try again.",
    );
    expect(region).toHaveTextContent(/Your deck is exactly as it was\.Try again/);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["libraryUpgrade", imported.url] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["decks"] });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["cards", imported.cardsDocumentUrl] });

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(useCases.applyLibraryUpgrade).toHaveBeenCalledTimes(2));
    fireEvent.click(await screen.findByRole("button", { name: "Close" }));
    expect(await screen.findByRole("button", { name: "Update to release 2" })).toBeEnabled();
  });

  it("says when the update's backup folder could not be removed, and offers nothing more once the offer is gone", async () => {
    let current: LibraryUpgradePlan | null = plan;
    const useCases = makeUseCasesFake({
      planLibraryUpgrade: vi.fn(async () => current),
      applyLibraryUpgrade: vi.fn(async (): Promise<DeckUpgradeOutcome> => ({
        ok: false,
        step: "copy",
        error: new Error("offline"),
        asItWas: true,
        undo: null,
        backupUrl: `${instance.url}backups/x/`,
      })),
    });
    const { container } = renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Update to release 2" }));
    current = null;
    expect(await screen.findByRole("region", { name: "Update failed" })).toHaveTextContent(
      "Your deck is exactly as it was. Its backup folder could not be removed; you can delete it in Preferences.",
    );
    // Looked at again, the deck no longer calls for the offer: trying again shows nothing.
    await waitFor(() => expect(useCases.planLibraryUpgrade).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(container.textContent).toBe(""));
    expect(useCases.applyLibraryUpgrade).toHaveBeenCalledOnce();
  });

  it("says what was kept as changed elsewhere, each with its earlier version, and closes when the offer is gone", async () => {
    let current: LibraryUpgradePlan | null = plan;
    const copy = `${instance.url}backups/x/reviews/deck-1.ttl.orig`;
    const useCases = makeUseCasesFake({
      planLibraryUpgrade: vi.fn(async () => current),
      applyLibraryUpgrade: vi.fn(async (): Promise<DeckUpgradeOutcome> => {
        current = null;
        return {
          ok: false,
          step: "entry",
          error: new AppError("deckChangedDuringUpgrade", { url: imported.url }),
          asItWas: false,
          undo: { restored: [imported.cardsDocumentUrl], kept: [{ document: imported.reviewsDocumentUrl, copy }], removed: false },
          backupUrl: `${instance.url}backups/x/`,
        };
      }),
    });
    const { container, invalidate } = renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Update to release 2" }));
    const region = await screen.findByRole("region", { name: "Update failed" });
    expect(region).toHaveTextContent("Part of the deck changed elsewhere after the update wrote it, perhaps in another tab or app, so it was kept as it is now");
    expect(within(region).getByRole("link", { name: "its earlier version (opens in a new tab)" })).toHaveAttribute("href", copy);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["cards", imported.cardsDocumentUrl] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["backups", instance.url] });
    // Not as it was, it is not offered again at once, nor put back again.
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Try restoring again" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(container.textContent).toBe(""));
    expect(useCases.applyLibraryUpgrade).toHaveBeenCalledOnce();
  });

  it("says when it could not put the deck back, and tries again, saying what it put back", async () => {
    const backupUrl = `${instance.url}backups/x/`;
    const backup = { url: backupUrl, of: imported.url, createdAt: "2026-09-28T10:00:00.000Z", release: imported.sourceUrl, entries: [] };
    let restored: (value: BackupRestore) => void = () => undefined;
    const useCases = makeUseCasesFake({
      planLibraryUpgrade: vi.fn(async () => plan),
      applyLibraryUpgrade: vi.fn(async (): Promise<DeckUpgradeOutcome> => ({
        ok: false,
        step: "entry",
        error: new Error("pod down"),
        asItWas: false,
        undo: { restored: [], kept: [], removed: false, failed: new Error("offline") },
        backupUrl,
      })),
      listBackups: vi.fn().mockResolvedValueOnce([]).mockResolvedValue([backup]),
      restoreBackup: vi.fn(() => new Promise<BackupRestore>((resolve) => (restored = resolve))),
    });
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Update to release 2" }));
    const region = await screen.findByRole("region", { name: "Update failed" });
    expect(region).toHaveTextContent(
      "Solid Memo could not put the deck back as it was. Its earlier version is kept in the update's backup folder (opens in a new tab), to try again.",
    );
    expect(region).toHaveTextContent("offline");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try restoring again" }));
    expect(await screen.findByText("A has no backup to restore.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try restoring again" }));
    const restoring = await screen.findByRole("button", { name: "Restoring…" });
    expect(restoring).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(restoring);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(useCases.restoreBackup).toHaveBeenCalledExactlyOnceWith(instance, backup);
    act(() => restored({ restored: [imported.cardsDocumentUrl], kept: [], removed: true }));
    expect(await within(region).findByText("Put back 1 document exactly as it was.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try restoring again" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(await screen.findByRole("button", { name: "Update to release 2" })).toBeEnabled();
  });

  it("offers to put back an upgrade of the deck that did not finish, in place of the offer, and says what it put back", async () => {
    const backup = { url: `${instance.url}backups/x/`, of: imported.url, createdAt: "2026-09-28T10:00:00.000Z", release: imported.sourceUrl, entries: [] };
    let leftover: typeof backup | null = backup;
    const restoreBackup = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(async (): Promise<BackupRestore> => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        leftover = null;
        return { restored: [imported.cardsDocumentUrl, imported.reviewsDocumentUrl], kept: [], removed: true };
      });
    const useCases = makeUseCasesFake({
      planLibraryUpgrade: vi.fn(async () => plan),
      findInterruptedDeckUpgrade: vi.fn(async () => leftover),
      restoreBackup,
    });
    const { invalidate } = renderContainer(useCases);
    const notice = await screen.findByRole("region", { name: "Interrupted update" });
    expect(notice).toHaveTextContent(
      "An update of this deck from the library did not finish, so it may not be as it was. The deck as it was is kept in the update's backup folder (opens in a new tab), and Solid Memo can put it back.",
    );
    expect(screen.queryByRole("button", { name: "Update to release 2" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try restoring again" }));
    expect(await screen.findByText("offline")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try restoring again" }));
    const restoring = await screen.findByRole("button", { name: "Restoring…" });
    fireEvent.click(restoring);
    expect(restoreBackup).toHaveBeenCalledTimes(2);
    expect(restoreBackup).toHaveBeenCalledWith(instance, backup);
    // Put back, the offer comes again, beneath what was put back; everything shown of the deck is read again.
    expect(await screen.findByRole("button", { name: "Update to release 2" })).toBeEnabled();
    expect(screen.getByText("Put back 2 documents exactly as they were.")).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["interruptedDeckUpgrade", imported.url] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["cards", imported.cardsDocumentUrl] });
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
