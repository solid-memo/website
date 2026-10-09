import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BackupContainer } from "./BackupContainer";
import { I18nProvider } from "./i18n";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Instance } from "@solid-memo/domain/instance";
import { makeUseCasesFake } from "../test/useCasesFake";

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

describe("BackupContainer", () => {
  it("shows nothing without a backup", async () => {
    const useCases = makeUseCasesFake();
    const { container } = renderContainer(useCases);
    await waitFor(() => expect(useCases.readBackup).toHaveBeenCalledWith(instance));
    expect(container).toBeEmptyDOMElement();
  });

  it("says where the backup is and when it was made, and restores it once confirmed", async () => {
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal("confirm", confirm);
    const useCases = makeUseCasesFake({
      readBackup: vi.fn(async () => ({ url: previous.url, replacedAt: "2026-09-28T10:00:00.000Z" })),
      restoreBackup: vi.fn(async () => ({ instance: previous, keptFolder: instance.url })),
    });
    const { onRestored } = renderContainer(useCases);
    const section = await screen.findByRole("region", { name: "Previous version" });
    expect(within(section).getByRole("link", { name: "a backup folder in your Pod (opens in a new tab)" })).toHaveAttribute("href", previous.url);
    expect(section).toHaveTextContent("as it was before (September 28, 2026), in a backup folder");
    fireEvent.click(screen.getByRole("button", { name: "Restore previous version" }));
    expect(useCases.restoreBackup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Restore previous version" }));
    await waitFor(() => expect(onRestored).toHaveBeenCalledWith(previous, instance.url));
    expect(useCases.restoreBackup).toHaveBeenCalledWith(session, instance);
  });

  it("says what it is doing while it restores or deletes", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const useCases = makeUseCasesFake({
      readBackup: vi.fn(async () => ({ url: previous.url })),
      restoreBackup: vi.fn(() => new Promise<never>(() => undefined)),
      deleteBackup: vi.fn(() => new Promise<never>(() => undefined)),
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
      readBackup: vi.fn(async () => backup),
      deleteBackup: vi
        .fn()
        .mockRejectedValueOnce(new Error("not allowed"))
        .mockImplementation(async () => {
          backup = null;
          return { keptFolder: null };
        }),
    });
    const { container } = renderContainer(useCases);
    const section = await screen.findByRole("region", { name: "Previous version" });
    expect(section).toHaveTextContent("as it was before, in a backup folder in your Pod");
    fireEvent.click(screen.getByRole("button", { name: "Delete backup" }));
    expect(useCases.deleteBackup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete backup" }));
    expect((await screen.findByText("not allowed")).closest(".error")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete backup" }));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(useCases.deleteBackup).toHaveBeenCalledWith(instance);
  });

  it("says when deleting the backup kept its folder, which holds another app's files", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    let backup: { url: string } | null = { url: previous.url };
    const useCases = makeUseCasesFake({
      readBackup: vi.fn(async () => backup),
      deleteBackup: vi.fn(async () => {
        backup = null;
        return { keptFolder: previous.url };
      }),
    });
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Delete backup" }));
    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("Solid Memo deleted its own data and kept the folder in your Pod");
    expect(within(notice).getByRole("link")).toHaveAttribute("href", previous.url);
    expect(screen.queryByRole("region", { name: "Previous version" })).not.toBeInTheDocument();
  });

  it("speaks Swedish", async () => {
    const useCases = makeUseCasesFake({
      readBackup: vi.fn(async () => ({ url: previous.url, replacedAt: "2026-09-28T10:00:00.000Z" })),
    });
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <BackupContainer useCases={useCases} session={session} instance={instance} onRestored={vi.fn()} />
        </QueryClientProvider>
      </I18nProvider>,
    );
    const section = await screen.findByRole("region", { name: "Föregående version" });
    expect(section).toHaveTextContent("(28 september 2026)");
    expect(screen.getByRole("button", { name: "Ta bort säkerhetskopian" })).toBeInTheDocument();
  });
});
