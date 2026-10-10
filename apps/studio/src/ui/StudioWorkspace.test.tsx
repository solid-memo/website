import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { DEFAULT_CARD_QUERY } from "@solid-memo/domain/cardQuery";
import type { Card, Deck } from "@solid-memo/domain/deck";
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
import { wideScreen } from "../test/media";

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

/**
 * Queries of the main content alone, the trail and the screen: links
 * the shell around them may name too (a section, a deck, a draft, a tab)
 * are the screen's here.
 */
const inMain = () => within(screen.getByRole("main"));
/** The sidebar's links: the instance's sections, its decks and its drafts. */
const sidebar = () => within(screen.getByRole("navigation", { name: "Studio" }));
/** The sidebar, once the instance it is of is read. */
const sidebarFound = async () => within(await screen.findByRole("navigation", { name: "Studio" }));
/** The tabs of the deck or the draft shown. */
const tabsOf = (name: "Deck" | "Draft") => within(screen.getByRole("navigation", { name }));

describe("StudioWorkspace", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", window.location.pathname);
    // The layout the device remembers: none, the dock hidden.
    localStorage.clear();
  });
  // A screen widened by a test.
  afterEach(() => vi.restoreAllMocks());

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
    expect(await inMain().findByRole("link", { name: "Solid Memo" })).toHaveAttribute("href", back.getAttribute("href"));
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
    expect(inMain().queryByRole("link", { name: "Kanji N5" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cards" }));
    expect(parseStudioHash(window.location.hash)).toEqual({
      screen: "home",
      instanceUrl: instanceA.url,
      view: { filter: "verb", sort: { column: "cards", descending: false } },
    });
    expect(window.history.length).toBe(length);
    const instance = encodeURIComponent(instanceA.url);
    const deck = encodeURIComponent(verbs.url);
    expect(inMain().getByRole("link", { name: "Verbs" })).toHaveAttribute("href", `#/studio/about?deck=${deck}`);
    expect(await inMain().findByRole("link", { name: /cards of Verbs/ })).toHaveAttribute("href", `#/studio/cards?deck=${deck}`);
    expect(sidebar().getByRole("link", { name: "Name and catalogue" })).toHaveAttribute("href", `#/studio/instance?instance=${instance}`);
    // Home is the decks' section; a deck's screens have tabs, Home none.
    expect(sidebar().getByRole("link", { name: "Decks" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("navigation", { name: "Deck" })).toBeNull();
  });

  it("shows Home's views from their tabs, replacing the entry, the filter's text kept", async () => {
    window.history.replaceState(null, "", studioRouteToHash({ screen: "home", instanceUrl: instanceA.url, view: { filter: "k" } }));
    const length = window.history.length;
    renderWorkspace(makeUseCasesFake({ listInstances: vi.fn(async () => [instanceA]), listDecks: vi.fn(async () => [kanji, verbs]) }));
    const views = within(await screen.findByRole("group", { name: "Views" }));
    fireEvent.click(views.getByRole("button", { name: /^Due today/ }));
    expect(parseStudioHash(window.location.hash)).toEqual({
      screen: "home",
      instanceUrl: instanceA.url,
      view: { filter: "k", sort: { column: "due", descending: true } },
      show: "due",
    });
    fireEvent.click(views.getByRole("button", { name: /^All/ }));
    expect(parseStudioHash(window.location.hash)).toEqual({ screen: "home", instanceUrl: instanceA.url, view: { filter: "k" } });
    expect(window.history.length).toBe(length);
  });

  it("shows the deck at Home's cursor beside the table, in the URL with no Back stop, and opens it with Enter", async () => {
    wideScreen();
    window.history.replaceState(null, "", home(instanceA.url));
    const length = window.history.length;
    renderWorkspace(makeUseCasesFake({ listInstances: vi.fn(async () => [instanceA]), listDecks: vi.fn(async () => [kanji, verbs]) }));
    await inMain().findByRole("rowheader", { name: "Kanji N5" });
    const aside = within(screen.getByRole("complementary", { name: "Deck" }));
    expect(aside.getByText(/to see it here/)).toBeInTheDocument();
    document.body.focus();
    // The table takes its keys once its effects have run.
    await waitFor(() => {
      fireEvent.keyDown(document.body, { key: "j" });
      expect(parseStudioHash(window.location.hash)).toEqual({ screen: "home", instanceUrl: instanceA.url, deckUrl: kanji.url });
    });
    expect(window.history.length).toBe(length);
    expect(await aside.findByRole("heading", { name: "Kanji N5" })).toBeInTheDocument();
    expect(aside.getByRole("link", { name: "Cards – Kanji N5" })).toHaveAttribute("href", studioRouteToHash({ screen: "cards", deckUrl: kanji.url }));
    expect(inMain().getByRole("row", { current: true })).toHaveTextContent("Kanji N5");
    fireEvent.keyDown(document.activeElement!, { key: "j" });
    expect(parseStudioHash(window.location.hash)).toEqual({ screen: "home", instanceUrl: instanceA.url, deckUrl: verbs.url });
    expect(await aside.findByRole("heading", { name: "Verbs" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("checkbox", { name: "Select Verbs" }), { key: "Enter" });
    expect(await screen.findByRole("heading", { name: "About: Verbs" })).toBeInTheDocument();
    expect(window.history.length).toBe(length + 1);
  });

  it("opens what a deck says of itself from Home: its trail and title, its page in Solid Memo", async () => {
    window.history.replaceState(null, "", home(instanceA.url));
    renderWorkspace(makeUseCasesFake({ listInstances: vi.fn(async () => [instanceA]), listDecks: vi.fn(async () => [kanji]) }));
    fireEvent.click(await inMain().findByRole("link", { name: "Kanji N5" }));
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

  it("opens the instance's name and catalogue from the sidebar", async () => {
    window.history.replaceState(null, "", home(instanceA.url));
    renderWorkspace(makeUseCasesFake({ listInstances: vi.fn(async () => [instanceA]) }));
    fireEvent.click(await (await sidebarFound()).findByRole("link", { name: "Name and catalogue" }));
    expect(await screen.findByRole("heading", { name: "Instance: Deck set A" })).toBeInTheDocument();
    expect(parseStudioHash(window.location.hash)).toEqual({ screen: "instance", instanceUrl: instanceA.url });
    await waitFor(() => expect(document.title).toBe("Name and catalogue – Solid Memo Studio"));
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getByRole("link", { name: "Name and catalogue" })).toHaveAttribute("aria-current", "page");
  });

  it("opens the instance's groups from the sidebar, to arrange them as in Solid Memo", async () => {
    window.history.replaceState(null, "", home(instanceA.url));
    const useCases = makeUseCasesFake({ listInstances: vi.fn(async () => [instanceA]), listDecks: vi.fn(async () => [kanji]) });
    renderWorkspace(useCases);
    fireEvent.click(await (await sidebarFound()).findByRole("link", { name: "Groups" }));
    expect(await screen.findByRole("heading", { name: "Groups" })).toBeInTheDocument();
    expect(parseStudioHash(window.location.hash)).toEqual({ screen: "groups", instanceUrl: instanceA.url });
    await waitFor(() => expect(document.title).toBe("Groups – Solid Memo Studio"));
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getByRole("link", { name: "Decks" })).toHaveAttribute("href", home(instanceA.url));
    expect(within(trail).getByRole("link", { name: "Groups" })).toHaveAttribute("aria-current", "page");
    expect(sidebar().getByRole("link", { name: "Groups" })).toHaveAttribute("aria-current", "page");
    expect(inMain().getByRole("link", { name: "Kanji N5" })).toHaveAttribute(
      "href",
      `#/deck?instance=${encodeURIComponent(instanceA.url)}&deck=${encodeURIComponent(kanji.url)}`,
    );
  });

  it("goes to a section with a g chord, a Back stop as a link is, and to Home's filter with /", async () => {
    window.history.replaceState(null, "", home(instanceA.url));
    const useCases = makeUseCasesFake({ listInstances: vi.fn(async () => [instanceA]), listDecks: vi.fn(async () => [kanji]) });
    renderWorkspace(useCases);
    await inMain().findByRole("rowheader", { name: "Kanji N5" });
    document.body.focus();
    fireEvent.keyDown(document.body, { key: "/" });
    expect(inMain().getByRole("searchbox", { name: "Filter by name or group" })).toHaveFocus();
    const length = window.history.length;
    document.body.focus();
    fireEvent.keyDown(document.body, { key: "g" });
    fireEvent.keyDown(document.body, { key: "g" });
    expect(await screen.findByRole("heading", { name: "Groups" })).toBeInTheDocument();
    expect(parseStudioHash(window.location.hash)).toEqual({ screen: "groups", instanceUrl: instanceA.url });
    expect(window.history.length).toBe(length + 1);
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
    fireEvent.click(await inMain().findByRole("link", { name: /cards of Kanji N5/ }));
    const link = await inMain().findByRole("link", { name: "water" });
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
    // The card keeps the workbench's query, for the list beside it.
    expect(parseStudioHash(window.location.hash)).toEqual({
      screen: "card",
      deckUrl: kanji.url,
      cardUrl: card.url,
      query: { ...DEFAULT_CARD_QUERY, text: "wat" },
    });
    expect(window.history.length).toBe(length + 1);
  });

  it("opens a deck's schedule from its tabs, its trail through its cards, its leeches linked to their history and to the workbench", async () => {
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
    await inMain().findByRole("link", { name: "water" });
    fireEvent.click(tabsOf("Deck").getByRole("link", { name: "Schedule" }));
    expect(await screen.findByRole("heading", { name: "Schedule: Kanji N5" })).toBeInTheDocument();
    expect(parseStudioHash(window.location.hash)).toEqual({ screen: "schedule", deckUrl: kanji.url });
    await waitFor(() => expect(document.title).toBe("Schedule – Solid Memo Studio"));
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getByRole("link", { name: "Cards of Kanji N5" })).toHaveAttribute(
      "href",
      studioRouteToHash({ screen: "cards", deckUrl: kanji.url }),
    );
    expect(inMain().getByRole("link", { name: "water" })).toHaveAttribute(
      "href",
      studioRouteToHash({ screen: "card", deckUrl: kanji.url, cardUrl: card.url, tab: "history" }),
    );
    expect(parseStudioHash(screen.getByRole("link", { name: "Show the leeches among the deck's cards" }).getAttribute("href")!)).toEqual({
      screen: "cards",
      deckUrl: kanji.url,
      query: { ...DEFAULT_CARD_QUERY, state: "leech", sort: { key: "lapses", descending: true } },
    });
  });

  it("counts a deck's problems as its health found them, and lists them in the dock, checking it there if no screen has", async () => {
    const water = makeCard(kanji, "water");
    window.history.replaceState(null, "", studioRouteToHash({ screen: "about", deckUrl: kanji.url }));
    const useCases = makeUseCasesFake({
      listInstances: vi.fn(async () => [instanceA]),
      listDecks: vi.fn(async () => [kanji]),
      listCards: vi.fn(async () => [water]),
    });
    const checkDeck = vi.mocked(useCases.checkDeck);
    const healthy = await checkDeck.getMockImplementation()!(instanceA.url, kanji, { plain: String, check: () => [] });
    checkDeck.mockImplementation(async () => ({ ...healthy, unstated: [{ card: water, place: { tab: "content", part: "front" } }] }));
    renderWorkspace(useCases);
    expect(await screen.findByRole("heading", { level: 2, name: /Kanji N5/ })).toBeInTheDocument();
    const status = within(screen.getByRole("complementary", { name: "Studio status" }));
    // No screen has checked it: nothing is counted, and nothing checked.
    expect(status.queryByRole("button", { name: /problems?$/ })).toBeNull();
    expect(checkDeck).not.toHaveBeenCalled();
    fireEvent.click(status.getByRole("button", { name: "Panel" }));
    const dock = within(screen.getByRole("region", { name: "Panel" }));
    expect(await dock.findByRole("link", { name: "water, front: its language is not stated" })).toHaveAttribute(
      "href",
      studioRouteToHash({ screen: "card", deckUrl: kanji.url, cardUrl: water.url, tab: "content", field: "front" }),
    );
    expect(await status.findByRole("button", { name: "1 problem" })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "F8" });
    await waitFor(() => expect(parseStudioHash(window.location.hash)).toMatchObject({ screen: "card", cardUrl: water.url, field: "front" }));
  });

  it("says in the dock when a deck is healthy, and why its health could not be checked", async () => {
    window.history.replaceState(null, "", studioRouteToHash({ screen: "about", deckUrl: kanji.url }));
    localStorage.setItem("solid-memo:studioLayout.v1", JSON.stringify({ dock: true }));
    const useCases = makeUseCasesFake({ listInstances: vi.fn(async () => [instanceA]), listDecks: vi.fn(async () => [kanji]) });
    const view = renderWorkspace(useCases);
    expect(await within(await screen.findByRole("region", { name: "Panel" })).findByText("No problems found.")).toBeInTheDocument();
    view.unmount();
    vi.mocked(useCases.checkDeck).mockRejectedValue(new AppError("draftGone"));
    renderWorkspace(useCases);
    expect(await within(await screen.findByRole("region", { name: "Panel" })).findByRole("alert")).toBeInTheDocument();
  });

  it("opens the instance's health from the sidebar, a deck's from there, and a problem's field in the inspector", async () => {
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
    fireEvent.click(await (await sidebarFound()).findByRole("link", { name: "Health" }));
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
    // A card is under its deck's cards; only its own tab is the page.
    expect(tabsOf("Deck").getByRole("link", { name: "Cards" })).toHaveAttribute("aria-current", "true");
    const pages = [...document.querySelectorAll("nav.studio-tabs [aria-current=page]")].map((link) => link.textContent);
    expect(pages).toEqual(["Content"]);
  });

  it("opens the instance's library copies from the sidebar, with a link to the library in Solid Memo and each deck's about screen", async () => {
    wideScreen();
    const copy = { ...kanji, sourceUrl: "https://solid-memo.com/decks/capitals/v1.ttl" };
    window.history.replaceState(null, "", home(instanceA.url));
    renderWorkspace(
      makeUseCasesFake({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [copy]),
        listLibraryUpdates: vi.fn(async () => [{ deck: copy, series: null, version: null, newer: false }]),
      }),
    );
    fireEvent.click(await (await sidebarFound()).findByRole("link", { name: "Library copies" }));
    expect(await screen.findByRole("heading", { name: "Library copies in Deck set A" })).toBeInTheDocument();
    expect(parseStudioHash(window.location.hash)).toEqual({ screen: "library", instanceUrl: instanceA.url });
    await waitFor(() => expect(document.title).toBe("Library copies – Solid Memo Studio"));
    expect(screen.getByRole("link", { name: "Browse the deck library" })).toHaveAttribute(
      "href",
      `#/library?instance=${encodeURIComponent(instanceA.url)}`,
    );
    expect(inMain().getByRole("link", { name: "Kanji N5" })).toHaveAttribute("href", studioRouteToHash({ screen: "about", deckUrl: kanji.url }));
    // The copy at the cursor, beside the table.
    const aside = within(screen.getByRole("complementary", { name: "Upgrade" }));
    expect(aside.getByText(/to see what upgrading it would change/)).toBeInTheDocument();
    document.body.focus();
    await waitFor(() => {
      fireEvent.keyDown(document.body, { key: "j" });
      expect(aside.getByRole("heading", { name: "Kanji N5" })).toBeInTheDocument();
    });
    expect(parseStudioHash(window.location.hash)).toEqual({ screen: "library", instanceUrl: instanceA.url });
  });

  it("lists the instance's decks and drafts in the sidebar, the draft or deck shown marked, and opens the drafts' section", async () => {
    window.history.replaceState(null, "", home(instanceA.url));
    const useCases = makeUseCasesFake({
      listInstances: vi.fn(async () => [instanceA]),
      listDecks: vi.fn(async () => [kanji]),
      listReleaseDrafts: vi.fn(async () => [
        { url: DRAFT_URL, instanceUrl: instanceA.url, name: "solid", version: 1, readable: true, title: { en: "Solid" }, course: true },
      ]),
      getReleaseDraft: vi.fn(async () => courseDraft()),
    });
    renderWorkspace(useCases);
    const drafts = within(await screen.findByRole("list", { name: "Drafts" }));
    expect(drafts.getByRole("link", { name: "Solid" })).toHaveAttribute("href", studioRouteToHash({ screen: "draft", draftUrl: DRAFT_URL }));
    expect(within(screen.getByRole("list", { name: "Decks" })).getByRole("link", { name: "Kanji N5" })).toHaveAttribute(
      "href",
      studioRouteToHash({ screen: "cards", deckUrl: kanji.url }),
    );
    // Home lists them no more.
    expect(screen.queryByRole("region", { name: "Drafts" })).toBeNull();
    fireEvent.click(sidebar().getByRole("link", { name: "Drafts" }));
    expect(await screen.findByRole("heading", { name: "Drafts of releases in Deck set A" })).toBeInTheDocument();
    expect(parseStudioHash(window.location.hash)).toEqual({ screen: "drafts", instanceUrl: instanceA.url });
    await waitFor(() => expect(document.title).toBe("Drafts – Solid Memo Studio"));
    const trail = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(trail).getByRole("link", { name: "Drafts" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(drafts.getByRole("link", { name: "Solid" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Solid" })).toBeInTheDocument();
    expect(drafts.getByRole("link", { name: "Solid" })).toHaveAttribute("aria-current", "true");
    fireEvent.click(within(screen.getByRole("list", { name: "Decks" })).getByRole("link", { name: "Kanji N5" }));
    expect(await screen.findByRole("heading", { name: "Cards: Kanji N5" })).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Decks" })).getByRole("link", { name: "Kanji N5" })).toHaveAttribute("aria-current", "true");
  });

  it("switches to another of the user's instances from the header", async () => {
    window.history.replaceState(null, "", home(instanceA.url));
    renderWorkspace(makeUseCasesFake({ listInstances: vi.fn(async () => [instanceA, instanceB]), listDecks: vi.fn(async () => [kanji]) }));
    fireEvent.click(await screen.findByRole("button", { name: "Switch instance: Deck set A" }));
    expect(screen.getByRole("menuitem", { name: "Deck set B" })).toHaveAttribute("href", home(instanceB.url));
    expect(screen.getByRole("menuitem", { name: "All instances" })).toHaveAttribute("href", "#/studio/instances");
  });

  it("has no sidebar, and no switch of instance, on the instances", async () => {
    renderWorkspace(makeUseCasesFake({ listInstances: vi.fn(async () => [instanceA, instanceB]) }));
    expect(await screen.findByRole("heading", { name: "Choose a Solid Memo instance" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Studio" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Switch instance/ })).toBeNull();
  });

  it("opens import and export from the sidebar, the decks ticked in the URL, and Home's selected decks export them", async () => {
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
    expect(inMain().getByRole("link", { name: "Export" })).toHaveAttribute(
      "href",
      studioRouteToHash({ screen: "transfer", instanceUrl: instanceA.url, deckUrls: [verbs.url] }),
    );
    fireEvent.click(sidebar().getByRole("link", { name: "Import and export" }));
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
    expect(await inMain().findByRole("link", { name: "Capitals" })).toHaveAttribute(
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

  it("gives a deck's screens its tabs, the one shown current, and goes between them with ] and [ or by number", async () => {
    window.history.replaceState(null, "", studioRouteToHash({ screen: "cards", deckUrl: kanji.url }));
    renderWorkspace(makeUseCasesFake({ listInstances: vi.fn(async () => [instanceA]), listDecks: vi.fn(async () => [kanji]) }));
    const tabs = await screen.findByRole("navigation", { name: "Deck" });
    expect(
      within(tabs)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href"), link.getAttribute("aria-current")]),
    ).toEqual([
      ["Cards", studioRouteToHash({ screen: "cards", deckUrl: kanji.url }), "page"],
      ["Schedule", studioRouteToHash({ screen: "schedule", deckUrl: kanji.url }), null],
      ["Health", studioRouteToHash({ screen: "health", instanceUrl: instanceA.url, deckUrl: kanji.url }), null],
      ["About", studioRouteToHash({ screen: "about", deckUrl: kanji.url }), null],
      ["Export", studioRouteToHash({ screen: "transfer", instanceUrl: instanceA.url, deckUrls: [kanji.url] }), null],
    ]);
    // Not the deck's screens' own links any more.
    expect(inMain().queryByRole("link", { name: "Schedule, lapses and leeches" })).toBeNull();
    const length = window.history.length;
    document.body.focus();
    fireEvent.keyDown(document.body, { key: "]" });
    expect(await screen.findByRole("heading", { name: "Schedule: Kanji N5" })).toBeInTheDocument();
    expect(window.history.length).toBe(length + 1);
    document.body.focus();
    fireEvent.keyDown(document.body, { key: "4" });
    expect(await screen.findByRole("heading", { name: "About: Kanji N5" })).toBeInTheDocument();
    document.body.focus();
    fireEvent.keyDown(document.body, { key: "[" });
    expect(await screen.findByRole("heading", { name: "Health of Kanji N5" })).toBeInTheDocument();
    expect(tabsOf("Deck").getByRole("link", { name: "Health" })).toHaveAttribute("aria-current", "page");
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

  describe("on a screen wide enough, a card beside its deck's cards", () => {
    beforeEach(wideScreen);
    afterEach(() => vi.restoreAllMocks());

    const many = Array.from({ length: 12 }, (_, i) => makeCard(kanji, `c${i}`));
    const detail = () => within(screen.getByRole("complementary", { name: "Card" }));
    /** The card beside the list, once it is read. */
    const detailFound = async () => within(await screen.findByRole("complementary", { name: "Card" }));
    const list = () => within(screen.getByRole("table", { name: "The cards of Kanji N5" }));
    const useCasesOf = (cards: Card[]) =>
      makeUseCasesFake({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => [kanji]),
        listCards: vi.fn(async () => cards),
        updateCard: vi.fn(async (_deck: Deck, card: Card) => card),
      });

    it("goes from card to card with j and k, Previous and Next, each at its page of the list and no Back stop, and closes back to the list", async () => {
      const route = { screen: "card" as const, deckUrl: kanji.url, cardUrl: many[9]!.url, query: { ...DEFAULT_CARD_QUERY, size: 10 as const } };
      window.history.replaceState(null, "", studioRouteToHash(route));
      renderWorkspace(useCasesOf(many));
      expect(await (await detailFound()).findByRole("heading", { name: "Card: c9" })).toBeInTheDocument();
      await waitFor(() => expect(document.title).toBe("c9 – Solid Memo Studio"));
      await screen.findByRole("table", { name: "The cards of Kanji N5" });
      expect(list().getByRole("row", { name: /c9/ })).toHaveAttribute("aria-current", "true");
      expect(inMain().getByRole("heading", { name: "Cards: Kanji N5" })).toBeInTheDocument();
      const length = window.history.length;

      await waitFor(() => expect(detail().getByRole("button", { name: "Next card" })).toBeEnabled());
      // From the page's last row, j shows the next page's first.
      document.body.focus();
      fireEvent.keyDown(document.body, { key: "j" });
      expect(await detail().findByRole("heading", { name: "Card: c10" })).toBeInTheDocument();
      expect(parseStudioHash(window.location.hash)).toEqual({ ...route, cardUrl: many[10]!.url, query: { ...route.query, page: 2 } });
      expect(list().getAllByRole("rowheader").map((cell) => cell.textContent)).toEqual(["c10", "c11"]);
      await waitFor(() => expect(list().getByRole("link", { name: "c10" })).toHaveFocus());
      fireEvent.click(detail().getByRole("button", { name: "Next card" }));
      expect(await detail().findByRole("heading", { name: "Card: c11" })).toBeInTheDocument();
      expect(detail().getByRole("button", { name: "Next card" })).toBeDisabled();
      document.body.focus();
      fireEvent.keyDown(document.body, { key: "k" });
      expect(await detail().findByRole("heading", { name: "Card: c10" })).toBeInTheDocument();
      fireEvent.click(detail().getByRole("button", { name: "Previous card" }));
      expect(await detail().findByRole("heading", { name: "Card: c9" })).toBeInTheDocument();
      expect(parseStudioHash(window.location.hash)).toEqual(route);
      expect(window.history.length).toBe(length);

      fireEvent.click(detail().getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByRole("complementary", { name: "Card" })).toBeNull());
      expect(parseStudioHash(window.location.hash)).toEqual({ screen: "cards", deckUrl: kanji.url, query: route.query });
      expect(window.history.length).toBe(length + 1);
      // The focus, lost with the card, goes back to its row.
      await waitFor(() => expect(list().getByRole("link", { name: "c9" })).toHaveFocus());
    });

    it("opens a card of the list beside it, its heading taking the focus, on the tab shown and with the list's query", async () => {
      const [water, fire, ice] = [makeCard(kanji, "water"), makeCard(kanji, "fire"), makeCard(kanji, "ice")];
      window.history.replaceState(null, "", studioRouteToHash({ screen: "cards", deckUrl: kanji.url }));
      renderWorkspace(useCasesOf([water!, fire!, ice!]));
      fireEvent.input(await screen.findByRole("searchbox", { name: "Search" }), { target: { value: "i" } });
      const length = window.history.length;
      fireEvent.click(list().getByRole("link", { name: "fire" }));
      const route = { screen: "card" as const, deckUrl: kanji.url, cardUrl: fire!.url, query: { ...DEFAULT_CARD_QUERY, text: "i" } };
      expect(await (await detailFound()).findByRole("heading", { name: "Card: fire" })).toBeInTheDocument();
      await waitFor(() => expect(detail().getByRole("heading", { name: "Card: fire" })).toHaveFocus());
      expect(parseStudioHash(window.location.hash)).toEqual(route);
      expect(window.history.length).toBe(length + 1);
      // The list read before the card opened: the card after it is there.
      expect(detail().getByRole("button", { name: "Previous card" })).toBeDisabled();
      expect(detail().getByRole("button", { name: "Next card" })).toBeEnabled();
      // The card's tab is kept from card to card; its field is not.
      fireEvent.click(detail().getByRole("link", { name: "History" }));
      expect(await detail().findByText(/No answers/)).toBeInTheDocument();
      expect(list().getByRole("link", { name: "fire" })).toHaveAttribute("href", studioRouteToHash({ ...route, tab: "history" }));
      // Not in the list: no card before or after it.
      fireEvent.input(screen.getByRole("searchbox", { name: "Search" }), { target: { value: "zz" } });
      expect(await screen.findByText("No card matches.")).toBeInTheDocument();
      expect(detail().getByRole("button", { name: "Previous card" })).toBeDisabled();
      expect(detail().getByRole("button", { name: "Next card" })).toBeDisabled();
    });

    it("asks before a card's edits not saved are left, by a key, a card of the list, a tab or Close, and saves them first if asked", async () => {
      const [water, fire] = [makeCard(kanji, "water"), makeCard(kanji, "fire")];
      const route = { screen: "card" as const, deckUrl: kanji.url, cardUrl: water!.url };
      window.history.replaceState(null, "", studioRouteToHash(route));
      const useCases = useCasesOf([water!, fire!]);
      renderWorkspace(useCases);
      fireEvent.input(await (await detailFound()).findByLabelText("Front"), { target: { value: "wet" } });
      // Once the list beside it is read, and its keys taken.
      await waitFor(() => expect(detail().getByRole("button", { name: "Next card" })).toBeEnabled());
      const question = () => screen.queryByRole("dialog", { name: "Save your changes?" });
      const answer = (name: string) => fireEvent.click(within(question()!).getByRole("button", { name }));

      document.body.focus();
      fireEvent.keyDown(document.body, { key: "j" });
      expect(question()).toBeInTheDocument();
      answer("Stay");
      fireEvent.click(detail().getByRole("button", { name: "Close" }));
      answer("Stay");
      fireEvent.click(detail().getByRole("link", { name: "Schedule" }));
      answer("Stay");
      expect(parseStudioHash(window.location.hash)).toEqual(route);
      expect(detail().getByLabelText("Front")).toHaveValue("wet");

      const length = window.history.length;
      fireEvent.click(list().getByRole("link", { name: "fire" }));
      answer("Discard");
      expect(await detail().findByRole("heading", { name: "Card: fire" })).toBeInTheDocument();
      expect(window.history.length).toBe(length + 1);
      expect(useCases.updateCard).not.toHaveBeenCalled();

      fireEvent.input(detail().getByLabelText("Front"), { target: { value: "blaze" } });
      fireEvent.click(detail().getByRole("button", { name: "Previous card" }));
      answer("Save");
      expect(await detail().findByRole("heading", { name: "Card: water" })).toBeInTheDocument();
      expect(useCases.updateCard).toHaveBeenCalledWith(kanji, fire, expect.objectContaining({ front: { en: "blaze" } }));
    });
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
    expect(await inMain().findByRole("alert")).toHaveTextContent("Cards unreadable");
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
    expect(await inMain().findByRole("alert")).toHaveTextContent("Catalog unreadable");
  });

  it("says why the decks could not be read on the workbench, and in the sidebar, but not on Home", async () => {
    window.history.replaceState(null, "", studioRouteToHash({ screen: "cards", deckUrl: kanji.url }));
    renderWorkspace(
      makeUseCasesFake({
        listInstances: vi.fn(async () => [instanceA]),
        listDecks: vi.fn(async () => {
          throw new Error("Catalog unreadable");
        }),
      }),
    );
    expect(await inMain().findByRole("alert")).toHaveTextContent("Catalog unreadable");
    window.location.hash = home(instanceA.url);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(await screen.findByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
    expect(inMain().queryByText("Catalog unreadable")).toBeNull();
    expect(sidebar().getByText("Catalog unreadable")).toBeInTheDocument();
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
      fireEvent.click(await inMain().findByRole("link", { name: "Solid" }));
      expect(await screen.findByRole("heading", { level: 2, name: "Solid" })).toBeInTheDocument();
      expect(parseStudioHash(window.location.hash)).toEqual({ screen: "draft", draftUrl: DRAFT_URL });
      expect(trailOf()).toEqual(["Instances", "Decks", "Drafts", "Solid"]);
      await waitFor(() => expect(document.title).toBe("Solid – Solid Memo Studio"));
      fireEvent.click(inMain().getByRole("link", { name: "Pods" }));
      expect(await screen.findByRole("heading", { level: 2, name: "Pods" })).toBeInTheDocument();
      expect(trailOf()).toEqual(["Instances", "Decks", "Drafts", "Solid", "Pods"]);
      fireEvent.click(inMain().getByRole("link", { name: "Step 1" }));
      expect(await screen.findByRole("heading", { level: 2, name: "Step 1" })).toBeInTheDocument();
      expect(trailOf()).toEqual(["Instances", "Decks", "Drafts", "Solid", "Pods", "Step 1"]);
      fireEvent.click(inMain().getByRole("link", { name: "What holds data?" }));
      expect(await screen.findByRole("heading", { level: 2, name: "What holds data?" })).toBeInTheDocument();
      expect(trailOf()).toEqual(["Instances", "Decks", "Drafts", "Solid", "Cards", "What holds data?"]);
      expect(tabsOf("Draft").getByRole("link", { name: "Cards" })).toHaveAttribute("aria-current", "true");
      fireEvent.click(tabsOf("Draft").getByRole("link", { name: "Cards" }));
      expect(await screen.findByRole("heading", { level: 2, name: "Questions of Solid" })).toBeInTheDocument();
      expect(trailOf()).toEqual(["Instances", "Decks", "Drafts", "Solid", "Cards"]);
      // Read once: its screens share it.
      expect(useCases.getReleaseDraft).toHaveBeenCalledTimes(1);
    });

    it("says in the status bar whether the draft is saved, while its text waits to be written and once it is", async () => {
      window.history.replaceState(null, "", studioRouteToHash({ screen: "chapter", draftUrl: DRAFT_URL, chapter: "ch-pods" }));
      const useCases = draftUseCases();
      renderWorkspace(useCases);
      const status = within(screen.getByRole("complementary", { name: "Studio status" }));
      expect(await status.findByText(instanceA.name)).toBeInTheDocument();
      const title = await screen.findByRole("textbox", { name: "Title" });
      await waitFor(() => expect(title).toBeEnabled());
      expect(status.getByText("Draft saved")).toBeInTheDocument();
      fireEvent.input(title, { target: { value: "Pods!" } });
      expect(status.getByText("Saving the draft…")).toBeInTheDocument();
      expect(await status.findByText("Draft saved", {}, { timeout: 3000 })).toBeInTheDocument();
      expect(useCases.editReleaseDraft).toHaveBeenCalledTimes(1);
    });

    it("says in the status bar that the draft's last change was not saved, when its write failed", async () => {
      window.history.replaceState(null, "", studioRouteToHash({ screen: "chapter", draftUrl: DRAFT_URL, chapter: "ch-pods" }));
      const useCases = draftUseCases();
      useCases.editReleaseDraft = vi.fn(async () => {
        throw new Error("Pod unreachable");
      });
      renderWorkspace(useCases);
      const status = within(screen.getByRole("complementary", { name: "Studio status" }));
      const title = await screen.findByRole("textbox", { name: "Title" });
      await waitFor(() => expect(title).toBeEnabled());
      fireEvent.input(title, { target: { value: "Pods!" } });
      expect(await status.findByText("Last change not saved", {}, { timeout: 3000 })).toBeInTheDocument();
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
      choose("Show", "");
      fireEvent.click(await inMain().findByRole("button", { name: "Id" }));
      expect(parseStudioHash(window.location.hash)).toEqual({ screen: "draftCards", draftUrl: DRAFT_URL, sort: { key: "id", descending: false } });
      expect(window.history.length).toBe(length);
      // Enter opens a card's editor, a Back stop as its link is.
      const box = within(inMain().getAllByRole("row")[1]!).getByRole("checkbox");
      box.focus();
      // The table takes its keys once its effects have run.
      await waitFor(() => {
        fireEvent.keyDown(box, { key: "Enter" });
        expect(parseStudioHash(window.location.hash)).toMatchObject({ screen: "question", draftUrl: DRAFT_URL });
      });
      expect(window.history.length).toBe(length + 1);
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

    it("checks a release from the draft's tabs, for a pod or the library, each problem a link to its field, the shapes when asked", async () => {
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
      expect(inMain().getByRole("link", { name: "1 problem in Apps" })).toBeInTheDocument();
      // Its tab counts them too.
      fireEvent.click(await tabsOf("Draft").findByRole("link", { name: "Check 1 problem" }));
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

    it("shows a course's outline in the aside on its screens but the overview, the page shown marked, each badge a link to its first problem's field", async () => {
      const draft = courseDraft();
      const useCases = draftUseCases(draft);
      const chapterless = problem(`${DRAFT_URL}#ch-apps`, { code: "chapterWithoutStep", params: {} });
      vi.mocked(useCases.checkReleaseDraft).mockResolvedValue({ rules: [chapterless], library: [], drops: [], markdown: [], shapes: null });
      window.history.replaceState(null, "", studioRouteToHash({ screen: "chapter", draftUrl: DRAFT_URL, chapter: "ch-pods" }));
      renderWorkspace(useCases);
      expect(await screen.findByRole("heading", { level: 2, name: "Pods" })).toBeInTheDocument();
      // The test DOM's screen is not wide: the aside is a drawer, closed at first.
      fireEvent.click(screen.getByRole("button", { name: "Outline" }));
      const aside = within(screen.getByRole("complementary", { name: "Outline" }));
      expect(aside.getByRole("link", { name: "Pods" })).toHaveAttribute("aria-current", "page");
      expect(await aside.findByRole("link", { name: "1 problem in Apps" })).toHaveAttribute(
        "href",
        studioRouteToHash({ screen: "chapter", draftUrl: DRAFT_URL, chapter: "ch-apps", field: "steps" }),
      );
      // Arranged there too, as on the overview.
      fireEvent.click(aside.getByRole("button", { name: "Actions for Pods" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
      await waitFor(() => expect(useCases.editReleaseDraft).toHaveBeenCalledWith(DRAFT_URL, [{ kind: "moveChapter", id: "ch-pods", to: 1 }]));
      // The overview shows the outline itself, to arrange: the aside has none there.
      fireEvent.click(tabsOf("Draft").getByRole("link", { name: "Overview" }));
      expect(await screen.findByRole("heading", { level: 2, name: "Solid" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Outline" })).toBeNull();
      expect(screen.getAllByRole("list", { name: "Outline" })).toHaveLength(1);
    });

    it("counts the draft's problems in its Check tab and the status bar, lists them in the dock, and goes to each one's field with F8", async () => {
      const draft = courseDraft();
      const useCases = draftUseCases(draft);
      const chapterless = problem(`${DRAFT_URL}#ch-apps`, { code: "chapterWithoutStep", params: {} });
      const backless = problem(`${DRAFT_URL}#q-pods-1a`, { code: "noBack", params: {} });
      vi.mocked(useCases.checkReleaseDraft).mockResolvedValue({ rules: [backless, chapterless], library: [], drops: [], markdown: [], shapes: null });
      window.history.replaceState(null, "", studioRouteToHash({ screen: "preview", draftUrl: DRAFT_URL }));
      renderWorkspace(useCases);
      expect(await screen.findByRole("link", { name: "Check 2 problems" })).toBeInTheDocument();
      const status = within(screen.getByRole("complementary", { name: "Studio status" }));
      fireEvent.click(status.getByRole("button", { name: "2 problems" }));
      const dock = within(screen.getByRole("region", { name: "Panel" }));
      expect(dock.getByRole("tab", { name: "Problems (2)" })).toHaveAttribute("aria-selected", "true");
      expect(within(dock.getByRole("list", { name: "Errors" })).getByRole("link", { name: "Has no step in use." })).toHaveAttribute(
        "href",
        studioRouteToHash({ screen: "chapter", draftUrl: DRAFT_URL, chapter: "ch-apps", field: "steps" }),
      );
      fireEvent.keyDown(document.body, { key: "F8" });
      await waitFor(() => expect(parseStudioHash(window.location.hash)).toMatchObject({ screen: "question", card: "q-pods-1a" }));
      fireEvent.keyDown(document.body, { key: "F8" });
      await waitFor(() => expect(parseStudioHash(window.location.hash)).toEqual({ screen: "chapter", draftUrl: DRAFT_URL, chapter: "ch-apps", field: "steps" }));
      expect(await screen.findByRole("heading", { level: 3, name: "Steps" })).toHaveFocus();
    });

    it("says in the dock while the draft is checked, when it is clear, and why it could not be checked", async () => {
      const useCases = draftUseCases();
      let finish!: (check: Awaited<ReturnType<UseCases["checkReleaseDraft"]>>) => void;
      vi.mocked(useCases.checkReleaseDraft).mockImplementation(() => new Promise((resolve) => (finish = resolve)));
      window.history.replaceState(null, "", studioRouteToHash({ screen: "preview", draftUrl: DRAFT_URL }));
      const view = renderWorkspace(useCases);
      fireEvent.click(await screen.findByRole("button", { name: "Panel" }));
      const dock = within(screen.getByRole("region", { name: "Panel" }));
      expect(await dock.findByText("Looking for problems…")).toBeInTheDocument();
      await waitFor(() => expect(finish).toBeDefined());
      finish({ rules: [], library: [], drops: [], markdown: [], shapes: null });
      expect(await dock.findByText("No problems found.")).toBeInTheDocument();
      expect(tabsOf("Draft").getByRole("link", { name: "Check" })).toBeInTheDocument();
      view.unmount();
      vi.mocked(useCases.checkReleaseDraft).mockRejectedValue(new AppError("draftGone"));
      renderWorkspace(useCases);
      expect(await within(await screen.findByRole("region", { name: "Panel" })).findByRole("alert")).toBeInTheDocument();
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

    it("checks the draft again when asked after the library's index could not be read, and then reads it", async () => {
      const draft = courseDraft();
      const useCases = draftUseCases(draft);
      let unread = true;
      vi.mocked(useCases.checkReleaseDraft).mockImplementation(async () => ({
        rules: [],
        library: unread ? [problem(DRAFT_URL, { code: "libraryUnread", params: {} })] : [],
        drops: [],
        markdown: [],
        shapes: null,
      }));
      window.history.replaceState(null, "", studioRouteToHash({ screen: "check", draftUrl: DRAFT_URL, policy: "library" }));
      renderWorkspace(useCases);
      const again = await screen.findByRole("button", { name: "Check the draft again" });
      unread = false;
      fireEvent.click(again);
      expect(await screen.findByText("No problems found.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Check the draft again" })).toBeNull();
      expect(vi.mocked(useCases.checkReleaseDraft).mock.calls.filter(([, , policy]) => policy === "library")).toHaveLength(2);
    });

    it("edits the release's metadata and provenance from the draft's tabs, with its trail, writing each change", async () => {
      window.history.replaceState(null, "", studioRouteToHash({ screen: "draft", draftUrl: DRAFT_URL }));
      const useCases = draftUseCases();
      renderWorkspace(useCases);
      fireEvent.click(within(await screen.findByRole("navigation", { name: "Draft" })).getByRole("link", { name: "Release" }));
      expect(await screen.findByRole("heading", { level: 2, name: "Release metadata and provenance" })).toBeInTheDocument();
      expect(parseStudioHash(window.location.hash)).toEqual({ screen: "release", draftUrl: DRAFT_URL });
      expect(trailOf()).toEqual(["Instances", "Decks", "Drafts", "Solid", "Release"]);
      // Nothing is changed until the instance's data check is done.
      await waitFor(() => expect(screen.getByRole("combobox", { name: "Licence" })).toBeEnabled());
      choose("Licence", "https://creativecommons.org/publicdomain/zero/1.0/");
      await waitFor(() => expect(useCases.editReleaseDraft).toHaveBeenCalledWith(DRAFT_URL, [{ kind: "setLicense", license: "https://creativecommons.org/publicdomain/zero/1.0/" }]));
    });

    it("opens the release screen at the part a problem is in", async () => {
      window.history.replaceState(null, "", studioRouteToHash({ screen: "release", draftUrl: DRAFT_URL, field: "sources" }));
      renderWorkspace(draftUseCases());
      expect(await screen.findByRole("heading", { level: 3, name: "Sources" })).toHaveAttribute("data-arrival", "true");
    });

    it("publishes a draft from its release screen once the user says it will be public, then shows it released, and starts its next version", async () => {
      window.history.replaceState(null, "", studioRouteToHash({ screen: "release", draftUrl: DRAFT_URL }));
      const draft = courseDraft();
      const target = `${instanceA.url}releases/solid/v1.ttl`;
      const nextUrl = `${instanceA.url}drafts/solid/v2/release.ttl`;
      const useCases = draftUseCases(draft);
      vi.mocked(useCases.publishRelease).mockImplementation(async (_draftUrl, url) => {
        vi.mocked(useCases.getReleaseDraft).mockResolvedValue({ ...draft, root: { ...draft.root, releasedAs: url } });
        return { url, public: false };
      });
      vi.mocked(useCases.createReleaseDraft).mockResolvedValue({
        draft: { url: nextUrl, instanceUrl: instanceA.url, name: "solid", version: 2, readable: true, title: { en: "Solid" }, course: true },
      });
      renderWorkspace(useCases);
      expect(await screen.findByText(`The release will be published at ${target}.`)).toBeInTheDocument();
      expect(await screen.findByText(/The release check finds no errors/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("checkbox", { name: /this release will be public/ }));
      const publish = screen.getByRole("button", { name: "Publish to my Pod" });
      // Nothing is published until the instance's data check is done.
      await waitFor(() => expect(publish).toBeEnabled());
      fireEvent.click(publish);
      expect(await screen.findByRole("link", { name: target })).toHaveAttribute("href", target);
      expect(useCases.publishRelease).toHaveBeenCalledWith(DRAFT_URL, target, MARKDOWN_CHECK);
      // What the publishing said, not asked again: the pod would not make it public.
      expect(screen.getByText(/Only you can read it/)).toBeInTheDocument();
      expect(useCases.isReleasePublic).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Make it public" }));
      await waitFor(() => expect(useCases.makeReleasePublic).toHaveBeenCalledWith(target));
      expect(await screen.findByText("Anyone with its address can read it.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Download .ttl" }));
      await waitFor(() => expect(useCases.downloadRelease).toHaveBeenCalledWith(DRAFT_URL));
      fireEvent.click(screen.getByRole("button", { name: "Start the next version" }));
      await waitFor(() => expect(parseStudioHash(window.location.hash)).toEqual({ screen: "draft", draftUrl: nextUrl }));
      expect(useCases.createReleaseDraft).toHaveBeenCalledWith(instanceA.url, { kind: "nextVersionOf", url: target });
    });

    it("opens a draft made on the drafts screen, which the activity tells of", async () => {
      window.history.replaceState(null, "", studioRouteToHash({ screen: "drafts", instanceUrl: instanceA.url }));
      const useCases = draftUseCases();
      vi.mocked(useCases.listDecks).mockResolvedValue([kanji]);
      vi.mocked(useCases.createReleaseDraft).mockResolvedValue({
        draft: { url: DRAFT_URL, instanceUrl: instanceA.url, name: "solid", version: 1, readable: true, title: { en: "Solid" }, course: true },
      });
      renderWorkspace(useCases);
      fireEvent.click(await screen.findByRole("radio", { name: "A deck of this instance" }));
      const create = screen.getByRole("button", { name: "Create the draft" });
      await waitFor(() => expect(create).toBeEnabled());
      fireEvent.click(create);
      await waitFor(() => expect(parseStudioHash(window.location.hash)).toEqual({ screen: "draft", draftUrl: DRAFT_URL }));
      expect(await screen.findByRole("heading", { level: 2, name: "Solid" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Panel" }));
      fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
      expect(screen.getByRole("tabpanel", { name: "Activity" })).toHaveTextContent("Created the draft Solid, version 1.");
    });

    it("lists the instance's releases from the sidebar, with their trail, and opens a next version started", async () => {
      window.history.replaceState(null, "", home(instanceA.url));
      const target = `${instanceA.url}releases/solid/v1.ttl`;
      const useCases = draftUseCases();
      vi.mocked(useCases.listPublishedReleases).mockResolvedValue([{ url: target, public: true }]);
      vi.mocked(useCases.listReleaseDrafts).mockResolvedValue([
        { url: DRAFT_URL, instanceUrl: instanceA.url, name: "solid", version: 1, readable: true, title: { en: "Solid" }, course: true, releasedAs: target },
      ]);
      vi.mocked(useCases.createReleaseDraft).mockResolvedValue({
        draft: { url: DRAFT_URL, instanceUrl: instanceA.url, name: "solid", version: 1, readable: true, title: { en: "Solid" }, course: true },
      });
      renderWorkspace(useCases);
      fireEvent.click(await (await sidebarFound()).findByRole("link", { name: "Releases" }));
      expect(await screen.findByRole("heading", { level: 2, name: "Releases published from Deck set A" })).toBeInTheDocument();
      expect(parseStudioHash(window.location.hash)).toEqual({ screen: "releases", instanceUrl: instanceA.url });
      expect(trailOf()).toEqual(["Instances", "Decks", "Releases"]);
      await waitFor(() => expect(document.title).toBe("Releases – Solid Memo Studio"));
      // The draft it was published from.
      expect(await inMain().findByRole("link", { name: "Solid, version 1" })).toHaveAttribute("href", studioRouteToHash({ screen: "draft", draftUrl: DRAFT_URL }));
      const start = await screen.findByRole("button", { name: "Start the next version of solid, version 1" });
      await waitFor(() => expect(start).toBeEnabled());
      fireEvent.click(start);
      expect(await screen.findByRole("heading", { level: 2, name: "Solid" })).toBeInTheDocument();
      expect(parseStudioHash(window.location.hash)).toEqual({ screen: "draft", draftUrl: DRAFT_URL });
      // The drafts screen links to the releases too.
      fireEvent.click(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("link", { name: "Drafts" }));
      expect(await inMain().findByRole("link", { name: "Published releases" })).toHaveAttribute(
        "href",
        studioRouteToHash({ screen: "releases", instanceUrl: instanceA.url }),
      );
    });

    it("previews the draft's listing from its tabs, with its trail", async () => {
      window.history.replaceState(null, "", studioRouteToHash({ screen: "check", draftUrl: DRAFT_URL }));
      renderWorkspace(draftUseCases());
      fireEvent.click(within(await screen.findByRole("navigation", { name: "Draft" })).getByRole("link", { name: "Preview" }));
      expect(await screen.findByRole("heading", { level: 2, name: "Listing preview" })).toBeInTheDocument();
      expect(trailOf()).toEqual(["Instances", "Decks", "Drafts", "Solid", "Listing preview"]);
    });

    it("compares a next version with the release it follows from its tabs, with its trail, each change a link to its editor", async () => {
      const previous = courseDraft();
      const draft: ReleaseDraft = {
        ...previous,
        root: { ...previous.root, version: "2", prev: "https://pod.example/releases/solid/v1.ttl" },
        cards: previous.cards.map((node) => (node.id === "q-pods-1a" ? { ...node, data: { ...node.data, back: { en: "Your pod" } } } : node)),
      };
      const useCases = draftUseCases(draft);
      vi.mocked(useCases.diffReleaseDraft).mockResolvedValue({
        previous: { ...previous, url: "https://pod.example/releases/solid/v1.ttl" },
        diff: { about: [], subjects: [{ kind: "card", id: "q-pods-1a", status: "changed" }], unchanged: { chapter: 2, step: 2, card: 1, distractor: 1 } },
        problems: [],
        upgrade: { newer: true, plan: null, lost: { cards: [], chapters: [] } },
      });
      window.history.replaceState(null, "", studioRouteToHash({ screen: "draft", draftUrl: DRAFT_URL }));
      renderWorkspace(useCases);
      fireEvent.click(within(await screen.findByRole("navigation", { name: "Draft" })).getByRole("link", { name: "Changes" }));
      expect(await screen.findByRole("heading", { level: 2, name: "Changes since the previous version" })).toBeInTheDocument();
      expect(trailOf()).toEqual(["Instances", "Decks", "Drafts", "Solid", "Changes"]);
      const changed = await inMain().findByRole("link", { name: "What holds data?" });
      expect(useCases.diffReleaseDraft).toHaveBeenCalledWith(draft);
      fireEvent.click(changed);
      await waitFor(() => expect(parseStudioHash(window.location.hash)).toEqual({ screen: "question", draftUrl: DRAFT_URL, card: "q-pods-1a" }));
    });

    it("gives a draft's screens its tabs, the one shown current, with no comparison for a first version", async () => {
      window.history.replaceState(null, "", studioRouteToHash({ screen: "draft", draftUrl: DRAFT_URL }));
      renderWorkspace(draftUseCases());
      const tabs = await screen.findByRole("navigation", { name: "Draft" });
      expect(
        within(tabs)
          .getAllByRole("link")
          .map((link) => [link.textContent, link.getAttribute("href"), link.getAttribute("aria-current")]),
      ).toEqual([
        ["Overview", studioRouteToHash({ screen: "draft", draftUrl: DRAFT_URL }), "page"],
        ["Cards", studioRouteToHash({ screen: "draftCards", draftUrl: DRAFT_URL }), null],
        ["Check", studioRouteToHash({ screen: "check", draftUrl: DRAFT_URL }), null],
        ["Preview", studioRouteToHash({ screen: "preview", draftUrl: DRAFT_URL }), null],
        ["Trial", studioRouteToHash({ screen: "trial", draftUrl: DRAFT_URL }), null],
        ["Release", studioRouteToHash({ screen: "release", draftUrl: DRAFT_URL }), null],
      ]);
      // Not the overview's own links any more.
      expect(inMain().queryByRole("link", { name: "See the release check" })).toBeNull();
    });

    it("plays the draft in a trial from its tabs, with its trail, its chapters, reviews and jumps in the URL", async () => {
      const useCases = draftUseCases();
      const trial = makeUseCasesFake({
        getCourse: vi.fn(async () => makeCourse()),
        answerCourseQuestion: vi.fn(async () => ({ effect: "introduce" as const, state: null })),
      });
      vi.mocked(useCases.openTrial).mockResolvedValue({ ok: true, trial: { useCases: trial, instance: courseInstance, deck: courseDeck } });
      window.history.replaceState(null, "", studioRouteToHash({ screen: "draft", draftUrl: DRAFT_URL }));
      renderWorkspace(useCases);
      fireEvent.click(within(await screen.findByRole("navigation", { name: "Draft" })).getByRole("link", { name: "Trial" }));
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
      expect(await inMain().findByRole("alert")).toHaveTextContent("That draft no longer exists.");
    });
  });
});
