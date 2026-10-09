import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { AppError } from "@solid-memo/domain/appError";
import type { Deck } from "@solid-memo/domain/deck";
import { CH1, CH2, courseDeck, courseInstance, courseLibraryDeck, makeCourse } from "@solid-memo/ui/test/course";
import { makeUseCasesFake } from "@solid-memo/ui/test/useCasesFake";
import { DeckAboutContainer } from "./DeckAboutContainer";
import { choose } from "../test/choose";
import { instanceA, makeCard, makeDeck } from "../test/fixtures";

const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";
const BY = "https://creativecommons.org/licenses/by/4.0/";
const kanji: Deck = { ...makeDeck("deck-1", { en: "Kanji N5" }), description: { en: "Characters." } };

function renderContainer(useCases: UseCases, deck: Deck = kanji, instance = instanceA) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <DeckAboutContainer useCases={useCases} instance={instance} deck={deck} appHref="#/deck" />
    </QueryClientProvider>,
  );
  return { invalidate };
}

afterEach(() => vi.unstubAllGlobals());

describe("DeckAboutContainer", () => {
  it("shows what the deck says of itself, how it is studied, and its page in Solid Memo", async () => {
    renderContainer(makeUseCasesFake());
    expect(screen.getByText("Loading preferences…")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "About: Kanji N5" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open this deck in Solid Memo" })).toHaveAttribute("href", "#/deck");
    expect(screen.getByText("Characters.")).toBeInTheDocument();
    expect(screen.getByText("No authors or licence stated.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Front → back" })).toBeChecked();
    expect(screen.getByRole("link", { name: "study preferences" })).toHaveAttribute(
      "href",
      `#/preferences?instance=${encodeURIComponent(instanceA.url)}`,
    );
    expect(await screen.findByText("Every card says which language its text is in.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Course progress" })).toBeNull();
  });

  it("renames the deck, asking the language of a translation first", async () => {
    const useCases = makeUseCasesFake();
    const { invalidate } = renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Rename" }));
    fireEvent.click(screen.getByRole("button", { name: "Add a translation" }));
    fireEvent.input(screen.getByLabelText("Translation, its language not chosen"), { target: { value: "Kanji" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(useCases.renameDeck).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Language: not stated" })).toHaveAccessibleDescription("Choose the language of the deck's name.");
    fireEvent.click(screen.getByRole("button", { name: "Remove this translation" }));
    fireEvent.input(screen.getByLabelText("Deck name"), { target: { value: "Kanji" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(useCases.renameDeck).toHaveBeenCalledWith(kanji, { en: "Kanji" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["decks"] });

    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Rename" })).toBeInTheDocument();
  });

  it("describes the deck", async () => {
    const useCases = makeUseCasesFake();
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Describe deck" }));
    fireEvent.input(screen.getByLabelText("Description"), { target: { value: "Every N5 kanji." } });
    fireEvent.click(screen.getByRole("button", { name: "Save description" }));
    await waitFor(() => expect(useCases.describeDeck).toHaveBeenCalledWith(kanji, expect.objectContaining({ description: { en: "Every N5 kanji." } })));
  });

  it("gives the deck its authors and licence, keeping the form while a save is refused", async () => {
    const useCases = makeUseCasesFake();
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Edit authors and licence" }));
    fireEvent.input(screen.getByRole("textbox", { name: "Author 1" }), { target: { value: "Ada Lovelace" } });
    fireEvent.click(screen.getByRole("button", { name: "Add an author" }));
    fireEvent.input(screen.getByRole("textbox", { name: "Author 2" }), { target: { value: "ada lovelace" } });
    choose("Licence", CC0);
    fireEvent.click(screen.getByRole("button", { name: "Save authors and licence" }));
    expect(await screen.findByText("ada lovelace is named twice. Name each author once.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Author 2" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove author 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Save authors and licence" }));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Author 1" })).toBeNull());
    expect(useCases.setDeckProvenance).toHaveBeenLastCalledWith(kanji, { authors: ["Ada Lovelace"], license: CC0 });
  });

  it("edits the authors and licence the deck has, a licence of another app's kept on offer, and cancels", async () => {
    const own = "https://example.org/terms";
    const useCases = makeUseCasesFake();
    renderContainer(useCases, { ...kanji, authors: ["Ada Lovelace"], license: own });
    const section = await screen.findByRole("region", { name: "Authors and licence" });
    expect(section).toHaveTextContent("By Ada Lovelace · https://example.org/terms");
    fireEvent.click(screen.getByRole("button", { name: "Edit authors and licence" }));
    expect(screen.getByRole("textbox", { name: "Author 1" })).toHaveValue("Ada Lovelace");
    const licence = screen.getByRole("combobox", { name: "Licence" });
    expect(licence).toHaveValue(own);
    expect(within(licence).getByRole("option", { name: own })).toBeInTheDocument();
    expect(within(licence).getByRole("option", { name: "CC BY 4.0" })).toHaveValue(BY);
    choose("Licence", "");
    fireEvent.click(screen.getByRole("button", { name: "Save authors and licence" }));
    await waitFor(() => expect(useCases.setDeckProvenance).toHaveBeenCalledWith(expect.anything(), { authors: ["Ada Lovelace"] }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit authors and licence" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("combobox", { name: "Licence" })).toBeNull();
  });

  it("sets the pace, then the direction only when it changes", async () => {
    const useCases = makeUseCasesFake();
    renderContainer(useCases);
    fireEvent.input(await screen.findByRole("spinbutton", { name: "New cards per day" }), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save study settings" }));
    await waitFor(() => expect(useCases.setDeckPace).toHaveBeenCalledWith(kanji, { newCardsPerDay: 5 }));
    expect(useCases.setDeckDirection).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: "Both ways" }));
    fireEvent.click(screen.getByRole("button", { name: "Save study settings" }));
    await waitFor(() => expect(useCases.setDeckDirection).toHaveBeenCalledWith({ ...kanji, newCardsPerDay: 5 }, "bidirectional"));
  });

  it("states the language of the cards' sides", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const card = { ...makeCard(kanji, "water"), front: { "": "水" } };
    const useCases = makeUseCasesFake({ listCards: vi.fn(async () => [card]), stateCardLanguages: vi.fn(async () => 1) });
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Language: not stated" }));
    fireEvent.click(screen.getByRole("radio", { name: "English (en)" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByRole("button", { name: "State the language" }));
    await waitFor(() => expect(useCases.stateCardLanguages).toHaveBeenCalledWith(kanji, { front: "en" }));
    expect(await screen.findByText("Saved the language of 1 card.")).toBeInTheDocument();
  });

  it("says why the instance's preferences, or the cards, could not be read", async () => {
    renderContainer(
      makeUseCasesFake({
        getPreferences: vi.fn(async () => {
          throw new Error("Preferences unreadable");
        }),
      }),
    );
    expect(await screen.findByText("Preferences unreadable")).toBeInTheDocument();
  });

  it("says why the languages of the cards could not be checked", async () => {
    renderContainer(
      makeUseCasesFake({
        listCards: vi.fn(async () => {
          throw new Error("Cards unreadable");
        }),
      }),
    );
    expect(await screen.findByText("Cards unreadable")).toBeInTheDocument();
    expect(screen.getByText("The languages of the cards could not be checked.")).toBeInTheDocument();
  });

  it("says why the release the deck came from could not be read, which the languages are weighed against", async () => {
    renderContainer(
      makeUseCasesFake({
        deckRelease: vi.fn(async () => {
          throw new Error("Release unreadable");
        }),
      }),
      { ...kanji, sourceUrl: "https://solid-memo.com/decks/kanji/v1.ttl" },
    );
    expect(await screen.findByText("Release unreadable")).toBeInTheDocument();
  });

  it("shows a course's progress: marks a chapter not done, and restarts the course once confirmed", async () => {
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    vi.stubGlobal("confirm", confirm);
    const course = makeCourse(["q-1"], [CH1]);
    const useCases = makeUseCasesFake({
      listLibraryDecks: vi.fn(async () => [courseLibraryDeck]),
      getCourse: vi.fn(async () => course),
    });
    const { invalidate } = renderContainer(useCases, course.deck, courseInstance);
    const section = await screen.findByRole("region", { name: "Course progress" });
    expect(await within(section).findAllByRole("listitem")).toHaveLength(2);
    expect(within(section).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Linked data Done Mark not done",
      "Pods Open",
    ]);
    fireEvent.click(within(section).getByRole("button", { name: "Mark Linked data not done" }));
    await waitFor(() => expect(useCases.setCompletedChapters).toHaveBeenCalledWith(course.deck, { kind: "notDone", chapterUrl: CH1 }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["course", courseDeck.url] });

    fireEvent.click(within(section).getByRole("button", { name: "Restart the course" }));
    expect(confirm).toHaveBeenCalledWith(
      "Restart the course? Every chapter is marked not done, so the first one opens again. Your answers and your progress on the cards stay.",
    );
    expect(useCases.setCompletedChapters).toHaveBeenCalledTimes(1);
    fireEvent.click(within(section).getByRole("button", { name: "Restart the course" }));
    await waitFor(() => expect(useCases.setCompletedChapters).toHaveBeenLastCalledWith(course.deck, { kind: "restart" }));
  });

  it("lists the chapters completed that the course no longer has, and offers no restart with nothing done", async () => {
    const old = `${CH2.replace("#ch-2", "#ch-old")}`;
    const done = makeCourse([], [old]);
    const { completedChapters: _, ...never } = makeCourse().deck;
    const fresh = { ...makeCourse(), deck: never };
    const getCourse = vi.fn().mockResolvedValueOnce(done).mockResolvedValue(fresh);
    const useCases = makeUseCasesFake({ listLibraryDecks: vi.fn(async () => [courseLibraryDeck]), getCourse });
    renderContainer(useCases, done.deck, courseInstance);
    expect(await screen.findByText("Completed chapters the course no longer has:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restart the course" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark ch-old not done" }));
    await waitFor(() => expect(useCases.setCompletedChapters).toHaveBeenCalledWith(done.deck, { kind: "notDone", chapterUrl: old }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Restart the course" })).toBeNull());
  });

  it("says while a course is read, and why it could not be", async () => {
    let fail: (error: Error) => void = () => undefined;
    const useCases = makeUseCasesFake({
      listLibraryDecks: vi.fn(async () => [courseLibraryDeck]),
      getCourse: vi.fn(() => new Promise<never>((_resolve, reject) => (fail = reject))),
    });
    renderContainer(useCases, courseDeck, courseInstance);
    const section = await screen.findByRole("region", { name: "Course progress" });
    expect(section).toHaveTextContent("Loading the course…");
    await waitFor(() => expect(useCases.getCourse).toHaveBeenCalled());
    fail(new AppError("deckGone", { deck: courseDeck.title }));
    await waitFor(() => expect(section).toHaveTextContent("The deck “Solid fundamentals” no longer exists."));
  });
});
