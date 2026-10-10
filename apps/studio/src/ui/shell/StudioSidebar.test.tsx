import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { AppError } from "@solid-memo/domain/appError";
import type { ReleaseDraftSummary } from "@solid-memo/domain/release/draftLayout";
import type { ValidationReport } from "@solid-memo/domain/validation";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { DRAFT_URL, instanceA, makeDeck } from "../../test/fixtures";
import { studioRouteToHash, type StudioRoute } from "../router";
import type { WorkItem } from "./prefs";
import { StudioSidebar } from "./StudioSidebar";

const kanji = makeDeck("deck-1", { en: "Kanji N5", sv: "Kanji N5 på svenska" });
const verbs = makeDeck("deck-2", { en: "Verbs" });
const instanceUrl = instanceA.url;

const solid: ReleaseDraftSummary = {
  url: DRAFT_URL,
  instanceUrl,
  name: "solid",
  version: 1,
  readable: true,
  title: { en: "Solid" },
  course: true,
};
const untitled: ReleaseDraftSummary = { ...solid, url: `${instanceUrl}drafts/verbs/v3/release.ttl`, name: "verbs", version: 3, title: {}, course: false };
const unreadable: ReleaseDraftSummary = { ...solid, url: `${instanceUrl}drafts/broken/v1/release.ttl`, name: "broken", readable: false, title: {} };

function renderSidebar(
  route: StudioRoute,
  overrides: Partial<UseCases> = {},
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  items: { pinned?: WorkItem[]; recent?: WorkItem[]; onPin?: (item: WorkItem) => void } = {},
) {
  const useCases = makeUseCasesFake({
    listDecks: vi.fn(async () => [kanji, verbs]),
    listReleaseDrafts: vi.fn(async () => [solid, untitled, unreadable]),
    ...overrides,
  });
  render(
    <QueryClientProvider client={queryClient}>
      <StudioSidebar
        useCases={useCases}
        instance={instanceA}
        route={route}
        pinned={items.pinned ?? []}
        recent={items.recent ?? []}
        onPin={items.onPin ?? (() => undefined)}
      />
    </QueryClientProvider>,
  );
  return useCases;
}

/** Waits for the decks and the drafts to be read. */
const loaded = async () => {
  await screen.findByRole("list", { name: "Decks" });
  await screen.findByRole("list", { name: "Drafts" });
};
const decks = () => screen.getByRole("list", { name: "Decks" });
const drafts = () => screen.getByRole("list", { name: "Drafts" });
const sections = () => within(screen.getAllByRole("list")[0]!);

describe("StudioSidebar", () => {
  it("links to the instance's sections, the one shown marked", async () => {
    renderSidebar({ screen: "groups", instanceUrl });
    const names = sections()
      .getAllByRole("link")
      .map((link) => [link.textContent, link.getAttribute("href")]);
    expect(names).toEqual([
      ["Decks", studioRouteToHash({ screen: "home", instanceUrl })],
      ["Groups", studioRouteToHash({ screen: "groups", instanceUrl })],
      ["Drafts", studioRouteToHash({ screen: "drafts", instanceUrl })],
      ["Releases", studioRouteToHash({ screen: "releases", instanceUrl })],
      ["Health", studioRouteToHash({ screen: "health", instanceUrl })],
      ["Library copies", studioRouteToHash({ screen: "library", instanceUrl })],
      ["Import and export", studioRouteToHash({ screen: "transfer", instanceUrl })],
      ["Name and catalogue", studioRouteToHash({ screen: "instance", instanceUrl })],
    ]);
    expect(sections().getByRole("link", { name: "Groups" })).toHaveAttribute("aria-current", "page");
    expect(sections().getByRole("link", { name: "Decks" })).not.toHaveAttribute("aria-current");
    await loaded();
  });

  it("lists the decks, each at its cards, and marks the deck shown", async () => {
    renderSidebar({ screen: "schedule", deckUrl: verbs.url });
    await loaded();
    expect(within(decks()).getByRole("link", { name: "Kanji N5" })).toHaveAttribute("href", studioRouteToHash({ screen: "cards", deckUrl: kanji.url }));
    expect(within(decks()).getByRole("link", { name: "Kanji N5" })).not.toHaveAttribute("aria-current");
    expect(within(decks()).getByRole("link", { name: "Verbs" })).toHaveAttribute("aria-current", "true");
    expect(sections().getAllByRole("link").filter((link) => link.hasAttribute("aria-current"))).toEqual([]);
  });

  it("lists the drafts, each at its overview with its version, one that cannot be read named, and marks the draft shown", async () => {
    renderSidebar({ screen: "check", draftUrl: DRAFT_URL });
    await loaded();
    const link = within(drafts()).getByRole("link", { name: "Solid" });
    expect(link).toHaveAttribute("href", studioRouteToHash({ screen: "draft", draftUrl: DRAFT_URL }));
    expect(link).toHaveAttribute("aria-current", "true");
    expect(link.closest("li")).toHaveTextContent("Solid v1");
    expect(within(drafts()).getByRole("link", { name: "Untitled (verbs)" })).not.toHaveAttribute("aria-current");
    expect(within(drafts()).getByRole("link", { name: "Untitled (verbs)" }).closest("li")).toHaveTextContent("v3");
    expect(within(drafts()).queryByRole("link", { name: "Untitled (broken)" })).toBeNull();
    expect(within(drafts()).getByText(/Untitled \(broken\)/)).toBeInTheDocument();
  });

  it("keeps the decks and drafts whose name holds the filter, case and accents aside, in any language", async () => {
    renderSidebar({ screen: "home", instanceUrl });
    await loaded();
    const filter = screen.getByRole("searchbox", { name: "Filter decks and drafts" });
    fireEvent.input(filter, { target: { value: " SVÉNSKA " } });
    expect(within(decks()).getAllByRole("link").map((link) => link.textContent)).toEqual(["Kanji N5"]);
    expect(screen.getByText("No drafts.")).toBeInTheDocument();
    fireEvent.input(filter, { target: { value: "verb" } });
    expect(within(decks()).getAllByRole("link").map((link) => link.textContent)).toEqual(["Verbs"]);
    expect(within(drafts()).getAllByRole("link").map((link) => link.textContent)).toEqual(["Untitled (verbs)"]);
    fireEvent.input(filter, { target: { value: "solid" } });
    expect(screen.getByText("No decks.")).toBeInTheDocument();
    expect(within(drafts()).getAllByRole("link").map((link) => link.textContent)).toEqual(["Solid"]);
  });

  it("counts the problems the instance's check found beside its health, and checks nothing itself", async () => {
    const queryClient = new QueryClient();
    const report = (violationCount: number): ValidationReport => ({ instanceUrl, documents: [], violationCount, conforms: violationCount === 0 });
    queryClient.setQueryData(["validation", instanceUrl], report(3));
    const useCases = renderSidebar({ screen: "home", instanceUrl }, {}, queryClient);
    const health = sections().getByRole("link", { name: "Health" }).closest("li")!;
    expect(health).toHaveTextContent("Health33 problems");
    expect(within(health).getByText("3", { selector: "[aria-hidden]" })).toBeInTheDocument();
    expect(within(health).getByText("3 problems")).toHaveClass("visually-hidden");
    expect(useCases.checkInstance).not.toHaveBeenCalled();
    queryClient.setQueryData(["validation", instanceUrl], report(0));
    await waitFor(() => expect(health).toHaveTextContent(/^Health$/));
  });

  it("says nothing of the problems before the instance is checked", async () => {
    const useCases = renderSidebar({ screen: "home", instanceUrl });
    await loaded();
    expect(sections().getByRole("link", { name: "Health" }).closest("li")).toHaveTextContent(/^Health$/);
    expect(useCases.checkInstance).not.toHaveBeenCalled();
  });

  it("lists the decks and drafts pinned first, then those opened last but those pinned, each with its button to pin it or not", async () => {
    const onPin = vi.fn();
    const pinned: WorkItem[] = [
      { kind: "draft", url: DRAFT_URL },
      { kind: "deck", url: kanji.url },
      { kind: "deck", url: `${instanceUrl}decks/gone.ttl` },
    ];
    const recent: WorkItem[] = [{ kind: "deck", url: kanji.url }, { kind: "deck", url: verbs.url }, { kind: "draft", url: unreadable.url }];
    renderSidebar({ screen: "cards", deckUrl: verbs.url }, {}, undefined, { pinned, recent, onPin });
    await loaded();
    const pins = screen.getByRole("list", { name: "Pinned" });
    expect(screen.getAllByRole("list")[0]).toBe(pins);
    expect(within(pins).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Solid", studioRouteToHash({ screen: "draft", draftUrl: DRAFT_URL })],
      ["Kanji N5", studioRouteToHash({ screen: "cards", deckUrl: kanji.url })],
    ]);
    const opened = screen.getByRole("list", { name: "Recently opened" });
    expect(within(opened).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Verbs", "Untitled (broken) v1"]);
    expect(within(opened).getByRole("link", { name: "Verbs" })).toHaveAttribute("aria-current", "true");
    expect(within(pins).getByRole("button", { name: "Pin Kanji N5" })).toHaveAttribute("aria-pressed", "true");
    expect(within(decks()).getByRole("button", { name: "Pin Kanji N5" })).toHaveAttribute("aria-pressed", "true");
    expect(within(decks()).getByRole("button", { name: "Pin Verbs" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(within(opened).getByRole("button", { name: "Pin Verbs" }));
    expect(onPin).toHaveBeenCalledWith({ kind: "deck", url: verbs.url });
    fireEvent.click(within(drafts()).getByRole("button", { name: "Pin Untitled (broken)" }));
    expect(onPin).toHaveBeenLastCalledWith({ kind: "draft", url: unreadable.url });
  });

  it("lists nothing pinned or opened last before the decks and drafts are read", () => {
    renderSidebar({ screen: "home", instanceUrl }, { listDecks: vi.fn(() => new Promise<never>(() => undefined)), listReleaseDrafts: vi.fn(() => new Promise<never>(() => undefined)) }, undefined, {
      pinned: [{ kind: "deck", url: kanji.url }],
      recent: [{ kind: "draft", url: DRAFT_URL }],
    });
    expect(screen.queryByRole("list", { name: "Pinned" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Recently opened" })).toBeNull();
  });

  it("says why the decks or the drafts could not be read", async () => {
    renderSidebar(
      { screen: "home", instanceUrl },
      {
        listDecks: vi.fn(async () => Promise.reject(new AppError("cannotCheck"))),
        listReleaseDrafts: vi.fn(async () => Promise.reject(new AppError("cannotCheck"))),
      },
    );
    expect(await screen.findAllByText("Solid Memo could not check your Pod. Check your connection and try again.")).toHaveLength(2);
    expect(screen.queryByRole("list", { name: "Decks" })).toBeNull();
  });
});
