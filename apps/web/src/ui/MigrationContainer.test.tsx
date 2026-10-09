import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MigrationContainer } from "./MigrationContainer";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { MigrationPlan } from "@solid-memo/domain/migration";
import type { UpdateOutcome, UpdateProgress } from "@solid-memo/domain/instanceUpdate";
import { makeUseCasesFake } from "../test/useCasesFake";
import { AppError } from "@solid-memo/domain/appError";
import type { BackupRestore } from "@solid-memo/domain/backup";

const instance: Instance = {
  url: "https://pod.example/solid-memo/a/",
  name: "Main",
};
const deck: Deck = {
  id: "deck-1",
  url: `${instance.url}catalog.ttl#deck-1`,
  title: { en: "Kanji N5" },
  cardsDocumentUrl: `${instance.url}decks/deck-1.ttl`,
  reviewsDocumentUrl: `${instance.url}reviews/deck-1.ttl`,
  direction: "front-to-back",
  createdAt: "2026-09-21T10:00:00.000Z",
  formatVersion: 1,
  authors: [],
};
const nothing = { reviewCount: 0, preferencesOutdated: false, instanceOutdated: false, catalogMissing: false };
const session = { webId: "https://alice.example/profile/card#me" };
const outdated: MigrationPlan = {
  decks: [{ deck, deckOutdated: true, cardCount: 3, reviewCount: 0 }],
  deckCount: 1,
  cardCount: 3,
  ...nothing,
};
const current: MigrationPlan = { decks: [], deckCount: 0, cardCount: 0, ...nothing };

function renderContainer(useCases: UseCases) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <MigrationContainer useCases={useCases} session={session} instance={instance} />
    </QueryClientProvider>,
  );
  return { invalidate, queryClient };
}

describe("MigrationContainer", () => {
  it("shows nothing while planning, when nothing is outdated, or when the check fails", async () => {
    const useCases = makeUseCasesFake({
      planMigration: vi.fn(async () => current),
    });
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <MigrationContainer useCases={useCases} session={session} instance={instance} />
      </QueryClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
    await waitFor(() => {
      expect(useCases.planMigration).toHaveBeenCalledWith(instance.url);
    });
    expect(container).toBeEmptyDOMElement();

    const failing = render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MigrationContainer
          useCases={makeUseCasesFake({
            planMigration: vi.fn(async () => {
              throw new Error("pod unreachable");
            }),
          })}
          session={session}
          instance={instance}
        />
      </QueryClientProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(failing.container).toBeEmptyDOMElement();
  });

  it("asks before updating, and does nothing when the user says not now", async () => {
    const useCases = makeUseCasesFake({ planMigration: vi.fn(async () => outdated) });
    renderContainer(useCases);
    // Shown with the screen, the notice leaves the focus be.
    const notice = await screen.findByRole("region", { name: "Format update" });
    expect(notice).not.toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Update 1 deck" }));
    // The question takes the notice's place and its focus, read out as its description.
    const confirm = screen.getByRole("region", { name: "Start the update" });
    expect(confirm).toHaveTextContent("keeps a copy of every document of Main that the update changes");
    expect(confirm).toHaveTextContent("Every address stays the same");
    expect(confirm).toHaveFocus();
    expect(confirm).toHaveAccessibleDescription(/How the update keeps your data safe/);
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.getByRole("button", { name: "Update 1 deck" })).toBeEnabled();
    expect(screen.getByRole("region", { name: "Format update" })).toHaveFocus();
    expect(useCases.updateInstance).not.toHaveBeenCalled();
  });

  it("runs the update once started, showing its progress, then reads everything again", async () => {
    let finish: (outcome: UpdateOutcome) => void = () => undefined;
    let report: ((progress: UpdateProgress) => void) | undefined;
    const useCases = makeUseCasesFake({
      planMigration: vi.fn(async () => outdated),
      updateInstance: vi.fn((_s, _i, onProgress) => {
        report = onProgress;
        return new Promise<UpdateOutcome>((resolve) => (finish = resolve));
      }),
    });
    const { invalidate } = renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Update 1 deck" }));
    fireEvent.click(screen.getByRole("button", { name: "Start the update" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Updating" })).toHaveTextContent("Finding what to update…"));
    expect(screen.getByRole("region", { name: "Updating" })).toHaveFocus();
    await waitFor(() => expect(report).toBeDefined());
    act(() => report!({ step: "backup", done: 1, total: 4, part: { done: 3, total: 10 } }));
    expect(screen.getByRole("region", { name: "Updating" })).toHaveTextContent("Keeping a copy of what changes…3 of 10");
    expect(screen.getByRole("progressbar", { name: "Update progress" })).toHaveAttribute("value", "1.3");
    act(() => report!({ step: "validate", done: 3, total: 4 }));
    expect(screen.getByRole("status")).toHaveTextContent(/^Checking the instance…$/);
    act(() => finish({ ok: true, backupUrl: `${instance.url}backups/x/` }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith());
    expect(useCases.updateInstance).toHaveBeenCalledWith(session, instance, expect.any(Function));
  });

  it("says where the update stopped, and that nothing changed, then goes back to the offer", async () => {
    const useCases = makeUseCasesFake({
      planMigration: vi.fn(async () => outdated),
      updateInstance: vi.fn(async (): Promise<UpdateOutcome> => ({
        ok: false,
        step: "backup",
        error: "pod unreachable",
        updated: [],
      })),
    });
    const { invalidate } = renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Update 1 deck" }));
    fireEvent.click(screen.getByRole("button", { name: "Start the update" }));
    const failed = await screen.findByRole("region", { name: "Update failed" });
    expect(failed).toHaveTextContent(
      "The update failed while keeping a copy of what changes: Something went wrong. Try again, or reload the page. Details: pod unreachable",
    );
    // It takes the progress's focus, read out with why as its description.
    expect(failed).toHaveFocus();
    expect(failed).toHaveAccessibleDescription(/The update failed while keeping a copy of what changes/);
    expect(failed).toHaveTextContent(/No changes were made to your data\.Close$/);
    expect(screen.queryByRole("button", { name: "Restore the previous version" })).toBeNull();
    expect(invalidate).not.toHaveBeenCalledWith();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("button", { name: "Update 1 deck" })).toBeEnabled();
    expect(screen.getByRole("region", { name: "Format update" })).toHaveFocus();
  });

  it("says what an update that stopped part-way updated, and that a backup it could not remove is in Preferences", async () => {
    const changed = new AppError("changedElsewhere", { url: deck.cardsDocumentUrl });
    const outcomes: UpdateOutcome[] = [
      { ok: false, step: "upgrade", error: changed, updated: [`${instance.url}meta.ttl`, `${instance.url}preferences.ttl`], backupUrl: `${instance.url}backups/x/` },
      { ok: false, step: "upgrade", error: changed, updated: [`${instance.url}meta.ttl`], backupUrl: `${instance.url}backups/x/` },
      { ok: false, step: "backup", error: "offline", updated: [], backupUrl: `${instance.url}backups/x/` },
    ];
    const useCases = makeUseCasesFake({
      planMigration: vi.fn(async () => outdated),
      updateInstance: vi.fn(async () => outcomes.shift()!),
    });
    const { invalidate } = renderContainer(useCases);
    const run = async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Update 1 deck" }));
      fireEvent.click(screen.getByRole("button", { name: "Start the update" }));
      return screen.findByRole("region", { name: "Update failed" });
    };
    expect(await run()).toHaveTextContent(
      "2 documents were brought up to date before the update stopped, and stay so; the others are as they were. Run the update again to finish it.",
    );
    expect(invalidate).toHaveBeenCalledWith();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(await run()).toHaveTextContent("1 document was brought up to date before the update stopped, and stays so");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(await run()).toHaveTextContent(
      "No changes were made to your data. Its partial backup could not be removed; you can delete it in Preferences.",
    );
  });

  it("offers to restore the previous version when the updated instance does not conform, and says what it put back", async () => {
    const backupUrl = `${instance.url}backups/x/`;
    const backup = { url: backupUrl, of: instance.url, createdAt: "2026-09-28T10:00:00.000Z", entries: [] };
    let restored: (value: BackupRestore) => void = () => undefined;
    const listBackups = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([backup]);
    const useCases = makeUseCasesFake({
      planMigration: vi.fn(async () => outdated),
      updateInstance: vi.fn(async (): Promise<UpdateOutcome> => ({
        ok: false,
        step: "validate",
        error: new AppError("updatedInstanceInvalid", { count: 2 }),
        updated: [`${instance.url}meta.ttl`],
        backupUrl,
      })),
      listBackups,
      restoreBackup: vi.fn(() => new Promise<BackupRestore>((resolve) => (restored = resolve))),
    });
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Update 1 deck" }));
    fireEvent.click(screen.getByRole("button", { name: "Start the update" }));
    const failed = await screen.findByRole("region", { name: "Update failed" });
    expect(failed).toHaveTextContent("After the update, part of your data is not in the format Solid Memo expects (2 problems).");
    // A backup gone meanwhile is said to be.
    fireEvent.click(screen.getByRole("button", { name: "Restore the previous version" }));
    expect(await screen.findByText("Main has no backup to restore.")).toBeInTheDocument();
    const restore = screen.getByRole("button", { name: "Restore the previous version" });
    fireEvent.click(restore);
    await waitFor(() => expect(screen.getByRole("button", { name: "Restoring…" })).toHaveAttribute("aria-disabled", "true"));
    fireEvent.click(screen.getByRole("button", { name: "Restoring…" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(useCases.restoreBackup).toHaveBeenCalledExactlyOnceWith(instance, backup);
    act(() => restored({ restored: [`${instance.url}meta.ttl`], kept: [`${instance.url}catalog.ttl`], removed: false }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      `Put back 1 document as it was. Kept as they are now, changed since the update: ${instance.url}catalog.ttl.`,
    );
    expect(screen.queryByRole("button", { name: "Restore the previous version" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("region", { name: "Format update" })).toBeInTheDocument();
  });

  it("shows an error thrown by the update on the offer", async () => {
    const useCases = makeUseCasesFake({
      planMigration: vi.fn(async () => outdated),
      updateInstance: vi.fn(async () => {
        throw new Error("write refused");
      }),
    });
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Update 1 deck" }));
    fireEvent.click(screen.getByRole("button", { name: "Start the update" }));
    expect(await screen.findByText("write refused")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update 1 deck" })).toBeEnabled();
  });

  it("offers to remove the partial backup an interrupted update left, and says why it could not", async () => {
    let leftover: { folder: string; backedUp: boolean } | null = { folder: `${instance.url}backups/x/`, backedUp: false };
    const removeInterruptedUpdate = vi
      .fn()
      .mockRejectedValueOnce(new Error("not allowed"))
      .mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        leftover = null;
      });
    const useCases = makeUseCasesFake({
      planMigration: vi.fn(async () => current),
      findInterruptedUpdate: vi.fn(async () => leftover),
      removeInterruptedUpdate,
    });
    renderContainer(useCases);
    const notice = await screen.findByRole("region", { name: "Interrupted update" });
    expect(notice).toHaveTextContent(`What it had begun to write remains at ${instance.url}backups/x/.`);
    fireEvent.click(screen.getByRole("button", { name: "Remove it" }));
    expect(await screen.findByText("not allowed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove it" }));
    // Only aria-disabled, so it keeps the focus; pressed again meanwhile, it does nothing.
    const removing = await screen.findByRole("button", { name: "Removing…" });
    expect(removing).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(removing);
    expect(removeInterruptedUpdate).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole("region", { name: "Interrupted update" })).toBeNull());
  });

  it("says an interrupted update kept its backup, and forgets it once read", async () => {
    let leftover: { folder: string; backedUp: boolean } | null = { folder: `${instance.url}backups/x/`, backedUp: true };
    const useCases = makeUseCasesFake({
      planMigration: vi.fn(async () => current),
      findInterruptedUpdate: vi.fn(async () => leftover),
      removeInterruptedUpdate: vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        leftover = null;
      }),
    });
    renderContainer(useCases);
    const notice = await screen.findByRole("region", { name: "Interrupted update" });
    expect(notice).toHaveTextContent("What it updated stays updated and the rest is as it was; update again to finish.");
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "OK" })).toHaveAttribute("aria-disabled", "true"));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Interrupted update" })).toBeNull());
  });
});
