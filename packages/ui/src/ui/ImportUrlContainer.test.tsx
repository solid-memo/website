import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { AppError } from "@solid-memo/domain/appError";
import type { Deck } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { LibraryDeck } from "@solid-memo/domain/library";
import { ImportUrlContainer } from "./ImportUrlContainer";
import { makeUseCasesFake } from "../test/useCasesFake";

const instance: Instance = { url: "https://pod.example/solid-memo/a/", name: "Geography" };
const RIVERS = "https://bob.example/memo/releases/rivers/v1.ttl";

const rivers: LibraryDeck = {
  url: RIVERS,
  seriesUrl: `${RIVERS}#series`,
  version: "1",
  releases: [{ url: RIVERS, version: "1", issued: "2026-10-10T10:00:00.000Z" }],
  title: { en: "Rivers" },
  description: { en: "The longest rivers." },
  cardCount: 3,
  authors: ["Bob"],
  license: "https://creativecommons.org/publicdomain/zero/1.0/",
  direction: "front-to-back",
  sources: [],
  themes: [],
  keywords: {},
};

const added: Deck = {
  id: "deck-1",
  url: `${instance.url}catalog.ttl#deck-1`,
  title: { en: "Rivers" },
  cardsDocumentUrl: `${instance.url}decks/deck-1.ttl`,
  reviewsDocumentUrl: `${instance.url}reviews/deck-1.ttl`,
  direction: "front-to-back",
  createdAt: "2026-10-10T10:00:00.000Z",
  formatVersion: 6,
  authors: [],
  sourceUrl: RIVERS,
};

function renderContainer(useCases: UseCases, url?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props = { onShow: vi.fn(), onDone: vi.fn(), onCourseStarted: vi.fn() };
  const view = (shown?: string) => (
    <QueryClientProvider client={queryClient}>
      <ImportUrlContainer useCases={useCases} instance={instance} {...(shown === undefined ? {} : { url: shown })} {...props} />
    </QueryClientProvider>
  );
  const { rerender } = render(view(url));
  return { ...props, rerender: (shown?: string) => rerender(view(shown)) };
}

const showButton = () => screen.getByRole("button", { name: "Show" });
const linkField = () => screen.getByRole("textbox", { name: "Link to the release" });

describe("ImportUrlContainer", () => {
  it("asks for a link, and shows the one typed, trimmed, by putting it in the URL", () => {
    const useCases = makeUseCasesFake();
    const { onShow } = renderContainer(useCases);
    expect(screen.getByRole("heading", { name: "Add from a link" })).toBeInTheDocument();
    fireEvent.input(linkField(), { target: { value: ` ${RIVERS} ` } });
    fireEvent.click(showButton());
    expect(onShow).toHaveBeenCalledWith(RIVERS);
    expect(useCases.readReleaseFromLink).not.toHaveBeenCalled();
  });

  it("puts a link in the URL as the URL standard writes it, and one that is no release's as typed", () => {
    const { onShow } = renderContainer(makeUseCasesFake());
    fireEvent.input(linkField(), { target: { value: RIVERS.replace("https://bob.example/", "https://Bob.example:443/") } });
    fireEvent.click(showButton());
    expect(onShow).toHaveBeenLastCalledWith(RIVERS);
    fireEvent.input(linkField(), { target: { value: "https://Bob.example/memo/" } });
    fireEvent.click(showButton());
    expect(onShow).toHaveBeenLastCalledWith("https://Bob.example/memo/");
  });

  it("shows the release at the link, where it is published and what it is, and imports a deck as the library's", async () => {
    const importReleaseFromUrl = vi.fn(async () => added);
    const useCases = makeUseCasesFake({ readReleaseFromLink: vi.fn(async () => rivers), importReleaseFromUrl });
    const { onDone, onCourseStarted } = renderContainer(useCases, RIVERS);
    expect(linkField()).toHaveValue(RIVERS);
    expect(await screen.findByRole("heading", { name: "Rivers" })).toBeInTheDocument();
    expect(useCases.readReleaseFromLink).toHaveBeenCalledWith(RIVERS);
    expect(screen.getByText(/it is published on bob\.example/)).toBeInTheDocument();
    expect(screen.getByText("Published on").nextElementSibling).toHaveTextContent("bob.example");
    expect(screen.getByText("Kind").nextElementSibling).toHaveTextContent("Deck");
    expect(screen.getByText("3 cards")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Browse cards" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Preview" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Import this deck" }));
    await waitFor(() => expect(importReleaseFromUrl).toHaveBeenCalled());
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(importReleaseFromUrl).toHaveBeenCalledWith(instance.url, rivers);
    expect(onCourseStarted).not.toHaveBeenCalled();
  });

  it("starts a course and opens it; one the instance has already is continued", async () => {
    const course = { ...rivers, isCourse: true as const };
    const useCases = makeUseCasesFake({
      readReleaseFromLink: vi.fn(async () => course),
      importReleaseFromUrl: vi.fn(async () => added),
      listDecks: vi.fn(async () => [added]),
    });
    const { onCourseStarted, onDone } = renderContainer(useCases, RIVERS);
    expect(await screen.findByText("Kind")).toBeInTheDocument();
    expect(screen.getByText("Kind").nextElementSibling).toHaveTextContent("Course");
    fireEvent.click(await screen.findByRole("button", { name: "Continue course" }));
    await waitFor(() => expect(onCourseStarted).toHaveBeenCalledWith(added));
    expect(onDone).not.toHaveBeenCalled();
  });

  it("says why a release cannot be added, and why adding it failed", async () => {
    const readReleaseFromLink = vi.fn(async (url: string): Promise<LibraryDeck> => {
      if (url === RIVERS) return rivers;
      throw new AppError("releaseUnreadable", { url });
    });
    const useCases = makeUseCasesFake({
      readReleaseFromLink,
      importReleaseFromUrl: vi.fn(async () => {
        throw new Error("pod refused");
      }),
    });
    const { rerender } = renderContainer(useCases, "https://bob.example/gone.ttl");
    expect(await screen.findByText(/Solid Memo cannot read a release at https:\/\/bob\.example\/gone\.ttl/)).toBeInTheDocument();
    rerender(RIVERS);
    fireEvent.click(await screen.findByRole("button", { name: "Import this deck" }));
    expect(await screen.findByText(/pod refused/)).toBeInTheDocument();
  });

  it("reads the link again when the same one is shown again, and says while it reads", async () => {
    let answer: (release: LibraryDeck) => void = () => undefined;
    const readReleaseFromLink = vi.fn(() => new Promise<LibraryDeck>((resolve) => (answer = resolve)));
    // The instance's decks still on their way: the release is not marked as added meanwhile.
    const listDecks = vi.fn(() => new Promise<Deck[]>(() => undefined));
    const { onShow } = renderContainer(makeUseCasesFake({ readReleaseFromLink, listDecks }), RIVERS);
    expect(await screen.findByText("Reading and checking the release…")).toBeInTheDocument();
    answer(rivers);
    expect(await screen.findByRole("heading", { name: "Rivers" })).toBeInTheDocument();
    expect(screen.queryByText("Already imported")).toBeNull();
    fireEvent.click(showButton());
    await waitFor(() => expect(readReleaseFromLink).toHaveBeenCalledTimes(2));
    expect(onShow).not.toHaveBeenCalled();
  });
});
