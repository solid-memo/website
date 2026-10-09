import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BackupContainer } from "./BackupContainer";
import { I18nProvider } from "./i18n";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import { makeUseCasesFake } from "../test/useCasesFake";
import type { Backup } from "@solid-memo/domain/backup";

const instance: Instance = { url: "https://pod.example/solid-memo/a-1/", name: "Main" };
const previous: Instance = { url: "https://pod.example/solid-memo/a/", name: "Main" };
const session = { webId: "https://alice.example/profile/card#me" };

function renderContainer(useCases: UseCases) {
  const onRestored = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <BackupContainer useCases={useCases} session={session} instance={instance} onRestored={onRestored} />
    </QueryClientProvider>,
  );
  return { ...view, onRestored };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BackupContainer: a copy an earlier version made", () => {
  it("shows nothing without a backup", async () => {
    const useCases = makeUseCasesFake();
    const { container } = renderContainer(useCases);
    await waitFor(() => expect(useCases.readLegacyBackup).toHaveBeenCalledWith(instance));
    expect(container).toBeEmptyDOMElement();
  });

  it("says where the backup is and when it was made, and restores it once confirmed", async () => {
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal("confirm", confirm);
    const useCases = makeUseCasesFake({
      readLegacyBackup: vi.fn(async () => ({ url: previous.url, replacedAt: "2026-09-28T10:00:00.000Z" })),
      restoreLegacyBackup: vi.fn(async () => ({ instance: previous, keptFolder: instance.url })),
    });
    const { onRestored } = renderContainer(useCases);
    const section = await screen.findByRole("region", { name: "Previous version at another address" });
    expect(within(section).getByRole("link", { name: "a backup folder in your Pod (opens in a new tab)" })).toHaveAttribute("href", previous.url);
    expect(section).toHaveTextContent("An update by an earlier version of Solid Memo kept your data as it was before (September 28, 2026), in a backup folder");
    fireEvent.click(screen.getByRole("button", { name: "Restore previous version" }));
    expect(useCases.restoreLegacyBackup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Restore previous version" }));
    await waitFor(() => expect(onRestored).toHaveBeenCalledWith(previous, instance.url));
    expect(useCases.restoreLegacyBackup).toHaveBeenCalledWith(session, instance);
  });

  it("says what it is doing while it restores or deletes", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const useCases = makeUseCasesFake({
      readLegacyBackup: vi.fn(async () => ({ url: previous.url })),
      restoreLegacyBackup: vi.fn(() => new Promise<never>(() => undefined)),
      deleteLegacyBackup: vi.fn(() => new Promise<never>(() => undefined)),
    });
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Restore previous version" }));
    expect(await screen.findByRole("button", { name: "Restoring…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete backup" })).toBeDisabled();
    cleanup();
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Delete backup" }));
    expect(await screen.findByRole("button", { name: "Deleting…" })).toBeDisabled();
  });

  it("deletes the backup once confirmed, and shows errors", async () => {
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    vi.stubGlobal("confirm", confirm);
    let backup: { url: string } | null = { url: previous.url };
    const useCases = makeUseCasesFake({
      readLegacyBackup: vi.fn(async () => backup),
      deleteLegacyBackup: vi
        .fn()
        .mockRejectedValueOnce(new Error("not allowed"))
        .mockImplementation(async () => {
          backup = null;
          return { keptFolder: null };
        }),
    });
    const { container } = renderContainer(useCases);
    const section = await screen.findByRole("region", { name: "Previous version at another address" });
    expect(section).toHaveTextContent("as it was before, in a backup folder in your Pod");
    fireEvent.click(screen.getByRole("button", { name: "Delete backup" }));
    expect(useCases.deleteLegacyBackup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete backup" }));
    expect((await screen.findByText("not allowed")).closest(".error")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete backup" }));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(useCases.deleteLegacyBackup).toHaveBeenCalledWith(instance);
  });

  it("says when deleting the backup kept its folder, which holds another app's files", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    let backup: { url: string } | null = { url: previous.url };
    const useCases = makeUseCasesFake({
      readLegacyBackup: vi.fn(async () => backup),
      deleteLegacyBackup: vi.fn(async () => {
        backup = null;
        return { keptFolder: previous.url };
      }),
    });
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Delete backup" }));
    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("Solid Memo deleted its own data and kept the folder in your Pod");
    expect(within(notice).getByRole("link")).toHaveAttribute("href", previous.url);
    expect(screen.queryByRole("region", { name: "Previous version at another address" })).not.toBeInTheDocument();
  });

  it("speaks Swedish", async () => {
    const useCases = makeUseCasesFake({
      readLegacyBackup: vi.fn(async () => ({ url: previous.url, replacedAt: "2026-09-28T10:00:00.000Z" })),
    });
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <BackupContainer useCases={useCases} session={session} instance={instance} onRestored={vi.fn()} />
        </QueryClientProvider>
      </I18nProvider>,
    );
    const section = await screen.findByRole("region", { name: "Föregående version på en annan adress" });
    expect(section).toHaveTextContent("(28 september 2026)");
    expect(screen.getByRole("button", { name: "Ta bort säkerhetskopian" })).toBeInTheDocument();
  });
});

describe("BackupContainer: backups made in place", () => {
  const FOLDER = `${instance.url}backups/20260928T100000Z-0f3a/`;
  const deck = {
    id: "deck-1",
    url: `${instance.url}catalog.ttl#deck-1`,
    title: { en: "Capitals" },
    cardsDocumentUrl: `${instance.url}decks/deck-1.ttl`,
    reviewsDocumentUrl: `${instance.url}reviews/deck-1.ttl`,
    direction: "front-to-back" as const,
    createdAt: "2026-09-21T10:00:00.000Z",
    formatVersion: 6,
    authors: [],
  };
  const update: Backup = {
    url: FOLDER,
    of: instance.url,
    createdAt: "2026-09-28T10:00:00.000Z",
    entries: [{ document: `${instance.url}meta.ttl` }, { document: `${instance.url}catalog.ttl` }],
  };
  const upgrade: Backup = { url: `${instance.url}backups/b/`, of: deck.url, createdAt: "2026-09-29T10:00:00.000Z", entries: [{ document: deck.cardsDocumentUrl }] };
  const gone: Backup = { ...upgrade, url: `${instance.url}backups/c/`, of: `${instance.url}catalog.ttl#deck-9` };

  it("lists each, saying what it was made for and when, with a link to its folder", async () => {
    const useCases = makeUseCasesFake({
      listBackups: vi.fn(async () => [update, upgrade, gone]),
      listDecks: vi.fn(async () => [deck]),
    });
    renderContainer(useCases);
    const section = await screen.findByRole("region", { name: "Previous versions" });
    await waitFor(() => expect(section).toHaveTextContent("before Capitals was updated from the library"));
    const items = within(section).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Kept on September 28, 2026, before the format update: 2 documents as they were, in a backup folder in your Pod (opens in a new tab).");
    expect(within(items[0]!).getByRole("link")).toHaveAttribute("href", FOLDER);
    expect(items[1]).toHaveTextContent("Kept on September 29, 2026, before Capitals was updated from the library");
    expect(items[2]).toHaveTextContent("Kept on September 29, 2026, before a deck was updated from the library");
    expect(useCases.listBackups).toHaveBeenCalledWith(instance);
  });

  it("names no deck before the decks are read", async () => {
    const useCases = makeUseCasesFake({
      listBackups: vi.fn(async () => [upgrade]),
      listDecks: vi.fn(() => new Promise<never>(() => undefined)),
    });
    renderContainer(useCases);
    expect(await screen.findByRole("region", { name: "Previous versions" })).toHaveTextContent("before a deck was updated from the library");
  });

  it("restores one once confirmed, saying what it put back, still once the backup it deleted is no longer listed", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValueOnce(false).mockReturnValue(true));
    let restored = false;
    const useCases = makeUseCasesFake({
      listBackups: vi.fn(async () => (restored ? [] : [update])),
      restoreBackup: vi.fn(async () => {
        restored = true;
        return { restored: [`${instance.url}meta.ttl`, `${instance.url}catalog.ttl`], kept: [], removed: true };
      }),
    });
    renderContainer(useCases);
    const restore = await screen.findByRole("button", { name: "Restore this version" });
    fireEvent.click(restore);
    expect(useCases.restoreBackup).not.toHaveBeenCalled();
    fireEvent.click(restore);
    expect(await screen.findByRole("status")).toHaveTextContent(/^Put back 2 documents exactly as they were\.$/);
    await waitFor(() => expect(screen.queryByRole("region", { name: "Previous versions" })).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent(/^Put back 2 documents exactly as they were\.$/);
    expect(useCases.restoreBackup).toHaveBeenCalledWith(instance, update);
  });

  it("says what it kept, and forgets what one restore said once a backup is deleted", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const useCases = makeUseCasesFake({
      listBackups: vi.fn(async () => [update]),
      restoreBackup: vi.fn(async () => ({
        restored: [],
        kept: [{ document: `${instance.url}meta.ttl`, copy: `${FOLDER}meta.ttl.orig` }, { document: `${instance.url}catalog.ttl` }],
        removed: false,
      })),
      deleteBackup: vi.fn(async () => ({ keptFolder: null })),
    });
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Restore this version" }));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(
      `Put back 0 documents exactly as they were. Kept as they are now, changed since the update:${instance.url}meta.ttl (its earlier version (opens in a new tab))${instance.url}catalog.ttl`,
    );
    // Each kept document's earlier version is a link to its bytes in the backup; one the update created has none.
    expect(within(status).getByRole("link", { name: "its earlier version (opens in a new tab)" })).toHaveAttribute("href", `${FOLDER}meta.ttl.orig`);
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete this backup" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Delete this backup" }));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("deletes one once confirmed, says what it is doing, and shows errors and a kept folder", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValueOnce(false).mockReturnValue(true));
    const deleteBackup = vi
      .fn()
      .mockRejectedValueOnce(new Error("not allowed"))
      .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ keptFolder: FOLDER }), 10)));
    let deleted = false;
    const useCases = makeUseCasesFake({
      listBackups: vi.fn(async () => (deleted ? [] : [update])),
      deleteBackup: vi.fn((backup: Backup) => {
        const answer = deleteBackup(backup);
        void answer.then(() => (deleted = true), () => undefined);
        return answer;
      }),
    });
    renderContainer(useCases);
    const remove = await screen.findByRole("button", { name: "Delete this backup" });
    fireEvent.click(remove);
    expect(deleteBackup).not.toHaveBeenCalled();
    fireEvent.click(remove);
    expect((await screen.findByText("not allowed")).closest(".error")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete this backup" }));
    expect(await screen.findByRole("button", { name: "Deleting…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Restore this version" })).toBeDisabled();
    expect(await screen.findByRole("status")).toHaveTextContent("Solid Memo deleted its own data and kept the folder in your Pod");
    // Its manifest gone, the backup is no longer listed; the notice stays.
    await waitFor(() => expect(screen.queryByRole("region", { name: "Previous versions" })).not.toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("Solid Memo deleted its own data and kept the folder in your Pod");
    expect(deleteBackup).toHaveBeenCalledWith(update);
  });

  it("says it is restoring while it does", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const useCases = makeUseCasesFake({ listBackups: vi.fn(async () => [update]), restoreBackup: vi.fn(() => new Promise<never>(() => undefined)) });
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Restore this version" }));
    expect(await screen.findByRole("button", { name: "Restoring…" })).toBeDisabled();
  });

  it("speaks Swedish", async () => {
    const useCases = makeUseCasesFake({ listBackups: vi.fn(async () => [update]) });
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <BackupContainer useCases={useCases} session={session} instance={instance} onRestored={vi.fn()} />
        </QueryClientProvider>
      </I18nProvider>,
    );
    const section = await screen.findByRole("region", { name: "Tidigare versioner" });
    expect(section).toHaveTextContent("Sparad 28 september 2026, före formatuppdateringen: 2 dokument som de var");
    expect(screen.getByRole("button", { name: "Återställ den här versionen" })).toBeInTheDocument();
  });
});
