// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentChildren } from "preact";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { AppError } from "@solid-memo/domain/appError";
import { choicesOf } from "@solid-memo/domain/course";
import type { Card, Deck, Prompt } from "@solid-memo/domain/deck";
import type { LibraryDeck } from "@solid-memo/domain/library";
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";
import { CardFace, CardRowFront } from "./CardFace";
import { CourseQuestion } from "./CourseQuestion";
import { DeckPictures, DraftPictures, HiddenPicturesNotice } from "./deckPictures";
import { queryKeys } from "./queryKeys";
import { StudyScreen } from "./StudyScreen";
import { courseCards, noShuffle } from "../test/course";
import { makeUseCasesFake } from "../test/useCasesFake";

const RELEASE = "https://author.example/decks/beacon/v1.ttl";
const FRONT = "https://author.example/p/card1-front.svg";
const BACK = "https://author.example/p/card1-back.svg";
const OTHER = "https://other.example/p/card1-back.svg";
const SHOW = "Show pictures from author.example";
const SHOW_OTHER = "Show pictures from other.example";

const own: Deck = {
  id: "deck-1",
  url: "https://pod.example/a/catalog.ttl#deck-1",
  title: { en: "Words" },
  cardsDocumentUrl: "https://pod.example/a/decks/deck-1.ttl",
  reviewsDocumentUrl: "https://pod.example/a/reviews/deck-1.ttl",
  direction: "front-to-back",
  createdAt: "",
  formatVersion: 6,
  authors: [],
};
const linked: Deck = { ...own, sourceUrl: RELEASE };

const LIBRARY_RELEASE = "https://solid-memo.com/decks/flags/v1.ttl";
const library = [
  {
    url: LIBRARY_RELEASE,
    seriesUrl: "https://solid-memo.com/decks/flags/",
    releases: [],
  } as unknown as LibraryDeck,
];

function renderGated(
  deck: Deck | undefined,
  children: ComponentChildren,
  overrides: Partial<UseCases> = {},
) {
  const useCases = makeUseCasesFake({
    listLibraryDecks: vi.fn(async () => library),
    ...overrides,
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (shown: Deck | undefined, below: ComponentChildren) => (
    <QueryClientProvider client={queryClient}>
      <DeckPictures useCases={useCases} deck={shown}>
        {below}
      </DeckPictures>
    </QueryClientProvider>
  );
  const view = render(tree(deck, children));
  return {
    ...view,
    useCases,
    showDeck: (shown: Deck) => view.rerender(tree(shown, children)),
    showBelow: (below: ComponentChildren) => view.rerender(tree(deck, below)),
  };
}

const face = <CardFace side="front" text={{ en: "One" }} imageUrl={FRONT} />;

describe("DeckPictures", () => {
  it("loads a picture as ever under no deck, the learner's own deck and a copy of the library's", async () => {
    const { container, unmount } = renderGated(undefined, face);
    expect(container.querySelector("img")).toHaveAttribute("src", FRONT);
    unmount();

    const ofOwn = renderGated(own, face);
    // Nothing yet, while the deck's place is read.
    expect(ofOwn.container.querySelector("img")).toBeNull();
    await waitFor(() => expect(ofOwn.container.querySelector("img")).toHaveAttribute("src", FRONT));
    expect(ofOwn.useCases.listLibraryDecks).not.toHaveBeenCalled();
    ofOwn.unmount();

    const ofLibrary = renderGated({ ...own, sourceUrl: LIBRARY_RELEASE }, face);
    expect(ofLibrary.container.querySelector("img")).toBeNull();
    await waitFor(() => expect(ofLibrary.container.querySelector("img")).not.toBeNull());
    expect(screen.queryByRole("button", { name: /Show pictures/ })).toBeNull();
  });

  it("requests nothing for a linked deck's picture, nor offers the choice, while the library's index is read", () => {
    const { container } = renderGated(linked, face, {
      listLibraryDecks: vi.fn(() => new Promise<LibraryDeck[]>(() => undefined)),
    });
    expect(container.querySelector("img")).toBeNull();
    expect(screen.queryByRole("button", { name: SHOW })).toBeNull();
    expect(screen.getByText("One")).toBeInTheDocument();
  });

  it("asks when the library's index cannot be read", async () => {
    const { container } = renderGated(linked, face, {
      listLibraryDecks: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    expect(await screen.findByRole("button", { name: SHOW })).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows a linked deck's card with its text and the choice in its picture's place, then the picture once chosen, its button taking the focus", async () => {
    const { container, useCases } = renderGated(
      linked,
      <CardFace
        side="front"
        text={{ en: "One" }}
        imageUrl={FRONT}
        imageDescription={{ en: "A beacon" }}
      />,
    );
    const show = await screen.findByRole("button", { name: SHOW });
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("One")).toBeInTheDocument();
    expect(screen.getByText("A beacon")).toBeInTheDocument();
    expect(screen.getByText(/lets author\.example see when you study/)).toBeInTheDocument();

    fireEvent.click(show);
    await waitFor(() =>
      expect(useCases.setDeckPictureHost).toHaveBeenCalledWith(linked, "author.example", true),
    );
    const image = await waitFor(() => {
      const shown = container.querySelector("img");
      expect(shown).not.toBeNull();
      return shown!;
    });
    expect(image).toHaveAttribute("src", FRONT);
    expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(screen.getByRole("button", { name: "Enlarge picture" })).toHaveFocus();
  });

  it("does not save twice while saving, and says why saving failed by the button pressed, showing no picture", async () => {
    let fail = (_: Error) => undefined as void;
    const setDeckPictureHost = vi.fn(
      () =>
        new Promise<Deck>((_, reject) => {
          fail = reject;
        }),
    );
    const { container } = renderGated(
      linked,
      <>
        {face}
        <CardFace side="back" text={{ en: "Ett" }} imageUrl={BACK} />
      </>,
      { setDeckPictureHost },
    );
    const [pressed, other] = await screen.findAllByRole("button", { name: SHOW });
    fireEvent.click(pressed!);
    await waitFor(() => expect(pressed).toHaveAttribute("aria-disabled", "true"));
    fireEvent.click(pressed!);
    expect(setDeckPictureHost).toHaveBeenCalledTimes(1);
    fail(new AppError("changedElsewhere"));
    expect(await screen.findAllByRole("alert")).toHaveLength(1);
    expect(pressed!.parentElement).toContainElement(screen.getByRole("alert"));
    expect(other!.parentElement).not.toContainElement(screen.getByRole("alert"));
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows the hosts the deck's entry says, even while the index is read, and asks again of a host it does not", async () => {
    const { container } = renderGated(
      { ...linked, pictureHosts: ["author.example"] },
      <>
        {face}
        <CardFace side="back" text={{ en: "Ett" }} imageUrl={OTHER} />
      </>,
    );
    await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", FRONT));
    expect(await screen.findByRole("button", { name: SHOW_OTHER })).toBeInTheDocument();
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("keeps a choice to its deck, when one DeckPictures goes from deck to deck", async () => {
    const { container, showDeck } = renderGated(linked, face);
    fireEvent.click(await screen.findByRole("button", { name: SHOW }));
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    showDeck({ ...linked, url: "https://pod.example/a/catalog.ttl#deck-2" });
    expect(await screen.findByRole("button", { name: SHOW })).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("names an address that is no web URL as ever, with no choice", async () => {
    renderGated(linked, <CardFace side="front" text={{ en: "One" }} imageUrl="ftp://a.example/" />);
    expect(
      await screen.findByText("Picture not shown: its address is not a web URL."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Show pictures/ })).toBeNull();
  });
});

describe("a failed read of the learner's storages", () => {
  const failing = { isInOwnPod: vi.fn().mockRejectedValue(new Error("offline")) };

  it("asks, with no answer yet", async () => {
    const { container } = renderGated(own, face, failing);
    expect(await screen.findByRole("button", { name: SHOW })).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("leaves an own deck its pictures when it comes on a read again", async () => {
    const isInOwnPod = vi.fn<UseCases["isInOwnPod"]>(async () => true);
    const useCases = makeUseCasesFake({ isInOwnPod });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <DeckPictures useCases={useCases} deck={own}>
          {face}
        </DeckPictures>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", FRONT));

    isInOwnPod.mockRejectedValue(new Error("offline"));
    await act(() =>
      queryClient.refetchQueries({ queryKey: queryKeys.inOwnPod(documentUrlOf(own.url)) }),
    );

    expect(isInOwnPod).toHaveBeenCalledTimes(2);
    expect(container.querySelector("img")).toHaveAttribute("src", FRONT);
    expect(screen.queryByRole("button", { name: SHOW })).toBeNull();
  });
});

describe("a deck in an instance outside the learner's pod", () => {
  const elsewhere = (name: string): Deck => ({
    ...own,
    url: `https://someone.example/${name}/catalog.ttl#deck-1`,
  });
  const outside = { isInOwnPod: vi.fn(async () => false) };

  it("asks about every picture's host: with no source, and with the library's stated as its source", async () => {
    const plain = renderGated(elsewhere("plain"), face, outside);
    expect(await screen.findByRole("button", { name: SHOW })).toBeInTheDocument();
    expect(plain.container.querySelector("img")).toBeNull();
    expect(plain.useCases.isInOwnPod).toHaveBeenCalledWith(
      "https://someone.example/plain/catalog.ttl",
    );
    plain.unmount();

    const ofLibrary = renderGated(
      { ...elsewhere("stated-library"), sourceUrl: LIBRARY_RELEASE },
      face,
      outside,
    );
    expect(await screen.findByRole("button", { name: SHOW })).toBeInTheDocument();
    expect(ofLibrary.container.querySelector("img")).toBeNull();
    expect(ofLibrary.useCases.listLibraryDecks).not.toHaveBeenCalled();
  });

  it("does not believe a host its entry states", async () => {
    const { container } = renderGated(
      { ...elsewhere("stated-host"), pictureHosts: ["author.example"] },
      face,
      outside,
    );
    expect(await screen.findByRole("button", { name: SHOW })).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("keeps a choice for the page, on no pod, for that deck and host alone", async () => {
    const chosen = elsewhere("chosen");
    const first = renderGated(chosen, face, outside);
    fireEvent.click(await screen.findByRole("button", { name: SHOW }));
    await waitFor(() => expect(first.container.querySelector("img")).toHaveAttribute("src", FRONT));
    expect(first.useCases.setDeckPictureHost).not.toHaveBeenCalled();
    first.unmount();

    const again = renderGated(chosen, face, outside);
    await waitFor(() => expect(again.container.querySelector("img")).toHaveAttribute("src", FRONT));
    again.unmount();

    const other = renderGated(elsewhere("not-chosen"), face, outside);
    expect(await screen.findByRole("button", { name: SHOW })).toBeInTheDocument();
    expect(other.container.querySelector("img")).toBeNull();
  });
});

describe("a draft's pictures", () => {
  const renderDraft = (draftUrl: string, below: ComponentChildren) =>
    render(<DraftPictures draftUrl={draftUrl}>{below}</DraftPictures>);

  it("ask about a picture's host, and keep a choice for the page, for that draft alone", () => {
    const first = renderDraft("https://pod.example/drafts/one/release.ttl", face);
    expect(first.container.querySelector("img")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: SHOW }));
    expect(first.container.querySelector("img")).toHaveAttribute("src", FRONT);
    first.unmount();

    const again = renderDraft("https://pod.example/drafts/one/release.ttl", face);
    expect(again.container.querySelector("img")).toHaveAttribute("src", FRONT);
    again.unmount();

    const other = renderDraft("https://pod.example/drafts/two/release.ttl", face);
    expect(other.container.querySelector("img")).toBeNull();
    expect(screen.getByRole("button", { name: SHOW })).toBeInTheDocument();
  });
});

describe("a list of a linked deck's cards", () => {
  const row = (
    <>
      <HiddenPicturesNotice urls={[FRONT, undefined, "ftp://a.example/", BACK, OTHER]} />
      <a href="#card">
        <CardRowFront front={{}} back={{ en: "Ett" }} imageUrl={FRONT} />
      </a>
      <a href="#other">
        <CardRowFront front={{ en: "One" }} back={{ en: "Ett" }} imageUrl={FRONT} />
      </a>
    </>
  );

  it("holds a frame in the picture's place, named when it names the link, with the choice per host above the list", async () => {
    const { container, useCases } = renderGated(linked, row);
    const show = await screen.findByRole("button", { name: SHOW });
    expect(screen.getByRole("button", { name: SHOW_OTHER })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("link", { name: "Picture for: Ett" })).toBeInTheDocument();
    expect(container.querySelectorAll(".card-thumbnail-hidden")).toHaveLength(2);
    expect(container.querySelector("[aria-hidden].card-thumbnail-hidden")).not.toBeNull();

    fireEvent.click(show);
    await waitFor(() =>
      expect(useCases.setDeckPictureHost).toHaveBeenCalledWith(linked, "author.example", true),
    );
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect(screen.getByText("Pictures from author.example are shown for this deck.")).toHaveFocus();
    expect(screen.queryByRole("button", { name: SHOW })).toBeNull();
    expect(screen.getByRole("button", { name: SHOW_OTHER })).toBeInTheDocument();
    expect(container.querySelector("img.card-thumbnail")).toHaveAttribute(
      "referrerpolicy",
      "no-referrer",
    );
  });

  it("says nothing on a deck that does not ask", () => {
    renderGated(own, row);
    expect(screen.queryByRole("button", { name: /Show pictures/ })).toBeNull();
    expect(screen.queryByText(/are hidden/)).toBeNull();
  });
});

describe("the answer's picture of a linked deck", () => {
  const card = {
    id: "c1",
    url: "https://pod.example/a/decks/deck-1.ttl#c1",
    front: { en: "One" },
    back: { en: "Ett" },
    frontImageUrl: FRONT,
    backImageUrl: BACK,
    createdAt: "",
    formatVersion: 7,
  } satisfies Card;
  const study = (
    <StudyScreen
      deckName="Words"
      deckHref="#/deck"
      prompt={{ card, direction: "front-to-back" } as Prompt}
      position={1}
      total={1}
      putBack={false}
      answerScale="sm2"
      busy={false}
      error={null}
      onAnswer={vi.fn()}
      onExit={vi.fn()}
    />
  );
  const sources = (container: Element) =>
    [...container.querySelectorAll("img")].map((image) => image.getAttribute("src"));

  it("requests nothing from a host not chosen, before the reveal or after it", async () => {
    const { container } = renderGated(linked, study);
    await screen.findByRole("button", { name: SHOW });
    expect(sources(container)).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    expect(screen.getAllByRole("button", { name: SHOW })).toHaveLength(2);
    expect(sources(container)).toEqual([]);
  });

  it("is on the page with the question's once chosen, hidden, and the same element when revealed, so the reveal requests nothing", async () => {
    const { container } = renderGated({ ...linked, pictureHosts: ["author.example"] }, study);
    await waitFor(() => expect(sources(container)).toEqual([FRONT, BACK]));
    const answer = container.querySelector<HTMLImageElement>(`img[src="${BACK}"]`)!;
    expect(answer.closest(".study-face")).toHaveAttribute("hidden");
    expect(screen.queryByRole("img", { name: "Picture on the back of the card" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    expect(container.querySelector(`img[src="${BACK}"]`)).toBe(answer);
    expect(answer.closest(".study-face")).not.toHaveAttribute("hidden");
    expect(answer.closest(".study-face")).toHaveFocus();
  });

  it("stays off the page until the reveal on a deck that does not ask", async () => {
    const { container } = renderGated(own, study);
    await waitFor(() => expect(sources(container)).toEqual([FRONT]));
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    expect(sources(container)).toEqual([FRONT, BACK]);
  });

  it("does the same on a course's question: on the page with the question, the same element once checked", async () => {
    const question = { ...courseCards[0]!, backImageUrl: BACK };
    const choices = choicesOf(question, noShuffle);
    const props = {
      card: question,
      choices,
      focusQuestion: false,
      busy: false,
      error: null,
      nextLabel: "Next",
      onCheck: vi.fn(),
      onNext: vi.fn(),
    };
    const { container, showBelow } = renderGated(
      { ...linked, pictureHosts: ["author.example"] },
      <CourseQuestion {...props} answer={null} />,
    );
    const answer = await waitFor(() => {
      const found = container.querySelector<HTMLImageElement>(`img[src="${BACK}"]`);
      expect(found).not.toBeNull();
      return found!;
    });
    expect(answer.closest(".course-feedback")).toHaveAttribute("hidden");
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();

    showBelow(<CourseQuestion {...props} answer={{ choice: choices[0]!, effect: "none" }} />);
    expect(container.querySelector(`img[src="${BACK}"]`)).toBe(answer);
    expect(answer.closest(".course-feedback")).not.toHaveAttribute("hidden");
    expect(answer.closest(".course-feedback")).toHaveFocus();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
  });
});
