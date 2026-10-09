import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { LibraryDeck } from "@solid-memo/domain/library";
import { firstRelease } from "@solid-memo/domain/testing/libraryDeck";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { GroupsContainer } from "./GroupsContainer";
import { instanceA, makeDeck } from "../test/fixtures";

const RELEASE = "https://solid-memo.com/decks/solid/v1.ttl";
const kanji = makeDeck("deck-1", { en: "Kanji N5" });
const course = { ...makeDeck("deck-2", { en: "Solid" }), sourceUrl: RELEASE };
const solid: LibraryDeck = {
  url: RELEASE,
  ...firstRelease(RELEASE),
  title: { en: "Solid" },
  cardCount: 1,
  authors: [],
  direction: "front-to-back",
  sources: [],
  isCourse: true,
};

function renderContainer(useCases: UseCases) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <GroupsContainer useCases={useCases} instance={instanceA} />
    </QueryClientProvider>,
  );
}

const instance = encodeURIComponent(instanceA.url);
const app = (hash: string) => `../#/${hash}`;

describe("GroupsContainer", () => {
  it("arranges the decks as Solid Memo's list does, all else opening in Solid Memo, nothing to study", async () => {
    const useCases = makeUseCasesFake({
      listDecks: vi.fn(async () => [kanji, course]),
      listLibraryDecks: vi.fn(async () => [solid]),
    });
    renderContainer(useCases);
    expect(screen.getByText("Loading decks…")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Groups" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kanji N5" })).toHaveAttribute(
      "href",
      app(`deck?instance=${instance}&deck=${encodeURIComponent(kanji.url)}`),
    );
    expect(screen.queryByRole("button", { name: /Study/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Create deck" })).toHaveAttribute("href", app(`new-deck?instance=${instance}`));
    expect(screen.getByRole("link", { name: "Deck library" })).toHaveAttribute("href", app(`library?instance=${instance}`));

    fireEvent.click(screen.getByRole("button", { name: "Actions for Solid" }));
    expect(await screen.findByRole("menuitem", { name: "Continue course" })).toHaveAttribute(
      "href",
      app(`course?instance=${instance}&deck=${encodeURIComponent(course.url)}`),
    );
    expect(screen.getByRole("menuitem", { name: "Preferences" })).toHaveAttribute(
      "href",
      app(`deck-preferences?instance=${instance}&deck=${encodeURIComponent(course.url)}`),
    );
    expect(screen.queryByRole("menuitem", { name: "Open in Studio" })).toBeNull();

    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Actions for Kanji N5" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    await vi.waitFor(() =>
      expect(useCases.editDeckTree).toHaveBeenCalledWith(instanceA.url, {
        kind: "move",
        node: kanji.url,
        to: { parent: null, after: course.url },
      }),
    );
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
});
