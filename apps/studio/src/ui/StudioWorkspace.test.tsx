import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { AppName } from "@solid-memo/ui/documentTitle";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { parseStudioHash, studioRouteToHash } from "./router";
import { StudioWorkspace } from "./StudioWorkspace";
import { instanceA, instanceB, makeDeck, session } from "../test/fixtures";

const kanji = makeDeck("deck-1", { en: "Kanji N5" });

function renderWorkspace(useCases: UseCases) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      {/* As the shell names the app (StudioApp). */}
      <AppName.Provider value="studio.name">
        <StudioWorkspace useCases={useCases} session={session} banner={<p>The masthead</p>}>
          <p>A notice</p>
        </StudioWorkspace>
      </AppName.Provider>
    </QueryClientProvider>,
  );
}

const home = (instanceUrl: string) => studioRouteToHash({ screen: "home", instanceUrl });

describe("StudioWorkspace", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", window.location.pathname);
  });

  it("opens the only instance's decks, its trail and title, under the banner and the notices", async () => {
    const useCases = makeUseCasesFake({
      listInstances: vi.fn(async () => [instanceA]),
      listDecks: vi.fn(async () => [kanji]),
    });
    renderWorkspace(useCases);
    expect(await screen.findByRole("rowheader", { name: "Kanji N5" })).toBeInTheDocument();
    expect(window.location.hash).toBe(home(instanceA.url));
    await waitFor(() => expect(document.title).toBe("Decks – Solid Memo Studio"));
    expect(useCases.listInstances).toHaveBeenCalledWith(session);
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getByRole("link", { name: "Instances" })).toHaveAttribute("href", "#/instances");
    expect(within(trail).getByRole("link", { name: "Decks" })).toHaveAttribute("aria-current", "page");
    expect(within(screen.getByRole("banner")).getByText("The masthead")).toBeInTheDocument();
    expect(within(screen.getByRole("main")).getByText("A notice")).toBeInTheDocument();
  });

  it("goes back to Solid Memo at the open instance's decks", async () => {
    renderWorkspace(makeUseCasesFake({ listInstances: vi.fn(async () => [instanceA]) }));
    const back = await screen.findByRole("link", { name: "Back to Solid Memo" });
    await waitFor(() => expect(back).toHaveAttribute("href", `../#/decks?instance=${encodeURIComponent(instanceA.url)}`));
    // No decks yet: Solid Memo makes them.
    expect(await screen.findByRole("link", { name: "Solid Memo" })).toHaveAttribute("href", back.getAttribute("href"));
  });

  it("has the user pick one of several instances, then shows its decks", async () => {
    const useCases = makeUseCasesFake({
      listInstances: vi.fn(async () => [instanceA, instanceB]),
      listDecks: vi.fn(async () => [kanji]),
    });
    renderWorkspace(useCases);
    expect(await screen.findByRole("heading", { name: "Choose a Solid Memo instance" })).toBeInTheDocument();
    expect(parseStudioHash(window.location.hash)).toEqual({ screen: "instances" });
    await waitFor(() => expect(document.title).toBe("Instances – Solid Memo Studio"));
    // Solid Memo's own way back, and its way to a new instance, with no instance open.
    expect(screen.getByRole("link", { name: "Back to Solid Memo" })).toHaveAttribute("href", "../#/");
    expect(screen.getByRole("link", { name: "New instance…" })).toHaveAttribute("href", "../#/storages");
    fireEvent.click(screen.getByRole("button", { name: instanceB.name }));
    expect(await screen.findByRole("table", { name: "The decks of Deck set B" })).toBeInTheDocument();
    expect(useCases.listDecks).toHaveBeenCalledWith(instanceB.url);
  });

  it("falls back to the picker from an instance the user does not have", async () => {
    window.history.replaceState(null, "", home("https://pod.example/solid-memo/gone/"));
    renderWorkspace(makeUseCasesFake({ listInstances: vi.fn(async () => [instanceA]) }));
    expect(await screen.findByRole("heading", { name: "Choose a Solid Memo instance" })).toBeInTheDocument();
  });

  it("says why the instances could not be read", async () => {
    renderWorkspace(
      makeUseCasesFake({
        listInstances: vi.fn(async () => {
          throw new Error("Pod unreachable");
        }),
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Pod unreachable");
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
  });
});
