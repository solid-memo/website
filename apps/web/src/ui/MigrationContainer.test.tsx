import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
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
    expect(confirm).toHaveTextContent("keeps an exact copy of every document of Main that the update changes");
    expect(confirm).toHaveTextContent("before it changes any of yours");
    expect(confirm).toHaveTextContent("every document it changed is put back exactly as it was");
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
    act(() => report!({ step: "backup", done: 1, total: 8, part: { done: 3, total: 10 } }));
    expect(screen.getByRole("region", { name: "Updating" })).toHaveTextContent("Keeping an exact copy of each document…3 of 10");
    expect(screen.getByRole("progressbar", { name: "Update progress" })).toHaveAttribute("value", "1.3");
    act(() => report!({ step: "validate", done: 6, total: 8 }));
    expect(screen.getByRole("status")).toHaveTextContent(/^Checking your documents…$/);
    expect(within(screen.getByRole("region", { name: "Updating" })).getAllByRole("listitem").map((step) => step.textContent)).toEqual([
      "✓Finding what to update (done)",
      "✓Keeping an exact copy of each document (done)",
      "✓Writing the updated copy (done)",
      "✓Checking the updated copy (done)",
      "✓Making sure nothing changed meanwhile (done)",
      "✓Updating your documents (done)",
      "➜Checking your documents (in progress)",
      "·Removing the working copy",
    ]);
    // Failed at a step, it says it puts back what it changed.
    act(() => report!({ step: "validate", done: 6, total: 8, part: { done: 1, total: 5 }, undoing: true }));
    expect(screen.getByRole("status")).toHaveTextContent(/^Putting back what it changed…$/);
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
        undo: null,
      })),
    });
    const { invalidate } = renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Update 1 deck" }));
    fireEvent.click(screen.getByRole("button", { name: "Start the update" }));
    const failed = await screen.findByRole("region", { name: "Update failed" });
    expect(failed).toHaveTextContent(
      "The update failed while keeping an exact copy of each document: Something went wrong. Try again, or reload the page. Details: pod unreachable",
    );
    // It takes the progress's focus, read out with why as its description.
    expect(failed).toHaveFocus();
    expect(failed).toHaveAccessibleDescription(/The update failed while keeping an exact copy of each document/);
    expect(failed).toHaveTextContent(/No changes were made to your data\.Close$/);
    expect(screen.queryByRole("button", { name: "Try restoring again" })).toBeNull();
    expect(invalidate).not.toHaveBeenCalledWith();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("button", { name: "Update 1 deck" })).toBeEnabled();
    expect(screen.getByRole("region", { name: "Format update" })).toHaveFocus();
  });

  it("says what became of the documents an update wrote before it failed: put back, or kept as changed elsewhere, and what it could not remove", async () => {
    const changed = new AppError("changedElsewhere", { url: deck.cardsDocumentUrl });
    const META = `${instance.url}meta.ttl`;
    const FOLDER = `${instance.url}backups/x/`;
    const outcomes: UpdateOutcome[] = [
      { ok: false, step: "rewrite", error: changed, undo: { restored: [META, `${instance.url}preferences.ttl`], kept: [], removed: true } },
      {
        ok: false,
        step: "rewrite",
        error: changed,
        undo: { restored: [META], kept: [{ document: deck.cardsDocumentUrl, copy: `${FOLDER}decks/deck-1.ttl.orig` }], removed: false },
        backupUrl: FOLDER,
      },
      { ok: false, step: "rewrite", error: changed, undo: { restored: [], kept: [{ document: deck.cardsDocumentUrl }, { document: META }], removed: false }, backupUrl: FOLDER },
      { ok: false, step: "rewrite", error: changed, undo: { restored: [], kept: [], removed: true } },
      { ok: false, step: "rewrite", error: changed, undo: { restored: [META], kept: [], removed: false }, backupUrl: FOLDER },
      { ok: false, step: "backup", error: "offline", undo: null, backupUrl: FOLDER },
    ];
    const useCases = makeUseCasesFake({
      planMigration: vi.fn(async () => outdated),
      updateInstance: vi.fn(async () => outcomes.shift()!),
    });
    const { invalidate } = renderContainer(useCases);
    const run = async () => {
      fireEvent.click(await screen.findByRole("button", { name: "Update 1 deck" }));
      fireEvent.click(screen.getByRole("button", { name: "Start the update" }));
      const failed = await screen.findByRole("region", { name: "Update failed" });
      return { failed, close: () => fireEvent.click(within(failed).getByRole("button", { name: "Close" })) };
    };
    let { failed, close } = await run();
    expect(failed).toHaveTextContent("Every document it had changed is back exactly as it was.");
    // Written and put back: everything shown of the documents is read again.
    expect(invalidate).toHaveBeenCalledWith();
    close();
    ({ failed, close } = await run());
    expect(failed).toHaveTextContent(
      "1 document changed elsewhere after the update wrote it, so it was kept as it is now. Its earlier version is kept in a backup in Preferences:",
    );
    expect(within(failed).getByRole("link", { name: "its earlier version (opens in a new tab)" })).toHaveAttribute(
      "href",
      `${FOLDER}decks/deck-1.ttl.orig`,
    );
    expect(failed).toHaveTextContent("Put back 1 document exactly as it was.");
    expect(screen.queryByRole("button", { name: "Try restoring again" })).toBeNull();
    close();
    ({ failed, close } = await run());
    expect(failed).toHaveTextContent("2 documents changed elsewhere after the update wrote them, so they were kept as they are now.");
    expect(failed).not.toHaveTextContent("Put back");
    close();
    ({ failed, close } = await run());
    expect(failed).toHaveTextContent(/No changes were made to your data\.Close$/);
    close();
    ({ failed, close } = await run());
    expect(failed).toHaveTextContent(
      "Every document it had changed is back exactly as it was. Its backup folder could not be removed; you can delete it in Preferences.",
    );
    close();
    ({ failed } = await run());
    expect(failed).toHaveTextContent("No changes were made to your data. Its backup folder could not be removed; you can delete it in Preferences.");
  });

  it("says when it could not put back what it changed, and tries again, saying what it put back", async () => {
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
        undo: { restored: [], kept: [], removed: false, failed: new Error("offline") },
        backupUrl,
      })),
      listBackups,
      restoreBackup: vi.fn(() => new Promise<BackupRestore>((resolve) => (restored = resolve))),
    });
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Update 1 deck" }));
    fireEvent.click(screen.getByRole("button", { name: "Start the update" }));
    const failed = await screen.findByRole("region", { name: "Update failed" });
    expect(failed).toHaveTextContent("Once written, the updated data is not in the format Solid Memo expects (2 problems).");
    expect(failed).toHaveTextContent(
      "Solid Memo could not put back everything it changed. Each document's earlier version is kept in the update's backup folder (opens in a new tab), to try again.",
    );
    expect(within(failed).getByRole("link", { name: "the update's backup folder (opens in a new tab)" })).toHaveAttribute("href", backupUrl);
    expect(failed).toHaveTextContent("offline");
    // A backup gone meanwhile is said to be.
    fireEvent.click(screen.getByRole("button", { name: "Try restoring again" }));
    expect(await screen.findByText("Main has no backup to restore.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try restoring again" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Restoring…" })).toHaveAttribute("aria-disabled", "true"));
    fireEvent.click(screen.getByRole("button", { name: "Restoring…" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(useCases.restoreBackup).toHaveBeenCalledExactlyOnceWith(instance, backup);
    act(() => restored({ restored: [`${instance.url}meta.ttl`], kept: [{ document: `${instance.url}catalog.ttl` }], removed: false }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      `Put back 1 document exactly as it was. Kept as they are now, changed since the update:${instance.url}catalog.ttl`,
    );
    expect(screen.queryByRole("button", { name: "Try restoring again" })).toBeNull();
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

  it("offers to remove the partial copy an earlier version's interrupted update left, and says why it could not", async () => {
    let leftover: { kind: "copy"; folder: string } | null = { kind: "copy", folder: "https://pod.example/solid-memo/a-0f3a/" };
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
    expect(notice).toHaveTextContent("What it had begun to write remains at https://pod.example/solid-memo/a-0f3a/.");
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

  it("offers to put back what an update that did not finish changed, and says what it put back", async () => {
    const backup = { url: `${instance.url}backups/x/`, of: instance.url, createdAt: "2026-09-28T10:00:00.000Z", entries: [] };
    let leftover: { kind: "run"; backup: typeof backup } | null = { kind: "run", backup };
    const restoreBackup = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(async (): Promise<BackupRestore> => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        leftover = null;
        return { restored: [`${instance.url}meta.ttl`], kept: [], removed: true };
      });
    const useCases = makeUseCasesFake({
      planMigration: vi.fn(async () => outdated),
      findInterruptedUpdate: vi.fn(async () => leftover),
      restoreBackup,
    });
    renderContainer(useCases);
    const notice = await screen.findByRole("region", { name: "Interrupted update" });
    expect(notice).toHaveTextContent(
      "An update of Main did not finish, so some of its documents may not be as they were. Each one's earlier version is kept in the update's backup folder (opens in a new tab), and Solid Memo can put them back.",
    );
    expect(within(notice).getByRole("link", { name: "the update's backup folder (opens in a new tab)" })).toHaveAttribute("href", backup.url);
    fireEvent.click(screen.getByRole("button", { name: "Try restoring again" }));
    expect(await screen.findByText("offline")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try restoring again" }));
    const restoring = await screen.findByRole("button", { name: "Restoring…" });
    expect(restoring).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(restoring);
    expect(restoreBackup).toHaveBeenCalledTimes(2);
    expect(restoreBackup).toHaveBeenCalledWith(instance, backup);
    // Put back, the update is offered again, beneath what was put back.
    expect(await screen.findByRole("region", { name: "Format update" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/^Put back 1 document exactly as it was\.$/);
  });

  it("says what was put back even once nothing is outdated", async () => {
    const backup = { url: `${instance.url}backups/x/`, of: instance.url, createdAt: "2026-09-28T10:00:00.000Z", entries: [] };
    let leftover: { kind: "run"; backup: typeof backup } | null = { kind: "run", backup };
    const useCases = makeUseCasesFake({
      planMigration: vi.fn(async () => current),
      findInterruptedUpdate: vi.fn(async () => leftover),
      restoreBackup: vi.fn(async (): Promise<BackupRestore> => {
        leftover = null;
        return { restored: [], kept: [{ document: `${instance.url}meta.ttl` }], removed: false };
      }),
    });
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Try restoring again" }));
    expect(await screen.findByRole("status")).toHaveTextContent(`Kept as they are now, changed since the update:${instance.url}meta.ttl`);
  });
});
