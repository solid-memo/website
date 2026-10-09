import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { UpdateBadge } from "./UpdateBadge";
import { capitals, instanceA, makeCopy } from "../test/fixtures";

afterEach(() => vi.unstubAllGlobals());

const old = makeCopy("deck-1", { en: "Capitals" }, "1");
const fresh = makeCopy("deck-2", { en: "Capitals again" }, "2");

/** An IntersectionObserver the test drives: `show` puts the observed elements on the screen. */
function observeByHand() {
  const observers: ((entries: { isIntersecting: boolean }[]) => void)[] = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        observers.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  return { show: () => act(() => observers.forEach((callback) => callback([{ isIntersecting: true }]))) };
}

function renderBadges(useCases: UseCases) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <UpdateBadge useCases={useCases} instanceUrl={instanceA.url} deck={old} href="#/library" />
      <UpdateBadge useCases={useCases} instanceUrl={instanceA.url} deck={fresh} href="#/library" />
    </QueryClientProvider>,
  );
}

describe("UpdateBadge", () => {
  it("looks the copies up once they are on the screen, in one read for them all, and links a copy with a newer release", async () => {
    const screenSays = observeByHand();
    const useCases = makeUseCasesFake({
      listLibraryUpdates: vi.fn(async () => [
        { deck: old, series: capitals, version: "1", newer: true },
        { deck: fresh, series: capitals, version: "2", newer: false },
      ]),
    });
    renderBadges(useCases);
    expect(useCases.listLibraryUpdates).not.toHaveBeenCalled();
    screenSays.show();
    const link = await screen.findByRole("link", { name: "Release 2 out for Capitals" });
    expect(link).toHaveAttribute("href", "#/library");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(useCases.listLibraryUpdates).toHaveBeenCalledTimes(1);
    expect(useCases.listLibraryUpdates).toHaveBeenCalledWith(instanceA.url);
  });

  it("shows nothing when the library cannot be read", async () => {
    const screenSays = observeByHand();
    const useCases = makeUseCasesFake({ listLibraryUpdates: vi.fn(async () => Promise.reject(new Error("offline"))) });
    const { container } = renderBadges(useCases);
    screenSays.show();
    await waitFor(() => expect(useCases.listLibraryUpdates).toHaveBeenCalled());
    expect(container.querySelector(".studio-badge")).toBeNull();
  });
});
