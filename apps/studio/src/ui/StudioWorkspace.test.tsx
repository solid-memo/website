import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { DEFAULT_CARD_QUERY } from "@solid-memo/domain/cardQuery";
import { AppName } from "@solid-memo/ui/documentTitle";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { parseStudioHash, studioRouteToHash } from "./router";
import { StudioWorkspace } from "./StudioWorkspace";
import { instanceA, instanceB, makeCard, makeDeck, session } from "../test/fixtures";

const kanji = makeDeck("deck-1", { en: "Kanji N5" });
const verbs = makeDeck("deck-2", { en: "Verbs" });

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
    // The site's header (Home's own heading row is one too, in the test DOM's eyes).
    expect(screen.getByText("The masthead").closest("header")).toHaveClass("site-header");
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

  it("keeps Home's filter and sort in the URL, replacing the entry, and links its decks to Solid Memo, their cards to the workbench", async () => {
    window.history.replaceState(null, "", home(instanceA.url));
    const length = window.history.length;
    renderWorkspace(
      makeUseCasesFake({ listInstances: vi.fn(async () => [instanceA]), listDecks: vi.fn(async () => [kanji, verbs]) }),
    );
    fireEvent.input(await screen.findByRole("searchbox", { name: "Filter by name or group" }), { target: { value: "verb" } });
    expect(parseStudioHash(window.location.hash)).toEqual({ screen: "home", instanceUrl: instanceA.url, view: { filter: "verb" } });
    expect(screen.queryByRole("link", { name: "Kanji N5" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cards" }));
    expect(parseStudioHash(window.location.hash)).toEqual({
      screen: "home",
      instanceUrl: instanceA.url,
      view: { filter: "verb", sort: { column: "cards", descending: false } },
    });
    expect(window.history.length).toBe(length);
    const instance = encodeURIComponent(instanceA.url);
    const deck = encodeURIComponent(verbs.url);
    expect(screen.getByRole("link", { name: "Verbs" })).toHaveAttribute("href", `../#/deck?instance=${instance}&deck=${deck}`);
    expect(await screen.findByRole("link", { name: /cards of Verbs/ })).toHaveAttribute("href", `#/cards?deck=${deck}`);
  });

  it("opens the instance's groups from Home, to arrange them as in Solid Memo", async () => {
    window.history.replaceState(null, "", home(instanceA.url));
    const useCases = makeUseCasesFake({ listInstances: vi.fn(async () => [instanceA]), listDecks: vi.fn(async () => [kanji]) });
    renderWorkspace(useCases);
    fireEvent.click(await screen.findByRole("link", { name: "Arrange groups" }));
    expect(await screen.findByRole("heading", { name: "Groups" })).toBeInTheDocument();
    expect(parseStudioHash(window.location.hash)).toEqual({ screen: "groups", instanceUrl: instanceA.url });
    await waitFor(() => expect(document.title).toBe("Groups – Solid Memo Studio"));
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getByRole("link", { name: "Decks" })).toHaveAttribute("href", home(instanceA.url));
    expect(within(trail).getByRole("link", { name: "Groups" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Kanji N5" })).toHaveAttribute(
      "href",
      `../#/deck?instance=${encodeURIComponent(instanceA.url)}&deck=${encodeURIComponent(kanji.url)}`,
    );
  });

  it("opens a deck's cards in the workbench, keeping its query in the URL, and a card in the inspector", async () => {
    window.history.replaceState(null, "", home(instanceA.url));
    const card = makeCard(kanji, "water");
    const useCases = makeUseCasesFake({
      listInstances: vi.fn(async () => [instanceA]),
      listDecks: vi.fn(async () => [kanji]),
      listCards: vi.fn(async () => [card]),
    });
    renderWorkspace(useCases);
    fireEvent.click(await screen.findByRole("link", { name: /cards of Kanji N5/ }));
    const link = await screen.findByRole("link", { name: "water" });
    expect(parseStudioHash(window.location.hash)).toEqual({ screen: "cards", deckUrl: kanji.url });
    await waitFor(() => expect(document.title).toBe("Cards of Kanji N5 – Solid Memo Studio"));
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getByRole("link", { name: "Decks" })).toHaveAttribute("href", home(instanceA.url));
    expect(within(trail).getByRole("link", { name: "Cards of Kanji N5" })).toHaveAttribute("aria-current", "page");
    const inspector = studioRouteToHash({ screen: "card", deckUrl: kanji.url, cardUrl: card.url });
    expect(link).toHaveAttribute("href", inspector);

    const length = window.history.length;
    fireEvent.input(screen.getByRole("searchbox", { name: "Search" }), { target: { value: "wat" } });
    expect(parseStudioHash(window.location.hash)).toEqual({
      screen: "cards",
      deckUrl: kanji.url,
      query: { ...DEFAULT_CARD_QUERY, text: "wat" },
    });
    expect(window.history.length).toBe(length);

    const box = screen.getByRole("checkbox", { name: "Select water" });
    box.focus();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(await screen.findByRole("heading", { name: "Card: water" })).toBeInTheDocument();
    expect(window.location.hash).toBe(inspector);
    expect(window.history.length).toBe(length + 1);
  });

  it("inspects a card: its trail and title, its tabs in the URL, its page in Solid Memo", async () => {
    const card = { ...makeCard(kanji, "water"), distractors: [{ id: "water-d1", text: { en: "fire" } }] };
    const route = { screen: "card" as const, deckUrl: kanji.url, cardUrl: card.url };
    window.history.replaceState(null, "", studioRouteToHash(route));
    renderWorkspace(
      makeUseCasesFake({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [kanji]),
        listCards: vi.fn(async () => [card]),
      }),
    );
    expect(await screen.findByRole("heading", { name: "Card: water" })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe("water – Solid Memo Studio"));
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getByRole("link", { name: "Cards of Kanji N5" })).toHaveAttribute(
      "href",
      studioRouteToHash({ screen: "cards", deckUrl: kanji.url }),
    );
    expect(within(trail).getByRole("link", { name: "water" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Open this card in Solid Memo" })).toHaveAttribute(
      "href",
      `../#/card?instance=${encodeURIComponent(instanceA.url)}&deck=${encodeURIComponent(kanji.url)}&card=${encodeURIComponent(card.url)}`,
    );
    expect(screen.getByLabelText("Front")).toHaveValue("water");

    const length = window.history.length;
    const tab = screen.getByRole("link", { name: "Wrong options (1)" });
    expect(tab).toHaveAttribute("href", studioRouteToHash({ ...route, tab: "distractors" }));
    fireEvent.click(tab);
    expect(await screen.findByRole("group", { name: "Wrong options" })).toBeInTheDocument();
    expect(parseStudioHash(window.location.hash)).toEqual({ ...route, tab: "distractors" });
    expect(window.history.length).toBe(length);
    expect(screen.queryByLabelText("Front")).toBeNull();
  });

  it("goes back to the deck's cards once the card inspected is removed, leaving no Back stop", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const card = makeCard(kanji, "water");
    window.history.replaceState(null, "", studioRouteToHash({ screen: "card", deckUrl: kanji.url, cardUrl: card.url }));
    const listCards = vi.fn().mockResolvedValueOnce([card]).mockResolvedValue([]);
    renderWorkspace(makeUseCasesFake({ listInstances: vi.fn(async () => [instanceA]), listDecks: vi.fn(async () => [kanji]), listCards }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove card" }));
    expect(await screen.findByText("No cards in this deck yet.")).toBeInTheDocument();
    expect(parseStudioHash(window.location.hash)).toEqual({ screen: "cards", deckUrl: kanji.url });
    vi.unstubAllGlobals();
  });

  it("falls back to the deck's cards from a card it does not have, and says why its cards could not be read", async () => {
    window.history.replaceState(null, "", studioRouteToHash({ screen: "card", deckUrl: kanji.url, cardUrl: `${kanji.cardsDocumentUrl}#gone` }));
    const { unmount } = renderWorkspace(
      makeUseCasesFake({ listInstances: vi.fn(async () => [instanceA]), listDecks: vi.fn(async () => [kanji]), listCards: vi.fn(async () => []) }),
    );
    expect(await screen.findByText("No cards in this deck yet.")).toBeInTheDocument();
    expect(parseStudioHash(window.location.hash)).toEqual({ screen: "cards", deckUrl: kanji.url });
    unmount();
    window.history.replaceState(null, "", studioRouteToHash({ screen: "card", deckUrl: kanji.url, cardUrl: `${kanji.cardsDocumentUrl}#c` }));
    renderWorkspace(
      makeUseCasesFake({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [kanji]),
        listCards: vi.fn(async () => {
          throw new Error("Cards unreadable");
        }),
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Cards unreadable");
  });

  it("falls back to the instance's decks from a deck it does not have, and says why its decks could not be read", async () => {
    window.history.replaceState(null, "", studioRouteToHash({ screen: "cards", deckUrl: `${instanceA.url}catalog.ttl#gone` }));
    const { unmount } = renderWorkspace(
      makeUseCasesFake({ listInstances: vi.fn(async () => [instanceA]), listDecks: vi.fn(async () => [kanji]) }),
    );
    expect(await screen.findByRole("rowheader", { name: "Kanji N5" })).toBeInTheDocument();
    expect(window.location.hash).toBe(home(instanceA.url));
    unmount();
    window.history.replaceState(null, "", studioRouteToHash({ screen: "cards", deckUrl: kanji.url }));
    renderWorkspace(
      makeUseCasesFake({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => {
          throw new Error("Catalog unreadable");
        }),
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Catalog unreadable");
  });

  it("says why the decks could not be read only on the workbench, not once the user goes Home", async () => {
    window.history.replaceState(null, "", studioRouteToHash({ screen: "cards", deckUrl: kanji.url }));
    renderWorkspace(
      makeUseCasesFake({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => {
          throw new Error("Catalog unreadable");
        }),
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Catalog unreadable");
    window.location.hash = home(instanceA.url);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(await screen.findByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
    expect(screen.queryByText("Catalog unreadable")).toBeNull();
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
