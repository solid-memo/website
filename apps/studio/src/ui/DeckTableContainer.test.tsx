import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { DeckTree } from "@solid-memo/domain/deckTree";
import type { LibraryDeck } from "@solid-memo/domain/library";
import { firstRelease } from "@solid-memo/domain/testing/libraryDeck";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import type { ValidationReport } from "@solid-memo/domain/validation";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { DeckTableContainer } from "./DeckTableContainer";
import { choose } from "../test/choose";
import { instanceA, invalidReport, makeCard, makeDeck } from "../test/fixtures";

const kanji = makeDeck("deck-1", { en: "Kanji N5" });
const verbs = makeDeck("deck-2", { en: "Verbs" });
const languages = { url: `${instanceA.url}catalog.ttl#group-1`, title: { en: "Languages" } };

function renderContainer(useCases: UseCases) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DeckTableContainer
        useCases={useCases}
        instance={instanceA}
        view={{ filter: "" }}
        onView={() => undefined}
        appHref="#/decks"
        groupsHref="#/groups"
        instanceHref="#/instance"
        healthHref={(deck) => (deck === undefined ? "#/health" : `#/health?deck=${deck.id}`)}
        libraryHref="#/library"
        transferHref={() => "#/transfer"}
        deckHref={(deck) => `#/deck?deck=${deck.id}`}
        cardsHref={(deck) => `#/browse?deck=${deck.id}`}
      />
    </QueryClientProvider>,
  );
}

const cells = (row: HTMLElement) => within(row).getAllByRole("cell").map((cell) => cell.textContent);

afterEach(() => vi.unstubAllGlobals());

describe("DeckTableContainer", () => {
  it("reads the decks as arranged, then each one's cards in use and today's counts, with the instance's pace", async () => {
    const tree: DeckTree = {
      readOnly: false,
      children: [
        { kind: "group", group: languages, children: [{ kind: "deck", deck: { ...kanji, newCardsPerDay: 5 } }] },
        { kind: "deck", deck: verbs },
      ],
    };
    const useCases = makeUseCasesFake({
      listDeckTree: vi.fn(async () => tree),
      listCards: vi.fn(async (deck) =>
        deck.url === kanji.url ? [makeCard(deck, "a"), makeCard(deck, "b"), makeCard(deck, "c", true)] : [],
      ),
      getStudyCounts: vi.fn(async (_instanceUrl, deck) => ({ dueCount: deck.url === kanji.url ? 2 : 0, newCount: 5 })),
    });
    renderContainer(useCases);
    expect(screen.getByText("Loading decks…")).toBeInTheDocument();
    const row = await screen.findByRole("row", { name: /Kanji N5/ });
    await waitFor(() =>
      expect(cells(row)).toEqual([
        "",
        "Languages",
        "Front → back",
        "5",
        `${DEFAULT_PREFERENCES.maxReviewsPerDay} (instance)`,
        "2",
        "5",
        "September 21, 2026",
        "2 cards of Kanji N5",
      ]),
    );
    expect(useCases.listDeckTree).toHaveBeenCalledWith(instanceA.url);
    expect(useCases.getPreferences).toHaveBeenCalledWith(instanceA.url);
    expect(useCases.getStudyCounts).toHaveBeenCalledWith(instanceA.url, { ...kanji, newCardsPerDay: 5 }, expect.any(Date));
  });

  it("shows a row's figures that could not be read as such, and badges a library copy, a course and invalid data", async () => {
    const course = { ...makeDeck("deck-3", { en: "Solid" }), sourceUrl: "https://solid-memo.com/decks/solid/v1.ttl" };
    const copy = { ...makeDeck("deck-4", { en: "Capitals" }), sourceUrl: "https://solid-memo.com/decks/capitals/v2.ttl" };
    const report: ValidationReport = {
      instanceUrl: instanceA.url,
      conforms: false,
      violationCount: 1,
      documents: [
        {
          url: verbs.cardsDocumentUrl,
          status: "checked",
          subjects: [
            {
              url: `${verbs.cardsDocumentUrl}#a`,
              status: "checked",
              shape: "card",
              version: 5,
              violations: [{ path: "", message: { en: "Wrong" }, severity: "violation", constraint: "MinCount" }],
            },
          ],
        },
      ],
    };
    const solid: LibraryDeck = {
      url: course.sourceUrl,
      ...firstRelease(course.sourceUrl),
      title: { en: "Solid" },
      cardCount: 5,
      authors: [],
      direction: "front-to-back",
      sources: [],
      isCourse: true,
    };
    const useCases = makeUseCasesFake({
      listDecks: vi.fn(async () => [kanji, verbs, course, copy]),
      listCards: vi.fn(async (deck) => {
        if (deck.url === kanji.url) throw new Error("gone");
        return [];
      }),
      getStudyCounts: vi.fn(() => new Promise<never>(() => undefined)),
      checkInstance: vi.fn(async () => report),
      listLibraryDecks: vi.fn(async () => [solid]),
    });
    renderContainer(useCases);
    const row = await screen.findByRole("row", { name: /Kanji N5/ });
    await waitFor(() => expect(within(row).getAllByRole("cell")[8]).toHaveTextContent("Could not be read"));
    expect(within(row).getAllByRole("cell")[5]).toHaveTextContent("Counting…");
    expect(within(row).getByRole("rowheader")).toHaveTextContent("Kanji N5Unreadable");
    await waitFor(() => expect(screen.getByRole("rowheader", { name: /Verbs/ })).toHaveTextContent("VerbsInvalid data"));
    await waitFor(() => expect(screen.getByRole("rowheader", { name: /Solid/ })).toHaveTextContent("SolidCourse"));
    expect(screen.getByRole("rowheader", { name: /Capitals/ })).toHaveTextContent("CapitalsLibrary");
  });

  it("leaves a deck set aside out of the bulk actions, and moves none while the arrangement is set aside", async () => {
    const useCases = makeUseCasesFake({
      listDecks: vi.fn(async () => [kanji, verbs]),
      checkInstance: vi.fn(async () => invalidReport([kanji], { catalogue: true })),
    });
    renderContainer(useCases);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Select Verbs" })).toBeEnabled());
    expect(screen.getByRole("checkbox", { name: "Select Kanji N5" })).toBeDisabled();
    expect(screen.getByText(/Decks with invalid data are set aside/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Verbs" }));
    fireEvent.click(screen.getByRole("button", { name: "Move to group" }));
    expect(screen.getByText(/The arrangement of these decks has invalid data/)).toBeInTheDocument();
  });

  it("moves no deck into a group that a newer version arranged", async () => {
    const useCases = makeUseCasesFake({ listDecks: vi.fn(async () => [kanji, verbs]) });
    vi.mocked(useCases.listDeckTree).mockImplementation(async () => ({ readOnly: true, children: [kanji, verbs].map((deck) => ({ kind: "deck" as const, deck })) }));
    renderContainer(useCases);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Select Verbs" })).toBeEnabled());
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Verbs" }));
    fireEvent.click(screen.getByRole("button", { name: "Move to group" }));
    expect(screen.getByText(/A newer version of Solid Memo arranged these groups/)).toBeInTheDocument();
  });

  it("moves, paces, directs and deletes the selected decks, each in one call, and reads the decks afresh after", async () => {
    const useCases = makeUseCasesFake({ listDecks: vi.fn(async () => [kanji, verbs]) });
    vi.mocked(useCases.listDeckTree).mockImplementation(async () => ({
      readOnly: false,
      children: [{ kind: "group", group: languages, children: [] }, ...[kanji, verbs].map((deck) => ({ kind: "deck" as const, deck }))],
    }));
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Select Kanji N5" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Verbs" }));
    const apply = async (action: string, fill: () => void, said: string) => {
      fireEvent.click(screen.getByRole("button", { name: action }));
      fill();
      fireEvent.click(screen.getByRole("button", { name: "Apply" }));
      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(said));
    };
    const reads = vi.mocked(useCases.listDeckTree).mock.calls.length;
    await apply(
      "Move to group",
      () => choose("Group", languages.url),
      "Moved 2 decks to Languages.",
    );
    expect(useCases.editDeckTree).toHaveBeenCalledWith(instanceA.url, {
      kind: "gather",
      nodes: [kanji.url, verbs.url],
      parent: languages.url,
    });
    await waitFor(() => expect(vi.mocked(useCases.listDeckTree).mock.calls.length).toBeGreaterThan(reads));
    await apply(
      "Move to group",
      () => choose("Group", ""),
      "Moved 2 decks to Top level (no group).",
    );
    expect(useCases.editDeckTree).toHaveBeenLastCalledWith(instanceA.url, { kind: "gather", nodes: [kanji.url, verbs.url], parent: null });
    await apply(
      "Set pace",
      () => fireEvent.input(screen.getByRole("spinbutton", { name: "New cards per day" }), { target: { value: "3" } }),
      "Set the pace of 2 decks.",
    );
    expect(useCases.setDecksPace).toHaveBeenCalledWith([kanji, verbs], { newCardsPerDay: 3 });
    await apply(
      "Set direction",
      () => choose("Direction", "bidirectional"),
      "Set the direction of 2 decks.",
    );
    expect(useCases.setDecksDirection).toHaveBeenCalledWith([kanji, verbs], "bidirectional");
    vi.stubGlobal("confirm", () => true);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Deleted 2 decks."));
    expect(useCases.removeDecks).toHaveBeenCalledWith([kanji, verbs]);
  });

  it("says why a bulk action was not done", async () => {
    const useCases = makeUseCasesFake({
      listDecks: vi.fn(async () => [kanji]),
      setDecksDirection: vi.fn(async () => {
        throw new Error("The pod said no");
      }),
    });
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Select Kanji N5" }));
    fireEvent.click(screen.getByRole("button", { name: "Set direction" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("The pod said no"));
  });

  it("says why the decks could not be read", async () => {
    renderContainer(
      makeUseCasesFake({
        listDeckTree: vi.fn(async () => {
          throw new Error("Pod unreachable");
        }),
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Pod unreachable");
  });

  it("says why the instance's preferences could not be read", async () => {
    renderContainer(
      makeUseCasesFake({
        getPreferences: vi.fn(async () => {
          throw new Error("No preferences");
        }),
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("No preferences");
  });
});
