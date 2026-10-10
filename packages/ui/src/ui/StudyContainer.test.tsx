import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StudyContainer } from "./StudyContainer";
import { Clock } from "./courseLinks";
import { DeckStudyActionContainer } from "./DeckStudyAction";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck, Prompt } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import type { StudyQueue } from "@solid-memo/domain/scheduling";
import { makeUseCasesFake } from "../test/useCasesFake";

const instance: Instance = {
  url: "https://pod.example/solid-memo/a/",
  name: "Japanese study",
};

const deck: Deck = {
  id: "deck-1",
  url: `${instance.url}catalog.ttl#deck-1`,
  title: { en: "Kanji N5" },
  cardsDocumentUrl: `${instance.url}decks/deck-1.ttl`,
  reviewsDocumentUrl: `${instance.url}reviews/deck-1.ttl`,
  direction: "front-to-back",
  createdAt: "2026-09-21T10:00:00.000Z",
  formatVersion: 1,
  authors: [],
};

/** A front→back prompt of a card with the given front. */
function makePrompt(id: string, front: string): Prompt {
  return {
    card: {
      id,
      url: `${deck.cardsDocumentUrl}#${id}`,
      front: { "": front },
      back: { "": `${front}-back` },
      createdAt: "2026-09-21T10:00:00.000Z",
      formatVersion: 1,
    },
    direction: "front-to-back",
  };
}

function renderContainer(
  useCases: UseCases,
  random: () => number = () => 0,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onExit = vi.fn();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <StudyContainer
        useCases={useCases}
        instance={instance}
        deck={deck}
        onExit={onExit}
        random={random}
      />
    </QueryClientProvider>,
  );
  return { onExit, queryClient, unmount: view.unmount };
}

/** Reveal the current card and grade it. */
async function answer(grade: string) {
  const reveal = await screen.findByRole("button", { name: "Reveal" });
  await waitFor(() => expect(reveal).toHaveAttribute("aria-disabled", "false"));
  fireEvent.click(reveal);
  fireEvent.click(screen.getByRole("button", { name: grade }));
}

describe("StudyContainer", () => {
  it("shows a preparing state, then the first due card", async () => {
    renderContainer(
      makeUseCasesFake({
        getStudyQueue: vi.fn(async () => ({
          due: [makePrompt("card-a", "front-a")],
          newPrompts: [makePrompt("card-b", "front-b")],
          studiedToday: 0,
        })),
      }),
    );
    expect(
      screen.getByText("Preparing your study session…"),
    ).toBeInTheDocument();
    expect(await screen.findByText("front-a")).toBeInTheDocument();
    expect(screen.getByText("Card 1 of 2")).toBeInTheDocument();
  });

  it("asks a back→front prompt from the back, and records it as such", async () => {
    const reverse: Prompt = {
      ...makePrompt("card-a", "front-a"),
      direction: "back-to-front",
    };
    const useCases = makeUseCasesFake({
      getStudyQueue: vi.fn(async () => ({
        due: [reverse],
        newPrompts: [],
        studiedToday: 0,
      })),
    });
    renderContainer(useCases);

    expect(await screen.findByText("front-a-back")).toBeInTheDocument();
    expect(screen.queryByText("front-a")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    expect(screen.getByText("front-a")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "4 — Good" }));
    await waitFor(() =>
      expect(useCases.recordReview).toHaveBeenCalledWith(
        instance.url,
        deck,
        reverse,
        4,
        expect.any(Date),
      ),
    );
  });

  it("spreads new prompts among the due ones", async () => {
    renderContainer(
      makeUseCasesFake({
        getStudyQueue: vi.fn(async () => ({
          due: [
            makePrompt("card-a", "due-a"),
            makePrompt("card-b", "due-b"),
            makePrompt("card-c", "due-c"),
          ],
          newPrompts: [makePrompt("card-x", "new-x"), makePrompt("card-y", "new-y")],
          studiedToday: 0,
        })),
      }),
    );

    const seen: string[] = [];
    for (const expected of ["due-a", "new-x", "due-b", "new-y", "due-c"]) {
      seen.push((await screen.findByText(expected)).textContent!);
      await answer("5 — Easy");
    }
    expect(seen).toEqual(["due-a", "new-x", "due-b", "new-y", "due-c"]);
    expect(
      await screen.findByText("Session finished — all cards reviewed."),
    ).toBeInTheDocument();
  });

  it("shows an error when the queue cannot be built", async () => {
    renderContainer(
      makeUseCasesFake({
        getStudyQueue: vi.fn(async () => {
          throw new Error("queue failed");
        }),
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("queue failed");
  });

  it("advances through the queue as answers are recorded", async () => {
    const useCases = makeUseCasesFake({
      getStudyQueue: vi.fn(async () => ({
        due: [makePrompt("card-a", "front-a")],
        newPrompts: [makePrompt("card-b", "front-b")],
        studiedToday: 0,
      })),
    });
    renderContainer(useCases);

    fireEvent.click(await screen.findByRole("button", { name: "Reveal" }));
    fireEvent.click(screen.getByRole("button", { name: "5 — Easy" }));

    expect(await screen.findByText("front-b")).toBeInTheDocument();
    expect(useCases.recordReview).toHaveBeenCalledWith(
      instance.url,
      deck,
      expect.objectContaining({ card: expect.objectContaining({ id: "card-a" }) }),
      5,
      expect.any(Date),
    );

    const secondReveal = await screen.findByRole("button", {
      name: "Reveal",
    });
    await waitFor(() =>
      expect(secondReveal).toHaveAttribute("aria-disabled", "false"),
    );
    fireEvent.click(secondReveal);
    fireEvent.click(screen.getByRole("button", { name: "3 — Hard" }));

    expect(
      await screen.findByText("Session finished — all cards reviewed."),
    ).toBeInTheDocument();
  });

  it("stays on the card and shows the error when recording fails", async () => {
    const useCases = makeUseCasesFake({
      getStudyQueue: vi.fn(async () => ({
        due: [makePrompt("card-a", "front-a")],
        newPrompts: [],
        studiedToday: 0,
      })),
      recordReview: vi.fn(async () => {
        throw new Error("review save failed");
      }),
    });
    renderContainer(useCases);

    fireEvent.click(await screen.findByRole("button", { name: "Reveal" }));
    fireEvent.click(screen.getByRole("button", { name: "5 — Easy" }));

    expect(await screen.findByText("review save failed")).toBeInTheDocument();
    expect(screen.getByText("front-a")).toBeInTheDocument();
  });

  it("studies at the screen's time, its deck linked where it is told", async () => {
    const later = new Date("2026-12-24T10:00:00.000Z");
    const useCases = makeUseCasesFake({
      getStudyQueue: vi.fn(async () => ({ due: [makePrompt("card-a", "front-a")], newPrompts: [], studiedToday: 0 })),
    });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Clock.Provider value={() => later}>
          <StudyContainer useCases={useCases} instance={instance} deck={deck} onExit={vi.fn()} deckLink="#/trial" />
        </Clock.Provider>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("link", { name: "Kanji N5" })).toHaveAttribute("href", "#/trial");
    expect(useCases.getStudyQueue).toHaveBeenCalledWith(instance.url, deck, later);
    await answer("5 — Easy");
    await waitFor(() => expect(useCases.recordReview).toHaveBeenCalledWith(instance.url, deck, expect.anything(), 5, later));
  });

  it("shows the empty state when nothing is due", async () => {
    renderContainer(
      makeUseCasesFake({
        getStudyQueue: vi.fn(
          async (): Promise<StudyQueue> => ({ due: [], newPrompts: [], studiedToday: 0 }),
        ),
      }),
    );
    expect(
      await screen.findByText("Nothing to study today — come back tomorrow!"),
    ).toBeInTheDocument();
  });

  it("puts a failed card back later in the session, not straight away", async () => {
    const useCases = makeUseCasesFake({
      getStudyQueue: vi.fn(async () => ({
        due: [
          makePrompt("card-a", "front-a"),
          makePrompt("card-b", "front-b"),
          makePrompt("card-c", "front-c"),
        ],
        newPrompts: [],
        studiedToday: 0,
      })),
    });
    renderContainer(useCases, () => 0);

    expect(await screen.findByText("front-a")).toBeInTheDocument();
    expect(screen.getByText("Card 1 of 3")).toBeInTheDocument();
    await answer("1 — Wrong");

    expect(await screen.findByText("front-b")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Card 2 of 4. You'll see the last card again later in this session.",
    );
    await answer("4 — Good");

    expect(await screen.findByText("front-a")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/^Card 3 of 4$/);
    await answer("5 — Easy");

    expect(await screen.findByText("front-c")).toBeInTheDocument();
    await answer("4 — Good");
    expect(
      await screen.findByText("Session finished — all cards reviewed."),
    ).toBeInTheDocument();
    expect(useCases.recordReview).toHaveBeenCalledTimes(4);
  });

  it("repeats the only remaining card immediately until it passes", async () => {
    const useCases = makeUseCasesFake({
      getStudyQueue: vi.fn(async () => ({
        due: [makePrompt("card-a", "front-a")],
        newPrompts: [],
        studiedToday: 0,
      })),
    });
    renderContainer(useCases);

    await answer("0 — Blackout");
    expect(
      await screen.findByText(
        "Card 2 of 2. You'll see the last card again later in this session.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("front-a")).toBeInTheDocument();
    expect(screen.queryByText("front-a-back")).toBeNull();

    await answer("2 — Almost");
    expect(
      await screen.findByText("Session finished — all cards reviewed."),
    ).toBeInTheDocument();
    expect(useCases.recordReview).toHaveBeenCalledTimes(2);
  });

  it("does not repeat a card graded 2 or better", async () => {
    const useCases = makeUseCasesFake({
      getStudyQueue: vi.fn(async () => ({
        due: [makePrompt("card-a", "front-a")],
        newPrompts: [],
        studiedToday: 0,
      })),
    });
    renderContainer(useCases);

    await answer("2 — Almost");
    expect(
      await screen.findByText("Session finished — all cards reviewed."),
    ).toBeInTheDocument();
  });

  it("shows the answer buttons the preferences ask for", async () => {
    const useCases = makeUseCasesFake({
      getStudyQueue: vi.fn(async () => ({
        due: [makePrompt("card-a", "front-a"), makePrompt("card-b", "front-b")],
        newPrompts: [],
        studiedToday: 0,
      })),
      getPreferences: vi.fn(async () => ({
        ...DEFAULT_PREFERENCES,
        answerScale: "minimal" as const,
      })),
    });
    renderContainer(useCases);

    fireEvent.click(await screen.findByRole("button", { name: "Reveal" }));
    expect(screen.getByRole("button", { name: "Again" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "1 — Wrong" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Again" }));
    expect(await screen.findByText("front-b")).toBeInTheDocument();
    expect(useCases.recordReview).toHaveBeenCalledWith(
      instance.url,
      deck,
      expect.objectContaining({ card: expect.objectContaining({ id: "card-a" }) }),
      1,
      expect.any(Date),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Card 2 of 3. You'll see the last card again later in this session.",
    );
  });

  it("falls back to the default answer buttons when preferences are unreadable", async () => {
    const useCases = makeUseCasesFake({
      getPreferences: vi.fn(async () => {
        throw new Error("no prefs");
      }),
      getStudyQueue: vi.fn(async () => ({
        due: [makePrompt("card-a", "front-a")],
        newPrompts: [],
        studiedToday: 0,
      })),
    });
    renderContainer(useCases);

    fireEvent.click(await screen.findByRole("button", { name: "Reveal" }));
    expect(
      screen.getByRole("button", { name: "0 — Blackout" }),
    ).toBeInTheDocument();
  });

  it("exits when the session ends", async () => {
    const { onExit } = renderContainer(makeUseCasesFake());
    fireEvent.click(
      await screen.findByRole("button", { name: "End session" }),
    );
    await waitFor(() => {
      expect(onExit).toHaveBeenCalledOnce();
    });
  });

  it("drops the deck's cached queue when the session is left", async () => {
    const useCases = makeUseCasesFake({
      getStudyQueue: vi.fn(async () => ({
        due: [makePrompt("card-a", "front-a")],
        newPrompts: [],
        studiedToday: 0,
      })),
    });
    const { queryClient, unmount } = renderContainer(useCases);
    const queueKey = ["studyQueue", deck.url];
    await screen.findByText("front-a");
    expect(queryClient.getQueryData(queueKey)).toBeDefined();

    unmount();
    expect(queryClient.getQueryData(queueKey)).toBeUndefined();
  });
});

describe("StudyContainer keeping the deck's schedule", () => {
  const twoCards = () =>
    makeUseCasesFake({
      getStudyQueue: vi.fn(async () => ({
        due: [makePrompt("card-a", "front-a"), makePrompt("card-b", "front-b")],
        newPrompts: [],
        studiedToday: 0,
      })),
    });

  function hidePage(state: "hidden" | "visible") {
    Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  }

  it("keeps it when a session that recorded answers ends, once", async () => {
    const useCases = twoCards();
    const { onExit } = renderContainer(useCases);
    await answer("4 — Good");
    await waitFor(() => expect(useCases.recordReview).toHaveBeenCalledOnce());
    await screen.findByText("Card 2 of 2");
    const end = screen.getByRole("button", { name: "End session" });
    await waitFor(() => expect(end).toBeEnabled());
    fireEvent.click(end);
    await waitFor(() => expect(onExit).toHaveBeenCalled());
    await waitFor(() => expect(useCases.refreshStudyDigest).toHaveBeenCalledExactlyOnceWith(instance.url, deck));
  });

  it("keeps nothing for a session without answers", async () => {
    const useCases = twoCards();
    const { unmount } = renderContainer(useCases);
    await screen.findByRole("button", { name: "Reveal" });
    fireEvent.click(screen.getByRole("button", { name: "End session" }));
    hidePage("hidden");
    unmount();
    expect(useCases.refreshStudyDigest).not.toHaveBeenCalled();
  });

  it("keeps it when the page is hidden, and again for answers after, when the screen goes away", async () => {
    const useCases = twoCards();
    vi.mocked(useCases.refreshStudyDigest).mockRejectedValue(new Error("offline"));
    const { unmount } = renderContainer(useCases);
    await answer("4 — Good");
    await screen.findByText("Card 2 of 2");
    hidePage("visible");
    expect(useCases.refreshStudyDigest).not.toHaveBeenCalled();
    hidePage("hidden");
    expect(useCases.refreshStudyDigest).toHaveBeenCalledOnce();
    await answer("4 — Good");
    await waitFor(() => expect(useCases.recordReview).toHaveBeenCalledTimes(2));
    unmount();
    expect(useCases.refreshStudyDigest).toHaveBeenCalledTimes(2);
  });
});

describe("StudyContainer leaving for the deck list", () => {
  it("lets the deck list count afresh, not show the counts from before the session", async () => {
    const useCases = makeUseCasesFake({
      getStudyQueue: vi.fn(async () => ({ due: [makePrompt("card-a", "front-a")], newPrompts: [], studiedToday: 0 })),
      getStudyCounts: vi.fn(async () => ({ dueCount: 0, newCount: 0 })),
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // The list counted before the session: one due, fresh for a while yet.
    queryClient.setQueryData(["studyQueue", deck.url, "counts"], { dueCount: 1, newCount: 0 });
    const screenFor = (studying: boolean) => (
      <QueryClientProvider client={queryClient}>
        {studying ? (
          <StudyContainer useCases={useCases} instance={instance} deck={deck} onExit={() => undefined} />
        ) : (
          <DeckStudyActionContainer useCases={useCases} instance={instance} deck={deck} onStudy={() => undefined} />
        )}
      </QueryClientProvider>
    );
    const view = render(screenFor(true));
    await answer("4 — Good");
    await waitFor(() => expect(useCases.recordReview).toHaveBeenCalledOnce());
    view.rerender(screenFor(false));
    expect(screen.queryByText("1 to review")).toBeNull();
    expect(await screen.findByText("Done for today")).toBeInTheDocument();
    expect(useCases.getStudyCounts).toHaveBeenCalled();
  });
});
