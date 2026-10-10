import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { DEFAULT_CARD_QUERY } from "@solid-memo/domain/cardQuery";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { AppError } from "@solid-memo/domain/appError";
import { AppName } from "@solid-memo/ui/documentTitle";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { parseStudioHash, studioRouteToHash } from "./router";
import { StudioWorkspace } from "./StudioWorkspace";
import { choose } from "../test/choose";
import { applyDraftChanges, type ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { problem } from "@solid-memo/domain/release/problems";
import { courseDraft, DRAFT_URL, instanceA, instanceB, makeCard, makeDeck, session } from "../test/fixtures";
import { courseDeck, courseInstance, makeCourse } from "@solid-memo/ui/test/course";

const kanji = makeDeck("deck-1", { en: "Kanji N5" });
const verbs = makeDeck("deck-2", { en: "Verbs" });

function renderWorkspace(useCases: UseCases) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      {/* As the site's shell names the app at the Studio's routes (STUDIO in ui's App.tsx). */}
      <AppName.Provider value="studio.name">
        <StudioWorkspace useCases={useCases} session={session} banner={<p>The masthead</p>}>
          <p>A notice</p>
        </StudioWorkspace>
      </AppName.Provider>
    </QueryClientProvider>,
  );
}

/** The release check of the Studio's Markdown, as the screens pass it on. */
const MARKDOWN_CHECK = { problems: expect.any(Function), chunks: expect.any(Function) };

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
    expect(within(trail).getByRole("link", { name: "Instances" })).toHaveAttribute("href", "#/studio/instances");
    expect(within(trail).getByRole("link", { name: "Decks" })).toHaveAttribute("aria-current", "page");
    // The site's header (Home's own heading row is one too, in the test DOM's eyes).
    expect(screen.getByText("The masthead").closest("header")).toHaveClass("site-header");
    expect(within(screen.getByRole("main")).getByText("A notice")).toBeInTheDocument();
  });

  it("goes back to Solid Memo at the open instance's decks", async () => {
    renderWorkspace(makeUseCasesFake({ listInstances: vi.fn(async () => [instanceA]) }));
    const back = await screen.findByRole("link", { name: "Back to Solid Memo" });
    await waitFor(() => expect(back).toHaveAttribute("href", `#/decks?instance=${encodeURIComponent(instanceA.url)}`));
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
    expect(screen.getByRole("link", { name: "Back to Solid Memo" })).toHaveAttribute("href", "#/");
    expect(screen.getByRole("link", { name: "New instance…" })).toHaveAttribute("href", "#/storages");
    fireEvent.click(screen.getByRole("button", { name: instanceB.name }));
    expect(await screen.findByRole("table", { name: "The decks of Deck set B" })).toBeInTheDocument();
    expect(useCases.listDecks).toHaveBeenCalledWith(instanceB.url);
  });

  it("keeps Home's filter and sort in the URL, replacing the entry, and links its decks to their about screen, their cards to the workbench", async () => {
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
    expect(screen.getByRole("link", { name: "Verbs" })).toHaveAttribute("href", `#/studio/about?deck=${deck}`);
    expect(await screen.findByRole("link", { name: /cards of Verbs/ })).toHaveAttribute("href", `#/studio/cards?deck=${deck}`);
    expect(screen.getByRole("link", { name: "Name and catalogue" })).toHaveAttribute("href", `#/studio/instance?instance=${instance}`);
  });

  it("opens what a deck says of itself from Home: its trail and title, its page in Solid Memo", async () => {
    window.history.replaceState(null, "", home(instanceA.url));
    renderWorkspace(makeUseCasesFake({ listInstances: vi.fn(async () => [instanceA]), listDecks: vi.fn(async () => [kanji]) }));
    fireEvent.click(await screen.findByRole("link", { name: "Kanji N5" }));
    expect(await screen.findByRole("heading", { name: "About: Kanji N5" })).toBeInTheDocument();
    expect(parseStudioHash(window.location.hash)).toEqual({ screen: "about", deckUrl: kanji.url });
    await waitFor(() => expect(document.title).toBe("About Kanji N5 – Solid Memo Studio"));
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getByRole("link", { name: "Decks" })).toHaveAttribute("href", home(instanceA.url));
    expect(within(trail).getByRole("link", { name: "About Kanji N5" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Open this deck in Solid Memo" })).toHaveAttribute(
      "href",
      `#/deck?instance=${encodeURIComponent(instanceA.url)}&deck=${encodeURIComponent(kanji.url)}`,
    );
  });

  it("opens the instance's name and catalogue from Home", async () => {
    window.history.replaceState(null, "", home(instanceA.url));
    renderWorkspace(makeUseCasesFake({ listInstances: vi.fn(async () => [instanceA]) }));
    fireEvent.click(await screen.findByRole("link", { name: "Name and catalogue" }));
    expect(await screen.findByRole("heading", { name: "Instance: Deck set A" })).toBeInTheDocument();
    expect(parseStudioHash(window.location.hash)).toEqual({ screen: "instance", instanceUrl: instanceA.url });
    await waitFor(() => expect(document.title).toBe("Name and catalogue – Solid Memo Studio"));
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getByRole("link", { name: "Name and catalogue" })).toHaveAttribute("aria-current", "page");
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
      `#/deck?instance=${encodeURIComponent(instanceA.url)}&deck=${encodeURIComponent(kanji.url)}`,
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

  it("opens a deck's schedule from its cards, its trail through them, its leeches linked to their history and to the workbench", async () => {
    const card = makeCard(kanji, "water");
    window.history.replaceState(null, "", studioRouteToHash({ screen: "cards", deckUrl: kanji.url }));
    const useCases = makeUseCasesFake({
      listInstances: vi.fn(async () => [instanceA]),
      listDecks: vi.fn(async () => [kanji]),
      listCards: vi.fn(async () => [card]),
    });
    vi.mocked(useCases.deckInsight).mockImplementation(async () => ({
      ...(await makeUseCasesFake().deckInsight(instanceA.url, kanji, new Date(), {} as never)),
      leeches: [{ card, lapses: 4 }],
    }));
    renderWorkspace(useCases);
    fireEvent.click(await screen.findByRole("link", { name: "Schedule, lapses and leeches" }));
    expect(await screen.findByRole("heading", { name: "Schedule: Kanji N5" })).toBeInTheDocument();
    expect(parseStudioHash(window.location.hash)).toEqual({ screen: "schedule", deckUrl: kanji.url });
    await waitFor(() => expect(document.title).toBe("Schedule – Solid Memo Studio"));
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getByRole("link", { name: "Cards of Kanji N5" })).toHaveAttribute(
      "href",
      studioRouteToHash({ screen: "cards", deckUrl: kanji.url }),
    );
    expect(screen.getByRole("link", { name: "water" })).toHaveAttribute(
      "href",
      studioRouteToHash({ screen: "card", deckUrl: kanji.url, cardUrl: card.url, tab: "history" }),
    );
    expect(parseStudioHash(screen.getByRole("link", { name: "Show the leeches among the deck's cards" }).getAttribute("href")!)).toEqual({
      screen: "cards",
      deckUrl: kanji.url,
      query: { ...DEFAULT_CARD_QUERY, state: "leech", sort: { key: "lapses", descending: true } },
    });
  });

  it("opens the instance's health from Home, a deck's from there, and a problem's field in the inspector", async () => {
    const twin = makeCard(kanji, "water");
    const marked = { ...makeCard(kanji, "fire"), backNote: { en: "<b>hot</b>" }, textFormat: SM.markdown };
    window.history.replaceState(null, "", home(instanceA.url));
    renderWorkspace(
      makeUseCasesFake({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [kanji]),
        listCards: vi.fn(async () => [twin, { ...twin, id: "water-2", url: `${twin.url}-2` }, marked]),
      }),
    );
    fireEvent.click(await screen.findByRole("link", { name: "Health" }));
    expect(await screen.findByRole("heading", { name: "Health of Deck set A" })).toBeInTheDocument();
    expect(parseStudioHash(window.location.hash)).toEqual({ screen: "health", instanceUrl: instanceA.url });
    await waitFor(() => expect(document.title).toBe("Health – Solid Memo Studio"));

    fireEvent.click(within(screen.getByRole("region", { name: "Decks" })).getByRole("link", { name: "Kanji N5" }));
    expect(await screen.findByRole("heading", { name: "Health of Kanji N5" })).toBeInTheDocument();
    expect(parseStudioHash(window.location.hash)).toEqual({ screen: "health", instanceUrl: instanceA.url, deckUrl: kanji.url });
    await waitFor(() => expect(document.title).toBe("Kanji N5 – Solid Memo Studio"));
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getByRole("link", { name: "Health" })).toHaveAttribute("href", studioRouteToHash({ screen: "health", instanceUrl: instanceA.url }));
    expect(within(screen.getByRole("region", { name: "Cards that say the same" })).getAllByRole("link")).toHaveLength(2);

    // Each tag of the HTML is a problem of its own.
    fireEvent.click((await screen.findAllByRole("link", { name: "fire, note under the back (English)" }))[0]!);
    const route = { screen: "card" as const, deckUrl: kanji.url, cardUrl: marked.url };
    expect(parseStudioHash(window.location.hash)).toEqual({ ...route, field: "backNote" });
    await waitFor(() => expect(document.getElementById("card-back-note")).toHaveFocus());
    // Another tab opens at none of the fields.
    expect(screen.getByRole("link", { name: "Wrong options (0)" })).toHaveAttribute("href", studioRouteToHash({ ...route, tab: "distractors" }));
  });

  it("opens the instance's library copies from Home, with a link to the library in Solid Memo and each deck's about screen", async () => {
    const copy = { ...kanji, sourceUrl: "https://solid-memo.com/decks/capitals/v1.ttl" };
    window.history.replaceState(null, "", home(instanceA.url));
    renderWorkspace(
      makeUseCasesFake({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [copy]),
        listLibraryUpdates: vi.fn(async () => [{ deck: copy, series: null, version: null, newer: false }]),
      }),
    );
    fireEvent.click(await screen.findByRole("link", { name: "Library copies" }));
    expect(await screen.findByRole("heading", { name: "Library copies in Deck set A" })).toBeInTheDocument();
    expect(parseStudioHash(window.location.hash)).toEqual({ screen: "library", instanceUrl: instanceA.url });
    await waitFor(() => expect(document.title).toBe("Library copies – Solid Memo Studio"));
    expect(screen.getByRole("link", { name: "Browse the deck library" })).toHaveAttribute(
      "href",
      `#/library?instance=${encodeURIComponent(instanceA.url)}`,
    );
    expect(screen.getByRole("link", { name: "Kanji N5" })).toHaveAttribute("href", studioRouteToHash({ screen: "about", deckUrl: kanji.url }));
  });

  it("lists the instance's drafts on Home, and opens them, from its panel or its header", async () => {
    window.history.replaceState(null, "", home(instanceA.url));
    const useCases = makeUseCasesFake({
      listInstances: vi.fn(async () => [instanceA]),
      listDecks: vi.fn(async () => [kanji]),
      listReleaseDrafts: vi.fn(async () => [
        { url: `${instanceA.url}drafts/solid/v1/release.ttl`, instanceUrl: instanceA.url, name: "solid", version: 1, readable: true, title: { en: "Solid" }, course: true },
      ]),
    });
    renderWorkspace(useCases);
    const panel = await screen.findByRole("region", { name: "Drafts" });
    expect(await within(panel).findByText("Course, version 1")).toBeInTheDocument();
    const drafts = studioRouteToHash({ screen: "drafts", instanceUrl: instanceA.url });
    expect(screen.getByRole("link", { name: "Drafts" })).toHaveAttribute("href", drafts);
    fireEvent.click(within(panel).getByRole("link", { name: "Drafts of releases" }));
    expect(await screen.findByRole("heading", { name: "Drafts of releases in Deck set A" })).toBeInTheDocument();
    expect(parseStudioHash(window.location.hash)).toEqual({ screen: "drafts", instanceUrl: instanceA.url });
    await waitFor(() => expect(document.title).toBe("Drafts – Solid Memo Studio"));
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getByRole("link", { name: "Drafts" })).toHaveAttribute("aria-current", "page");
  });

  it("opens import and export from Home, the decks ticked in the URL, and a deck's cards export it", async () => {
    window.history.replaceState(null, "", home(instanceA.url));
    const imported = makeDeck("deck-3", { en: "Capitals" });
    renderWorkspace(
      makeUseCasesFake({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [kanji, verbs]),
        openDeckFile: vi.fn(async () => ({ name: "c.ttl", format: "turtle" as const, content: { deck: imported, cards: [], upgraded: [], dropped: [] } })),
        importDeckFile: vi.fn(async () => imported),
      }),
    );
    fireEvent.click(await screen.findByRole("checkbox", { name: "Select Verbs" }));
    expect(screen.getByRole("link", { name: "Export" })).toHaveAttribute(
      "href",
      studioRouteToHash({ screen: "transfer", instanceUrl: instanceA.url, deckUrls: [verbs.url] }),
    );
    fireEvent.click(screen.getByRole("link", { name: "Import and export" }));
    expect(await screen.findByRole("heading", { name: "Import and export decks of Deck set A" })).toBeInTheDocument();
    expect(parseStudioHash(window.location.hash)).toEqual({ screen: "transfer", instanceUrl: instanceA.url });
    await waitFor(() => expect(document.title).toBe("Import and export – Solid Memo Studio"));
    fireEvent.click(screen.getByRole("checkbox", { name: "Verbs" }));
    expect(parseStudioHash(window.location.hash)).toEqual({ screen: "transfer", instanceUrl: instanceA.url, deckUrls: [verbs.url] });
    expect(screen.getByRole("checkbox", { name: "Verbs" })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Verbs" }));
    expect(parseStudioHash(window.location.hash)).toEqual({ screen: "transfer", instanceUrl: instanceA.url });
    fireEvent.click(screen.getByRole("button", { name: "Choose a file…" }));
    fireEvent.click(await screen.findByRole("button", { name: "Import into Deck set A" }));
    expect(await screen.findByRole("link", { name: "Capitals" })).toHaveAttribute(
      "href",
      studioRouteToHash({ screen: "cards", deckUrl: imported.url }),
    );
  });

  it("starts import and export afresh in another instance: no file or status of the last one", async () => {
    window.history.replaceState(null, "", studioRouteToHash({ screen: "transfer", instanceUrl: instanceA.url, deckUrls: [kanji.url] }));
    const imported = makeDeck("deck-3", { en: "Capitals" });
    renderWorkspace(
      makeUseCasesFake({
        listInstances: vi.fn(async () => [instanceA, instanceB]),
        listDecks: vi.fn(async () => [kanji]),
        openDeckFile: vi.fn(async () => ({ name: "c.ttl", format: "turtle" as const, content: { deck: imported, cards: [], upgraded: [], dropped: [] } })),
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Export 1 deck" }));
    expect(await screen.findByText(/^Exported 1 deck\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Choose a file…" }));
    expect(await screen.findByRole("button", { name: "Import into Deck set A" })).toBeInTheDocument();
    window.location.hash = studioRouteToHash({ screen: "transfer", instanceUrl: instanceB.url });
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(await screen.findByRole("heading", { name: "Import and export decks of Deck set B" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import into Deck set B" })).toBeNull();
    expect(screen.queryByText(/^Exported 1 deck\./)).toBeNull();
  });

  it("links a deck's cards to its export", async () => {
    window.history.replaceState(null, "", studioRouteToHash({ screen: "cards", deckUrl: kanji.url }));
    renderWorkspace(makeUseCasesFake({ listInstances: vi.fn(async () => [instanceA]), listDecks: vi.fn(async () => [kanji]) }));
    expect(await screen.findByRole("link", { name: "Export" })).toHaveAttribute(
      "href",
      studioRouteToHash({ screen: "transfer", instanceUrl: instanceA.url, deckUrls: [kanji.url] }),
    );
  });

  it("links a deck's cards to its health", async () => {
    window.history.replaceState(null, "", studioRouteToHash({ screen: "cards", deckUrl: kanji.url }));
    renderWorkspace(makeUseCasesFake({ listInstances: vi.fn(async () => [instanceA]), listDecks: vi.fn(async () => [kanji]) }));
    expect(await screen.findByRole("link", { name: "Health" })).toHaveAttribute(
      "href",
      studioRouteToHash({ screen: "health", instanceUrl: instanceA.url, deckUrl: kanji.url }),
    );
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
      `#/card?instance=${encodeURIComponent(instanceA.url)}&deck=${encodeURIComponent(kanji.url)}&card=${encodeURIComponent(card.url)}`,
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

  describe("a draft", () => {
    const trailOf = () => within(screen.getByRole("navigation", { name: "Breadcrumb" })).getAllByRole("link").map((link) => link.textContent);
    const draftUseCases = (draft: ReleaseDraft = courseDraft()) =>
      makeUseCasesFake({
        listInstances: vi.fn(async () => [instanceA]),
        getReleaseDraft: vi.fn(async () => draft),
        editReleaseDraft: vi.fn(async (_url, changes) => ({ ok: true as const, draft: applyDraftChanges(draft, changes) as ReleaseDraft })),
        listReleaseDrafts: vi.fn(async () => [
          { url: DRAFT_URL, instanceUrl: instanceA.url, name: "solid", version: 1, readable: true, title: { en: "Solid" }, course: true },
        ]),
      });

    it("opens from the drafts, with its trail, and its chapters, steps and questions from its outline", async () => {
      window.history.replaceState(null, "", studioRouteToHash({ screen: "drafts", instanceUrl: instanceA.url }));
      const useCases = draftUseCases();
      renderWorkspace(useCases);
      fireEvent.click(await screen.findByRole("link", { name: "Solid" }));
      expect(await screen.findByRole("heading", { level: 2, name: "Solid" })).toBeInTheDocument();
      expect(parseStudioHash(window.location.hash)).toEqual({ screen: "draft", draftUrl: DRAFT_URL });
      expect(trailOf()).toEqual(["Instances", "Decks", "Drafts", "Solid"]);
      await waitFor(() => expect(document.title).toBe("Solid – Solid Memo Studio"));
      fireEvent.click(screen.getByRole("link", { name: "Pods" }));
      expect(await screen.findByRole("heading", { level: 2, name: "Pods" })).toBeInTheDocument();
      expect(trailOf()).toEqual(["Instances", "Decks", "Drafts", "Solid", "Pods"]);
      fireEvent.click(screen.getByRole("link", { name: "Step 1" }));
      expect(await screen.findByRole("heading", { level: 2, name: "Step 1" })).toBeInTheDocument();
      expect(trailOf()).toEqual(["Instances", "Decks", "Drafts", "Solid", "Pods", "Step 1"]);
      fireEvent.click(screen.getByRole("link", { name: "What holds data?" }));
      expect(await screen.findByRole("heading", { level: 2, name: "What holds data?" })).toBeInTheDocument();
      expect(trailOf()).toEqual(["Instances", "Decks", "Drafts", "Solid", "Cards", "What holds data?"]);
      fireEvent.click(screen.getByRole("link", { name: "All cards" }));
      expect(await screen.findByRole("heading", { level: 2, name: "Questions of Solid" })).toBeInTheDocument();
      expect(trailOf()).toEqual(["Instances", "Decks", "Drafts", "Solid", "Cards"]);
      // Read once: its screens share it.
      expect(useCases.getReleaseDraft).toHaveBeenCalledTimes(1);
    });

    it("keeps the cards' view in the URL, replacing the entry", async () => {
      window.history.replaceState(null, "", studioRouteToHash({ screen: "draftCards", draftUrl: DRAFT_URL, filter: "retired", language: "en", page: 2 }));
      renderWorkspace(draftUseCases());
      expect(await screen.findByText("0 cards")).toBeInTheDocument();
      const length = window.history.length;
      choose("Show", "unasked");
      await waitFor(() => expect(parseStudioHash(window.location.hash)).toEqual({ screen: "draftCards", draftUrl: DRAFT_URL, filter: "unasked", language: "en" }));
      choose("Language", "");
      await waitFor(() => expect(parseStudioHash(window.location.hash)).toEqual({ screen: "draftCards", draftUrl: DRAFT_URL, filter: "unasked" }));
      expect(window.history.length).toBe(length);
    });

    it("leaves a chapter, step or question once it is deleted, and falls back from one the draft has not", async () => {
      vi.stubGlobal("confirm", vi.fn(() => true));
      const useCases = draftUseCases();
      window.history.replaceState(null, "", studioRouteToHash({ screen: "chapter", draftUrl: DRAFT_URL, chapter: "ch-apps" }));
      renderWorkspace(useCases);
      fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
      await waitFor(() => expect(parseStudioHash(window.location.hash)).toEqual({ screen: "draft", draftUrl: DRAFT_URL }));
      expect(await screen.findByRole("heading", { name: "Outline" })).toBeInTheDocument();
      window.location.hash = studioRouteToHash({ screen: "step", draftUrl: DRAFT_URL, step: "ch-pods-2" });
      fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
      await waitFor(() => expect(parseStudioHash(window.location.hash)).toEqual({ screen: "draft", draftUrl: DRAFT_URL }));
      window.location.hash = studioRouteToHash({ screen: "question", draftUrl: DRAFT_URL, card: "q-pods-r01" });
      fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
      await waitFor(() => expect(parseStudioHash(window.location.hash)).toEqual({ screen: "draftCards", draftUrl: DRAFT_URL }));
      window.location.hash = studioRouteToHash({ screen: "chapter", draftUrl: DRAFT_URL, chapter: "ch-gone" });
      await waitFor(() => expect(parseStudioHash(window.location.hash)).toEqual({ screen: "draft", draftUrl: DRAFT_URL }));
      vi.unstubAllGlobals();
    });

    it("names a step of no chapter, and a draft of no title, in its trail", async () => {
      const draft = courseDraft();
      window.history.replaceState(null, "", studioRouteToHash({ screen: "step", draftUrl: DRAFT_URL, step: "loose" }));
      renderWorkspace(draftUseCases({ ...draft, root: { ...draft.root, title: undefined }, steps: [...draft.steps, { id: "loose", data: { checkedBy: [] } }] }));
      expect(await screen.findByRole("heading", { level: 2, name: "loose" })).toBeInTheDocument();
      expect(trailOf()).toEqual(["Instances", "Decks", "Drafts", "Untitled draft", "loose"]);
    });

    it("names a chapter of no title by its id in the trail", async () => {
      const draft = courseDraft();
      window.history.replaceState(null, "", studioRouteToHash({ screen: "chapter", draftUrl: DRAFT_URL, chapter: "ch-pods" }));
      renderWorkspace(draftUseCases({ ...draft, chapters: draft.chapters.map((node) => ({ ...node, data: { ...node.data, title: undefined } })) }));
      expect(await screen.findByRole("heading", { level: 2, name: "Chapter ch-pods" })).toBeInTheDocument();
      expect(trailOf().at(-1)).toBe("ch-pods");
    });

    it("checks a release from the draft's overview, for a pod or the library, each problem a link to its field, the shapes when asked", async () => {
      const draft = courseDraft();
      const useCases = draftUseCases(draft);
      const chapterless = problem(`${DRAFT_URL}#ch-apps`, { code: "chapterWithoutStep", params: {} });
      const shaped = problem(DRAFT_URL, { code: "unshaped", params: {} }, { severity: "warning" });
      vi.mocked(useCases.checkReleaseDraft).mockImplementation(async (_draft, _check, _policy, options) => ({
        rules: [chapterless],
        library: [],
        drops: [],
        markdown: [],
        shapes: options?.shapes === true ? [shaped] : null,
      }));
      window.history.replaceState(null, "", studioRouteToHash({ screen: "draft", draftUrl: DRAFT_URL }));
      renderWorkspace(useCases);
      expect(await screen.findByText("The release check finds 1 problem.")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "1 problem in Apps" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("link", { name: "See the release check" }));
      expect(await screen.findByRole("heading", { level: 2, name: "Release check" })).toBeInTheDocument();
      expect(trailOf()).toEqual(["Instances", "Decks", "Drafts", "Solid", "Release check"]);
      expect(useCases.checkReleaseDraft).toHaveBeenLastCalledWith(draft, MARKDOWN_CHECK, "pod");
      fireEvent.click(screen.getByRole("button", { name: "Check against the shapes" }));
      expect(await screen.findByText("The shapes find 1 problem, among those above.")).toBeInTheDocument();
      expect(useCases.checkReleaseDraft).toHaveBeenLastCalledWith(draft, MARKDOWN_CHECK, "pod", { shapes: true });
      expect(within(screen.getByRole("region", { name: "Warnings" })).getByRole("link", { name: "This release" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("link", { name: "The Solid Memo library" }));
      await waitFor(() => expect(parseStudioHash(window.location.hash)).toEqual({ screen: "check", draftUrl: DRAFT_URL, policy: "library" }));
      await waitFor(() => expect(useCases.checkReleaseDraft).toHaveBeenLastCalledWith(draft, MARKDOWN_CHECK, "library"));
      // Another policy: the shapes are asked afresh.
      expect(await screen.findByRole("button", { name: "Check against the shapes" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("link", { name: "Has no step in use." }));
      await waitFor(() => expect(parseStudioHash(window.location.hash)).toEqual({ screen: "chapter", draftUrl: DRAFT_URL, chapter: "ch-apps", field: "steps" }));
      expect(await screen.findByRole("heading", { level: 3, name: "Steps" })).toHaveAttribute("data-arrival");
    });

    it("checks the shapes again after they failed, the draft as it was", async () => {
      const draft = courseDraft();
      const useCases = draftUseCases(draft);
      let fail = true;
      vi.mocked(useCases.checkReleaseDraft).mockImplementation(async (_draft, _check, _policy, options) => {
        if (options?.shapes === true && fail) throw new AppError("draftGone");
        return { rules: [], library: [], drops: [], markdown: [], shapes: options?.shapes === true ? [] : null };
      });
      window.history.replaceState(null, "", studioRouteToHash({ screen: "check", draftUrl: DRAFT_URL }));
      renderWorkspace(useCases);
      fireEvent.click(await screen.findByRole("button", { name: "Check against the shapes" }));
      const again = await screen.findByRole("button", { name: "Check again" });
      fail = false;
      fireEvent.click(again);
      expect(await screen.findByText("The shapes find nothing wrong.")).toBeInTheDocument();
      expect(vi.mocked(useCases.checkReleaseDraft).mock.calls.filter(([, , , options]) => options?.shapes === true)).toHaveLength(2);
    });

    it("previews the draft's listing, with its trail", async () => {
      window.history.replaceState(null, "", studioRouteToHash({ screen: "check", draftUrl: DRAFT_URL }));
      renderWorkspace(draftUseCases());
      fireEvent.click(await screen.findByRole("link", { name: "Preview the listing" }));
      expect(await screen.findByRole("heading", { level: 2, name: "Listing preview" })).toBeInTheDocument();
      expect(trailOf()).toEqual(["Instances", "Decks", "Drafts", "Solid", "Listing preview"]);
    });

    it("plays the draft in a trial from its overview, with its trail, its chapters, reviews and jumps in the URL", async () => {
      const useCases = draftUseCases();
      const trial = makeUseCasesFake({
        getCourse: vi.fn(async () => makeCourse()),
        answerCourseQuestion: vi.fn(async () => ({ effect: "introduce" as const, state: null })),
      });
      vi.mocked(useCases.openTrial).mockResolvedValue({ ok: true, trial: { useCases: trial, instance: courseInstance, deck: courseDeck } });
      window.history.replaceState(null, "", studioRouteToHash({ screen: "draft", draftUrl: DRAFT_URL }));
      renderWorkspace(useCases);
      fireEvent.click(await screen.findByRole("link", { name: "Try it out" }));
      expect(await screen.findByRole("heading", { level: 2, name: "Trial" })).toBeInTheDocument();
      expect(trailOf()).toEqual(["Instances", "Decks", "Drafts", "Solid", "Trial"]);
      fireEvent.click(await screen.findByRole("link", { name: "Start the course" }));
      expect(await screen.findByRole("heading", { level: 2, name: "Linked data" })).toBeInTheDocument();
      expect(parseStudioHash(window.location.hash)).toEqual({ screen: "trial", draftUrl: DRAFT_URL, chapter: "ch-1" });
      fireEvent.change(screen.getByRole("combobox", { name: "Chapter" }), { target: { value: "ch-2" } });
      fireEvent.click(screen.getByRole("button", { name: "Open the chapter" }));
      await waitFor(() => expect(parseStudioHash(window.location.hash)).toEqual({ screen: "trial", draftUrl: DRAFT_URL, chapter: "ch-2" }));
      // The chapter starts afresh once the jump is done.
      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("The trial is at today's date."));
      fireEvent.click(await screen.findByRole("button", { name: "On to the question" }));
      fireEvent.click(screen.getByRole("radio", { name: "A store" }));
      fireEvent.click(screen.getByRole("button", { name: "Check" }));
      fireEvent.click(await screen.findByRole("button", { name: "On to the final review" }));
      expect(parseStudioHash(window.location.hash)).toEqual({ screen: "trial", draftUrl: DRAFT_URL, chapter: "ch-2", review: true });
      expect(await screen.findByRole("heading", { level: 2, name: "Final review: Pods" })).toBeInTheDocument();
      // A final review passed leads back to the course's page.
      fireEvent.click(await screen.findByRole("button", { name: "Start the final review" }));
      fireEvent.click(screen.getByRole("radio", { name: "A store" }));
      fireEvent.click(screen.getByRole("button", { name: "Check" }));
      fireEvent.click(await screen.findByRole("button", { name: "Next" }));
      await waitFor(() => expect(parseStudioHash(window.location.hash)).toEqual({ screen: "trial", draftUrl: DRAFT_URL }));
      // One trial throughout.
      expect(useCases.openTrial).toHaveBeenCalledOnce();
    });

    it("links a trial's chapter to its final review once its steps are done, and a problem keeping a draft from play to its field", async () => {
      const useCases = draftUseCases();
      const trial = makeUseCasesFake({ getCourse: vi.fn(async () => makeCourse(["q-1", "q-2", "q-3"])) });
      vi.mocked(useCases.openTrial).mockResolvedValue({ ok: true, trial: { useCases: trial, instance: courseInstance, deck: courseDeck } });
      window.history.replaceState(null, "", studioRouteToHash({ screen: "trial", draftUrl: DRAFT_URL }));
      const view = renderWorkspace(useCases);
      expect(await screen.findByRole("link", { name: "Continue" })).toHaveAttribute(
        "href",
        studioRouteToHash({ screen: "trial", draftUrl: DRAFT_URL, chapter: "ch-1", review: true }),
      );
      view.unmount();
      vi.mocked(useCases.openTrial).mockResolvedValue({ ok: false, problems: [problem(`${DRAFT_URL}#ch-apps`, { code: "chapterWithoutStep", params: {} })] });
      renderWorkspace(useCases);
      expect(await screen.findByRole("link", { name: "Has no step in use." })).toHaveAttribute(
        "href",
        studioRouteToHash({ screen: "chapter", draftUrl: DRAFT_URL, chapter: "ch-apps", field: "steps" }),
      );
    });

    it("opens the trial from the release check", async () => {
      window.history.replaceState(null, "", studioRouteToHash({ screen: "check", draftUrl: DRAFT_URL }));
      renderWorkspace(draftUseCases());
      fireEvent.click(await screen.findByRole("link", { name: "Try it out" }));
      await waitFor(() => expect(parseStudioHash(window.location.hash)).toEqual({ screen: "trial", draftUrl: DRAFT_URL }));
    });

    it("opens a step, a question or the overview at a field", async () => {
      window.history.replaceState(null, "", studioRouteToHash({ screen: "step", draftUrl: DRAFT_URL, step: "ch-pods-1", field: "theory" }));
      renderWorkspace(draftUseCases());
      expect(await screen.findByRole("textbox", { name: "Theory" })).toHaveAttribute("data-arrival");
      window.location.hash = studioRouteToHash({ screen: "question", draftUrl: DRAFT_URL, card: "q-pods-1a", field: "front" });
      expect(await screen.findByRole("heading", { level: 2, name: "What holds data?" })).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Front" })).toHaveAttribute("data-arrival");
      window.location.hash = studioRouteToHash({ screen: "draft", draftUrl: DRAFT_URL, field: "title" });
      await waitFor(() => expect(screen.getByRole("textbox", { name: "Title" })).toHaveAttribute("data-arrival"));
    });

    it("says why a draft could not be read", async () => {
      window.history.replaceState(null, "", studioRouteToHash({ screen: "draft", draftUrl: DRAFT_URL }));
      renderWorkspace(
        makeUseCasesFake({
          listInstances: vi.fn(async () => [instanceA]),
          getReleaseDraft: vi.fn(async () => {
            throw new AppError("draftGone");
          }),
        }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent("That draft no longer exists.");
    });
  });
});
