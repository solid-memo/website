import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DeckListContainer } from "./DeckListContainer";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Card, Deck, Prompt } from "@solid-memo/domain/deck";
import type { Instance } from "@solid-memo/domain/instance";
import type { StudyQueue } from "@solid-memo/domain/scheduling";
import type { DeckTree, DeckTreeEdit, TreeNode } from "@solid-memo/domain/deckTree";
import { alertTexts, statusTexts } from "../test/liveRegions";
import { AppError } from "@solid-memo/domain/appError";
import { makeUseCasesFake } from "../test/useCasesFake";
import { courseHref, deckHref, routeToHash } from "./router";
import { courseLibraryDeck } from "../test/course";

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

const card: Card = {
  id: "card-1",
  url: `${deck.cardsDocumentUrl}#card-1`,
  front: { "": "水" },
  back: { "": "water" },
  createdAt: "2026-09-21T10:00:00.000Z",
  formatVersion: 1,
};
const prompt: Prompt = { card, direction: "front-to-back" };

function renderContainer(
  useCases: UseCases,
  seed: (queryClient: QueryClient) => void = () => { },
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  seed(queryClient);
  const onStudyDeck = vi.fn();
  const onCourseStarted = vi.fn();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <DeckListContainer
        useCases={useCases}
        instance={instance}
        onStudyDeck={onStudyDeck}
        onCourseStarted={onCourseStarted}
      />
    </QueryClientProvider>,
  );
  return { ...view, onStudyDeck, onCourseStarted, queryClient };
}

describe("DeckListContainer", () => {
  it("shows a loading state, then the decks", async () => {
    const useCases = makeUseCasesFake({
      listDecks: vi.fn(async () => [deck]),
    });
    renderContainer(useCases);
    expect(screen.getByText("Loading decks…")).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: "Kanji N5" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Decks" })).toBeInTheDocument();
  });

  it("shows an error when listing decks fails", async () => {
    renderContainer(
      makeUseCasesFake({
        listDecks: vi.fn(async () => {
          throw new Error("catalog unreachable");
        }),
      }),
    );
    expect(
      await screen.findByText("catalog unreachable"),
    ).toBeInTheDocument();
  });

  it("offers to continue the course of a deck copied from one, the library read for it only", async () => {
    const course = { ...courseLibraryDeck };
    const plain = { ...courseLibraryDeck, url: "https://solid-memo.com/decks/rivers/v1.ttl", seriesUrl: "https://solid-memo.com/decks/index.ttl#rivers", isCourse: undefined };
    const fromCourse = { ...deck, id: "deck-2", url: `${instance.url}catalog.ttl#deck-2`, title: { en: "Solid" }, sourceUrl: course.url };
    const fromPlain = { ...deck, id: "deck-3", url: `${instance.url}catalog.ttl#deck-3`, title: { en: "Rivers" }, sourceUrl: plain.url };
    const useCases = makeUseCasesFake({
      listDecks: vi.fn(async () => [deck, fromCourse, fromPlain]),
      listLibraryDecks: vi.fn(async () => [course, plain]),
    });
    renderContainer(useCases);
    await screen.findByRole("link", { name: "Solid" });
    await waitFor(() => expect(useCases.listLibraryDecks).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Actions for Solid" }));
    expect(await screen.findByRole("menuitem", { name: "Continue course" })).toHaveAttribute(
      "href",
      courseHref(instance.url, fromCourse.url),
    );
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Continue course" }), { key: "Escape" });
    for (const name of ["Rivers", "Kanji N5"]) {
      fireEvent.click(screen.getByRole("button", { name: `Actions for ${name}` }));
      expect(screen.queryByRole("menuitem", { name: "Continue course" })).toBeNull();
      fireEvent.keyDown(screen.getByRole("menuitem", { name: "Preferences" }), { key: "Escape" });
    }
  });

  it("says where a copy of a release added from a link came from, its own release saying whether it is a course", async () => {
    const linkedCourse = { ...deck, id: "deck-2", url: `${instance.url}catalog.ttl#deck-2`, title: { en: "Pods" }, sourceUrl: "https://bob.example/releases/pods/v1.ttl" };
    const linked = { ...deck, id: "deck-3", url: `${instance.url}catalog.ttl#deck-3`, title: { en: "Rivers" }, sourceUrl: "https://bob.example:8443/releases/rivers/v1.ttl" };
    const useCases = makeUseCasesFake({
      listDecks: vi.fn(async () => [deck, linkedCourse, linked]),
      listLibraryDecks: vi.fn(async () => [courseLibraryDeck]),
      deckRelease: vi.fn(async (copy: Deck) => ({ ...courseLibraryDeck, url: copy.sourceUrl!, formatVersion: 6, cards: [], isCourse: copy === linkedCourse ? (true as const) : undefined })),
    });
    renderContainer(useCases);
    expect(await screen.findByRole("link", { name: "Rivers from bob.example:8443" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kanji N5" })).toBeInTheDocument();
    await waitFor(() => expect(useCases.deckRelease).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "Actions for Pods" }));
    expect(await screen.findByRole("menuitem", { name: "Continue course" })).toHaveAttribute("href", courseHref(instance.url, linkedCourse.url));
    expect(screen.getByRole("link", { name: "Add from a link" })).toHaveAttribute("href", routeToHash({ screen: "importUrl", instanceUrl: instance.url }));
  });

  it("reads no library when no deck is copied from it", async () => {
    const useCases = makeUseCasesFake({ listDecks: vi.fn(async () => [deck]) });
    renderContainer(useCases);
    await screen.findByRole("link", { name: "Kanji N5" });
    expect(useCases.listLibraryDecks).not.toHaveBeenCalled();
  });

  describe("the course for newcomers", () => {
    const newcomerCourse = { ...courseLibraryDeck, forNewcomers: true as const };
    const offer = () => screen.queryByRole("complementary", { name: "Solid fundamentals" });

    it("is offered to an instance with no decks, next after the Decks heading the screen focuses", async () => {
      renderContainer(makeUseCasesFake({ listLibraryDecks: vi.fn(async () => [newcomerCourse]) }));
      const aside = await screen.findByRole("complementary", { name: "Solid fundamentals" });
      const heading = screen.getByRole("heading", { name: "Decks" });
      const empty = screen.getByText(/^No decks yet\./);
      expect(heading.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(aside.compareDocumentPosition(empty) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("is offered when the instance has only groups, empty", async () => {
      const groupOnly: DeckTree = {
        children: [{ kind: "group", group: { url: `${instance.url}catalog.ttl#group-1`, title: { en: "Later" } }, children: [] }],
        readOnly: false,
      };
      renderContainer(
        makeUseCasesFake({
          listDeckTree: vi.fn(async () => groupOnly),
          listLibraryDecks: vi.fn(async () => [newcomerCourse]),
        }),
      );
      expect(await screen.findByRole("complementary", { name: "Solid fundamentals" })).toBeInTheDocument();
    });

    it("is not offered once the instance has a deck", async () => {
      const useCases = makeUseCasesFake({
        listDecks: vi.fn(async () => [deck]),
        listLibraryDecks: vi.fn(async () => [newcomerCourse]),
      });
      renderContainer(useCases);
      await screen.findByRole("link", { name: "Kanji N5" });
      expect(offer()).toBeNull();
      expect(useCases.listLibraryDecks).not.toHaveBeenCalled();
    });

    it("opens the course once started, though the deck it brings takes the offer away", async () => {
      let started = false;
      const fromCourse = { ...deck, title: { en: "Solid fundamentals" }, sourceUrl: newcomerCourse.url };
      const useCases = makeUseCasesFake({
        listDecks: vi.fn(async () => (started ? [fromCourse] : [])),
        listLibraryDecks: vi.fn(async () => [newcomerCourse]),
        startCourse: vi.fn(async () => {
          started = true;
          return fromCourse;
        }),
      });
      const { onCourseStarted } = renderContainer(useCases);
      fireEvent.click(await screen.findByRole("button", { name: "Start the course" }));
      await waitFor(() => expect(onCourseStarted).toHaveBeenCalledWith(fromCourse));
      expect(await screen.findByRole("link", { name: "Solid fundamentals" })).toBeInTheDocument();
      expect(offer()).toBeNull();
      expect(useCases.listDeckTree).toHaveBeenCalledTimes(2);
    });
  });

  it("links to this instance's deck creator", async () => {
    renderContainer(makeUseCasesFake({ listDecks: vi.fn(async () => []) }));
    expect(
      await screen.findByRole("link", { name: "Create deck" }),
    ).toHaveAttribute("href", routeToHash({ screen: "deckCreator", instanceUrl: instance.url }));
  });

  it("links a deck's name to its page in this instance", async () => {
    const useCases = makeUseCasesFake({ listDecks: vi.fn(async () => [deck]) });
    renderContainer(useCases);

    expect(
      await screen.findByRole("link", { name: "Kanji N5" }),
    ).toHaveAttribute("href", deckHref(instance.url, deck.url));
  });

  it("suggests Study for a deck with due cards, and starts it", async () => {
    const useCases = makeUseCasesFake({
      listDecks: vi.fn(async () => [deck]),
      getStudyQueue: vi.fn(async () => ({
        due: [prompt],
        newPrompts: [],
        studiedToday: 0,
      })),
    });
    const { onStudyDeck } = renderContainer(useCases);

    fireEvent.click(
      await screen.findByRole("button", { name: "Study Kanji N5" }),
    );
    expect(onStudyDeck).toHaveBeenCalledWith(deck);
    expect(useCases.getStudyQueue).toHaveBeenCalledWith(
      instance.url,
      deck,
      expect.any(Date),
    );
  });

  it("shows stale counts at once while fresh ones are fetched", async () => {
    const useCases = makeUseCasesFake({
      listDecks: vi.fn(async () => [deck]),
      getStudyQueue: vi.fn(() => new Promise<StudyQueue>(() => { })),
    });
    renderContainer(useCases, (queryClient) =>
      queryClient.setQueryData(["studyQueue", deck.url, "counts"], { dueCount: 2, newCount: 0 }, { updatedAt: 0 }),
    );

    expect(
      await screen.findByRole("button", { name: "Study Kanji N5" }),
    ).toBeInTheDocument();
    expect(screen.getByText("2 to review")).toBeInTheDocument();
    await waitFor(() => {
      expect(useCases.getStudyQueue).toHaveBeenCalledOnce();
    });
    expect(screen.queryByText("Checking what is due")).toBeNull();
  });

  it("shows a loader in the action slot until the first queue arrives", async () => {
    let resolveQueue: (queue: StudyQueue) => void = () => { };
    const useCases = makeUseCasesFake({
      listDecks: vi.fn(async () => [deck]),
      getStudyQueue: vi.fn(
        () => new Promise<StudyQueue>((resolve) => (resolveQueue = resolve)),
      ),
    });
    renderContainer(useCases);

    expect(
      await screen.findByText("Checking what is due"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Done for today")).toBeNull();

    await waitFor(() => {
      expect(useCases.getStudyQueue).toHaveBeenCalledOnce();
    });
    resolveQueue({ due: [], newPrompts: [], studiedToday: 0 });
    expect(
      await screen.findByText("Done for today"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Checking what is due")).toBeNull();
  });

  it("suggests Study when only new cards remain", async () => {
    const useCases = makeUseCasesFake({
      listDecks: vi.fn(async () => [deck]),
      getStudyQueue: vi.fn(async () => ({
        due: [],
        newPrompts: [prompt],
        studiedToday: 0,
      })),
    });
    const { onStudyDeck } = renderContainer(useCases);

    fireEvent.click(
      await screen.findByRole("button", { name: "Study Kanji N5" }),
    );
    expect(onStudyDeck).toHaveBeenCalledWith(deck);
    expect(screen.getByText("1 to review")).toBeInTheDocument();
  });

  it("does not suggest studying a deck with nothing left today", async () => {
    renderContainer(
      makeUseCasesFake({ listDecks: vi.fn(async () => [deck]) }),
    );
    expect(
      await screen.findByText("Done for today"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Study|Practice/ })).toBeNull();
  });

  it("suggests nothing while the queue is unknown or unreadable", async () => {
    renderContainer(
      makeUseCasesFake({
        listDecks: vi.fn(async () => [deck]),
        getStudyQueue: vi.fn(async () => {
          throw new Error("reviews unreachable");
        }),
      }),
    );
    await screen.findByRole("link", { name: "Kanji N5" });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Study|Practice/ })).toBeNull();
    });
    expect(
      screen.queryByText("Done for today"),
    ).toBeNull();
    await waitFor(() => {
      expect(
        screen.queryByText("Checking what is due"),
      ).toBeNull();
    });
    expect(screen.queryByText("reviews unreachable")).toBeNull();
  });
});

const second: Deck = { ...deck, id: "deck-2", url: `${instance.url}catalog.ttl#deck-2`, title: { en: "Kana" } };
const groupUrl = `${instance.url}catalog.ttl#group-1`;
const treeKey = ["decks", instance.url, "tree"];
const node = (d: Deck): TreeNode => ({ kind: "deck", deck: d });
const flat: DeckTree = { readOnly: false, children: [node(deck), node(second)] };
const grouped: DeckTree = {
  readOnly: false,
  children: [{ kind: "group", group: { url: groupUrl, title: { en: "Japanese" } }, children: [node(deck)] }, node(second)],
};

/** The deck names in the order the list shows them. */
function order(): string[] {
  return [...document.querySelectorAll(".deck-open")].map((link) => link.textContent!);
}

/** An editDeckTree whose writes the test settles, one by one. */
function deferredEdits() {
  const writes: { edit: DeckTreeEdit; resolve: (tree: DeckTree) => void; reject: (error: Error) => void }[] = [];
  const editDeckTree = vi.fn(
    (_url: string, edit: DeckTreeEdit) =>
      new Promise<DeckTree>((resolve, reject) => writes.push({ edit, resolve, reject })),
  );
  return { editDeckTree, writes };
}

/** Chooses `item` from the actions menu of the deck or group `name`. */
function choose(name: string, item: string) {
  fireEvent.click(screen.getByRole("button", { name: `Actions for ${name}` }));
  fireEvent.click(screen.getByRole("menuitem", { name: item }));
}

function moveDown(name: string) {
  choose(name, "Move down");
}

describe("DeckListContainer, arranging decks", () => {
  beforeEach(() => localStorage.clear());

  it("lists the decks as arranged, under the instance's decks", async () => {
    const useCases = makeUseCasesFake({ listDeckTree: vi.fn(async () => grouped) });
    const { queryClient } = renderContainer(useCases);
    expect(await screen.findByRole("button", { name: "Japanese 1 deck" })).toBeInTheDocument();
    expect(useCases.listDeckTree).toHaveBeenCalledWith(instance.url);
    // Whatever refreshes the instance's decks refreshes their arrangement.
    await queryClient.invalidateQueries({ queryKey: ["decks", instance.url] });
    expect(useCases.listDeckTree).toHaveBeenCalledTimes(2);
  });

  it("shows an edit at once, and the pod's tree once it is written", async () => {
    const { editDeckTree, writes } = deferredEdits();
    const useCases = makeUseCasesFake({ listDecks: vi.fn(async () => [deck, second]), editDeckTree });
    renderContainer(useCases);
    await screen.findByRole("link", { name: "Kana" });
    moveDown("Kanji N5");
    await waitFor(() => {
      expect(order()).toEqual(["Kana", "Kanji N5"]);
    });
    expect(editDeckTree).toHaveBeenCalledWith(instance.url, {
      kind: "move",
      node: deck.url,
      to: { parent: null, after: second.url },
    });
    writes[0]!.resolve({ readOnly: false, children: [node(second), node({ ...deck, title: { en: "Kanji N4" } })] });
    expect(await screen.findByRole("link", { name: "Kanji N4" })).toBeInTheDocument();
  });

  it("takes a failed edit back, says why, and reads the list afresh", async () => {
    const { editDeckTree, writes } = deferredEdits();
    const useCases = makeUseCasesFake({ listDecks: vi.fn(async () => [deck, second]), editDeckTree });
    renderContainer(useCases);
    await screen.findByRole("link", { name: "Kana" });
    moveDown("Kanji N5");
    await waitFor(() => {
      expect(order()).toEqual(["Kana", "Kanji N5"]);
    });
    writes[0]!.reject(new AppError("deckTreeChanged"));
    await waitFor(() => {
      expect(order()).toEqual(["Kanji N5", "Kana"]);
    });
    expect(alertTexts()).toEqual([expect.stringContaining("Your decks were rearranged elsewhere")]);
    await waitFor(() => {
      expect(useCases.listDeckTree).toHaveBeenCalledTimes(2);
    });

    // The next edit clears what the last one said.
    moveDown("Kanji N5");
    await waitFor(() => {
      expect(alertTexts()).toEqual([]);
    });
  });

  it("writes edits one after another, showing all of them meanwhile", async () => {
    const { editDeckTree, writes } = deferredEdits();
    const third: Deck = { ...deck, id: "deck-3", url: `${instance.url}catalog.ttl#deck-3`, title: { en: "Verbs" } };
    const useCases = makeUseCasesFake({ listDecks: vi.fn(async () => [deck, second, third]), editDeckTree });
    renderContainer(useCases);
    await screen.findByRole("link", { name: "Verbs" });
    moveDown("Kanji N5");
    await waitFor(() => {
      expect(order()).toEqual(["Kana", "Kanji N5", "Verbs"]);
    });
    moveDown("Kanji N5");
    await waitFor(() => {
      expect(order()).toEqual(["Kana", "Verbs", "Kanji N5"]);
    });
    expect(editDeckTree).toHaveBeenCalledOnce();

    // The first write's tree would undo the second edit on screen: it waits for it.
    writes[0]!.resolve({ readOnly: false, children: [node(second), node(deck), node(third)] });
    await waitFor(() => {
      expect(editDeckTree).toHaveBeenCalledTimes(2);
    });
    expect(order()).toEqual(["Kana", "Verbs", "Kanji N5"]);
    expect(writes[1]!.edit).toEqual({ kind: "move", node: deck.url, to: { parent: null, after: third.url } });
    writes[1]!.resolve({ readOnly: false, children: [node(second), node(third), node(deck)] });
    await waitFor(() => {
      expect(useCases.listDeckTree).toHaveBeenCalledOnce();
    });
  });

  it("leaves an edit waiting on screen when one before it fails", async () => {
    const { editDeckTree, writes } = deferredEdits();
    const third: Deck = { ...deck, id: "deck-3", url: `${instance.url}catalog.ttl#deck-3`, title: { en: "Verbs" } };
    const useCases = makeUseCasesFake({ listDecks: vi.fn(async () => [deck, second, third]), editDeckTree });
    renderContainer(useCases);
    await screen.findByRole("link", { name: "Verbs" });
    moveDown("Kanji N5");
    await waitFor(() => {
      expect(order()).toEqual(["Kana", "Kanji N5", "Verbs"]);
    });
    moveDown("Kanji N5");
    await waitFor(() => {
      expect(order()).toEqual(["Kana", "Verbs", "Kanji N5"]);
    });
    writes[0]!.reject(new Error("pod unreachable"));
    await waitFor(() => {
      expect(editDeckTree).toHaveBeenCalledTimes(2);
    });
    expect(alertTexts()).toEqual([expect.stringContaining("pod unreachable")]);
    writes[1]!.resolve({ readOnly: false, children: [node(second), node(third), node(deck)] });
    await waitFor(() => {
      expect(order()).toEqual(["Kana", "Verbs", "Kanji N5"]);
    });
  });

  it("leaves an edit the list no longer allows to the pod's tree", async () => {
    const editDeckTree = vi.fn(async () => ({ readOnly: false, children: [node(second), node(deck)] }));
    const useCases = makeUseCasesFake({ listDecks: vi.fn(async () => [deck, second]), editDeckTree });
    const { queryClient } = renderContainer(useCases);
    await screen.findByRole("link", { name: "Kana" });
    fireEvent.click(screen.getByRole("button", { name: "Actions for Kanji N5" }));
    // Changed meanwhile, before the screen shows it.
    queryClient.setQueryData(treeKey, { readOnly: false, children: [node(second)] });
    fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    await waitFor(() => {
      expect(editDeckTree).toHaveBeenCalledOnce();
    });
    await waitFor(() => {
      expect(order()).toEqual(["Kana", "Kanji N5"]);
    });
  });

  it("makes a new group, then names it, in that order", async () => {
    const { editDeckTree, writes } = deferredEdits();
    const useCases = makeUseCasesFake({ listDecks: vi.fn(async () => [deck, second]), editDeckTree });
    renderContainer(useCases);
    await screen.findByRole("link", { name: "Kana" });
    choose("Kana", "Group with the one above");
    expect(useCases.newDeckGroup).toHaveBeenCalledWith(instance.url, { en: "New group" });
    const field = await screen.findByRole("textbox", { name: "Group name" });
    expect(field).toHaveFocus();
    fireEvent.input(field, { target: { value: "Japanese" } });
    fireEvent.submit(field.closest("form")!);
    expect(await screen.findByRole("button", { name: "Japanese 2 decks" })).toBeInTheDocument();
    expect(editDeckTree).toHaveBeenCalledOnce();
    expect(writes[0]!.edit.kind).toBe("combine");

    const groupOf = (title: string): DeckTree => ({
      readOnly: false,
      children: [
        {
          kind: "group",
          group: { url: `${instance.url}catalog.ttl#group-fake`, title: { en: title } },
          children: [node(deck), node(second)],
        },
      ],
    });
    writes[0]!.resolve(groupOf("New group"));
    await waitFor(() => {
      expect(editDeckTree).toHaveBeenCalledTimes(2);
    });
    expect(writes[1]!.edit).toEqual({
      kind: "rename",
      group: `${instance.url}catalog.ttl#group-fake`,
      title: { en: "Japanese" },
    });
    expect(screen.getByRole("button", { name: "Japanese 2 decks" })).toBeInTheDocument();
    writes[1]!.resolve(groupOf("Japanese"));
    await waitFor(() => {
      expect(statusTexts()).toEqual(['Renamed the group to "Japanese".']);
    });
  });

  it("folds groups as this device remembers, forgetting those gone", async () => {
    localStorage.setItem(
      `solid-memo:collapsedGroups.${instance.url}`,
      JSON.stringify([groupUrl, `${instance.url}catalog.ttl#group-gone`]),
    );
    renderContainer(makeUseCasesFake({ listDeckTree: vi.fn(async () => grouped) }));
    const toggle = await screen.findByRole("button", { name: "Japanese 1 deck" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(JSON.parse(localStorage.getItem(`solid-memo:collapsedGroups.${instance.url}`)!)).toEqual([]);
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(JSON.parse(localStorage.getItem(`solid-memo:collapsedGroups.${instance.url}`)!)).toEqual([groupUrl]);
  });

  it("opens a group folded shut as something is moved into it", async () => {
    localStorage.setItem(`solid-memo:collapsedGroups.${instance.url}`, JSON.stringify([groupUrl]));
    renderContainer(makeUseCasesFake({ listDeckTree: vi.fn(async () => grouped) }));
    fireEvent.click(await screen.findByRole("button", { name: `Actions for ${second.title.en}` }));
    fireEvent.click(within(screen.getByRole("group", { name: "Move into" })).getByRole("menuitem", { name: "Japanese" }));
    expect(await screen.findByRole("button", { name: "Japanese 2 decks" })).toHaveAttribute("aria-expanded", "true");
    expect(JSON.parse(localStorage.getItem(`solid-memo:collapsedGroups.${instance.url}`)!)).toEqual([]);
  });

  it("forgets a deleted group's folding", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const useCases = makeUseCasesFake({
      listDeckTree: vi.fn(async () => grouped),
      editDeckTree: vi.fn(async () => flat),
    });
    renderContainer(useCases);
    fireEvent.click(await screen.findByRole("button", { name: "Japanese 1 deck" }));
    choose("Japanese", "Delete group");
    // Once its header has folded away.
    fireEvent.animationEnd(document.querySelector(".deck-group.leaving")!, { animationName: "group-leave" });
    expect(JSON.parse(localStorage.getItem(`solid-memo:collapsedGroups.${instance.url}`)!)).toEqual([]);
    await waitFor(() => {
      expect(useCases.editDeckTree).toHaveBeenCalledWith(instance.url, { kind: "removeGroup", group: groupUrl });
    });
    expect(within(document.querySelector(".deck-tree")!).queryByRole("button", { name: /Japanese/ })).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe("DeckListContainer, renaming and deleting decks", () => {
  beforeEach(() => localStorage.clear());

  it("links a deck's preferences in this instance from its menu", async () => {
    renderContainer(makeUseCasesFake({ listDecks: vi.fn(async () => [deck]) }));
    fireEvent.click(await screen.findByRole("button", { name: "Actions for Kanji N5" }));
    expect(screen.getByRole("menuitem", { name: "Preferences" })).toHaveAttribute(
      "href",
      routeToHash({ screen: "deckPreferences", instanceUrl: instance.url, deckUrl: deck.url }),
    );
  });

  it("shows a deck's new name at once, wherever it is, and reads the decks afresh once it is written", async () => {
    let written: (renamed: Deck) => void = () => undefined;
    const renamed = { ...deck, title: { en: "Kanji N4" } };
    const listDeckTree = vi.fn(async () => grouped);
    const useCases = makeUseCasesFake({
      listDeckTree,
      renameDeck: vi.fn(() => new Promise<Deck>((resolve) => (written = resolve))),
    });
    renderContainer(useCases);
    await screen.findByRole("link", { name: "Kana" });
    choose("Kanji N5", "Rename");
    const field = screen.getByRole("textbox", { name: "Deck name" });
    fireEvent.input(field, { target: { value: "Kanji N4" } });
    fireEvent.submit(field.closest("form")!);
    await waitFor(() => {
      expect(order()).toEqual(["Kanji N4", "Kana"]);
    });
    await waitFor(() => {
      expect(useCases.renameDeck).toHaveBeenCalledWith(deck, { en: "Kanji N4" });
    });
    expect(statusTexts()).toEqual(['Renamed the deck to "Kanji N4".']);
    listDeckTree.mockResolvedValue({
      readOnly: false,
      children: [{ kind: "group", group: { url: groupUrl, title: { en: "Japanese" } }, children: [node(renamed)] }, node(second)],
    });
    written(renamed);
    await waitFor(() => {
      expect(listDeckTree).toHaveBeenCalledTimes(2);
    });
    expect(order()).toEqual(["Kanji N4", "Kana"]);
  });

  it("takes a deck's new name back, and says why, when it cannot be written", async () => {
    const useCases = makeUseCasesFake({
      listDecks: vi.fn(async () => [deck, second]),
      renameDeck: vi.fn(async () => {
        throw new Error("pod unreachable");
      }),
    });
    renderContainer(useCases);
    await screen.findByRole("link", { name: "Kana" });
    choose("Kana", "Rename");
    const field = screen.getByRole("textbox", { name: "Deck name" });
    fireEvent.input(field, { target: { value: "Hiragana" } });
    fireEvent.submit(field.closest("form")!);
    await waitFor(() => {
      expect(alertTexts()).toEqual([expect.stringContaining("pod unreachable")]);
    });
    await waitFor(() => {
      expect(order()).toEqual(["Kanji N5", "Kana"]);
    });
    expect(useCases.listDeckTree).toHaveBeenCalledTimes(2);
  });

  it("deletes a deck once confirmed, its row going once the decks are read afresh", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const listDecks = vi.fn(async () => [deck, second]);
    const useCases = makeUseCasesFake({ listDecks });
    renderContainer(useCases);
    await screen.findByRole("link", { name: "Kana" });
    listDecks.mockResolvedValue([second]);
    choose("Kanji N5", "Delete deck");
    await waitFor(() => {
      expect(order()).toEqual(["Kana"]);
    });
    expect(useCases.removeDeck).toHaveBeenCalledWith(deck);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Actions for Kana" })).toHaveFocus();
    });
    expect(statusTexts()).toEqual(['Deleted the deck "Kanji N5".']);
    vi.unstubAllGlobals();
  });

  it("deletes a deck only once an edit before it is written, the catalog being written by both", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const { editDeckTree, writes } = deferredEdits();
    const third: Deck = { ...deck, id: "deck-3", url: `${instance.url}catalog.ttl#deck-3`, title: { en: "Verbs" } };
    const listDecks = vi.fn(async () => [deck, second, third]);
    const useCases = makeUseCasesFake({ listDecks, editDeckTree });
    renderContainer(useCases);
    await screen.findByRole("link", { name: "Verbs" });
    moveDown("Kanji N5");
    choose("Verbs", "Delete deck");
    await waitFor(() => {
      expect(editDeckTree).toHaveBeenCalledOnce();
    });
    expect(useCases.removeDeck).not.toHaveBeenCalled();
    listDecks.mockResolvedValue([second, deck]);
    writes[0]!.resolve({ readOnly: false, children: [node(second), node(deck), node(third)] });
    await waitFor(() => {
      expect(order()).toEqual(["Kana", "Kanji N5"]);
    });
    expect(useCases.removeDeck).toHaveBeenCalledWith(third);
    vi.unstubAllGlobals();
  });

  it("leaves the arrangement to an edit waiting behind a rename, the decks' other queries read afresh", async () => {
    const { editDeckTree, writes } = deferredEdits();
    let written: (renamed: Deck) => void = () => undefined;
    const useCases = makeUseCasesFake({
      listDecks: vi.fn(async () => [deck, second]),
      editDeckTree,
      renameDeck: vi.fn(() => new Promise<Deck>((resolve) => (written = resolve))),
    });
    const other = ["decks", instance.url, "other"];
    const { queryClient } = renderContainer(useCases, (client) => client.setQueryData(other, 1));
    await screen.findByRole("link", { name: "Kana" });
    choose("Kanji N5", "Rename");
    const field = screen.getByRole("textbox", { name: "Deck name" });
    fireEvent.input(field, { target: { value: "Kanji N4" } });
    fireEvent.submit(field.closest("form")!);
    await screen.findByRole("link", { name: "Kanji N4" });
    moveDown("Kanji N4");
    await waitFor(() => {
      expect(order()).toEqual(["Kana", "Kanji N4"]);
    });
    expect(useCases.renameDeck).toHaveBeenCalledOnce();
    expect(editDeckTree).not.toHaveBeenCalled();
    written({ ...deck, title: { en: "Kanji N4" } });
    await waitFor(() => {
      expect(editDeckTree).toHaveBeenCalledOnce();
    });
    expect(queryClient.getQueryState(other)!.isInvalidated).toBe(true);
    expect(useCases.listDeckTree).toHaveBeenCalledOnce();
    expect(order()).toEqual(["Kana", "Kanji N4"]);
    writes[0]!.resolve({ readOnly: false, children: [node(second), node({ ...deck, title: { en: "Kanji N4" } })] });
    await waitFor(() => {
      expect(editDeckTree).toHaveBeenCalledOnce();
    });
    expect(useCases.listDeckTree).toHaveBeenCalledOnce();
  });

  it("keeps a deck's new name on screen when an edit before it fails, and only the name goes back when it does", async () => {
    const { editDeckTree, writes } = deferredEdits();
    let refused: (error: Error) => void = () => undefined;
    const useCases = makeUseCasesFake({
      listDecks: vi.fn(async () => [deck, second]),
      editDeckTree,
      renameDeck: vi.fn(() => new Promise<Deck>((_, reject) => (refused = reject))),
    });
    renderContainer(useCases);
    await screen.findByRole("link", { name: "Kana" });
    moveDown("Kanji N5");
    choose("Kana", "Rename");
    const field = screen.getByRole("textbox", { name: "Deck name" });
    fireEvent.input(field, { target: { value: "Hiragana" } });
    fireEvent.submit(field.closest("form")!);
    await waitFor(() => {
      expect(order()).toEqual(["Hiragana", "Kanji N5"]);
    });
    writes[0]!.reject(new Error("pod unreachable"));
    await waitFor(() => {
      expect(useCases.renameDeck).toHaveBeenCalledOnce();
    });
    // The rename behind it brings the list afresh: till then, both stay.
    expect(order()).toEqual(["Hiragana", "Kanji N5"]);
    expect(useCases.listDeckTree).toHaveBeenCalledOnce();
    refused(new Error("pod unreachable"));
    await waitFor(() => {
      expect(useCases.listDeckTree).toHaveBeenCalledTimes(2);
    });
    expect(order()).toEqual(["Kanji N5", "Kana"]);
  });

  it("keeps a deck, and says why, when it cannot be deleted; the next try clears that", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    const removeDeck = vi.fn(async () => {
      throw new Error("pod unreachable");
    });
    renderContainer(makeUseCasesFake({ listDecks: vi.fn(async () => [deck, second]), removeDeck }));
    await screen.findByRole("link", { name: "Kana" });
    choose("Kanji N5", "Delete deck");
    await waitFor(() => {
      expect(alertTexts()).toEqual([expect.stringContaining("pod unreachable")]);
    });
    expect(order()).toEqual(["Kanji N5", "Kana"]);
    expect(statusTexts()).toEqual([]);
    removeDeck.mockImplementation(() => new Promise<never>(() => undefined));
    // Deleting it is offered again once the try is through.
    fireEvent.click(screen.getByRole("button", { name: "Actions for Kanji N5" }));
    await waitFor(() => {
      expect(screen.getByRole("menuitem", { name: "Delete deck" })).not.toHaveAttribute("aria-disabled");
    });
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete deck" }));
    await waitFor(() => {
      expect(alertTexts()).toEqual([]);
    });
    vi.unstubAllGlobals();
  });
});
