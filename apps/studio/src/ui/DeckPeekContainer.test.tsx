import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { DeckTree } from "@solid-memo/domain/deckTree";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { DeckPeekContainer } from "./DeckPeekContainer";
import { studioRouteToHash } from "./router";
import { instanceA, makeCard, makeDeck } from "../test/fixtures";

const kanji = makeDeck("deck-1", { en: "Kanji N5" });
const verbs = makeDeck("deck-2", { en: "Verbs" });
const languages = { url: `${instanceA.url}catalog.ttl#group-1`, title: { en: "Languages" } };
const tree: DeckTree = {
  readOnly: false,
  children: [
    { kind: "group", group: languages, children: [{ kind: "deck", deck: kanji }] },
    { kind: "deck", deck: verbs },
  ],
};

function renderPeek(useCases: UseCases, deckUrl: string | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DeckPeekContainer
        useCases={useCases}
        instance={instanceA}
        route={{ screen: "home", instanceUrl: instanceA.url }}
        deckUrl={deckUrl}
      />
    </QueryClientProvider>,
  );
}

/** The peek's figures, by their names. */
const figures = () => {
  const list = screen.getByRole("region", { name: /./ }).querySelector("dl")!;
  return [...list.querySelectorAll("dt")].map(
    (term) => `${term.textContent}: ${term.nextElementSibling!.textContent}`,
  );
};

describe("DeckPeekContainer", () => {
  it("shows the deck in short: its groups, cards in use, today's counts and when it last changed, with links to its tabs", async () => {
    const useCases = makeUseCasesFake({
      listDeckTree: vi.fn(async () => tree),
      listCards: vi.fn(async (deck) => [
        makeCard(deck, "a"),
        makeCard(deck, "b"),
        makeCard(deck, "c", true),
      ]),
      getStudyCounts: vi.fn(async () => ({ dueCount: 3, newCount: 7 })),
    });
    renderPeek(useCases, kanji.url);
    const peek = within(await screen.findByRole("region", { name: "Kanji N5" }));
    await waitFor(() =>
      expect(figures()).toEqual([
        "Group: Languages",
        "Cards: 2",
        "Due today: 3",
        "New today: 7",
        "Last changed: September 21, 2026",
      ]),
    );
    expect(peek.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Cards – Kanji N5",
      "Schedule – Kanji N5",
      "Health – Kanji N5",
      "About – Kanji N5",
      "Export – Kanji N5",
    ]);
    expect(peek.getByRole("link", { name: "Export – Kanji N5" })).toHaveAttribute(
      "href",
      studioRouteToHash({ screen: "transfer", instanceUrl: instanceA.url, deckUrls: [kanji.url] }),
    );
  });

  it("says when a figure could not be read, and names a deck at the top level", async () => {
    const useCases = makeUseCasesFake({
      listDeckTree: vi.fn(async () => tree),
      listCards: vi.fn(async () => {
        throw new Error("Unreadable");
      }),
      getStudyCounts: vi.fn(() => new Promise<never>(() => undefined)),
    });
    renderPeek(useCases, verbs.url);
    await screen.findByRole("region", { name: "Verbs" });
    await waitFor(() =>
      expect(figures().slice(0, 4)).toEqual([
        "Group: Top level",
        "Cards: –Could not be read",
        "Due today: Counting…",
        "New today: Counting…",
      ]),
    );
  });

  it("says how to show a deck when none is at the cursor, or the one named is not the instance's", async () => {
    const useCases = makeUseCasesFake({ listDeckTree: vi.fn(async () => tree) });
    renderPeek(useCases, null);
    expect(screen.getByText(/to see it here/)).toBeInTheDocument();
    renderPeek(useCases, `${instanceA.url}catalog.ttl#gone`);
    await waitFor(() => expect(useCases.listDeckTree).toHaveBeenCalled());
    expect(screen.getAllByText(/to see it here/)).toHaveLength(2);
    expect(useCases.listCards).not.toHaveBeenCalled();
  });
});
