import { describe, expect, it, vi } from "vitest";
import { useState } from "preact/hooks";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { planCardEdit } from "@solid-memo/domain/cardBulk";
import { DEFAULT_CARD_QUERY, type CardQuery, type CardRow } from "@solid-memo/domain/cardQuery";
import { CardWorkbenchScreen } from "./CardWorkbenchScreen";
import { choose } from "../test/choose";
import { makeCard, makeDeck } from "../test/fixtures";

const deck = makeDeck("deck-1", { en: "Kanji N5" });
const nouns = makeDeck("nouns", { en: "Nouns" });
const water = { ...makeCard(deck, "water"), front: { ja: "水" }, back: { en: "**Water**" }, textFormat: SM.markdown };
const fire = { ...makeCard(deck, "fire", true), front: { ja: "火" }, back: { en: "Fire" } };
const tree = { ...makeCard(deck, "tree"), front: { ja: "木" }, back: { en: "Tree" } };

const rows: CardRow[] = [
  { card: water, states: [], due: "2026-10-12", intervalDays: 1, easeFactor: 2.5, lapses: 2 },
  { card: fire, states: [] },
  { card: tree, states: [], due: "2026-11-02", intervalDays: 21, easeFactor: 2.36 },
];

type Props = Parameters<typeof CardWorkbenchScreen>[0];

/** The screen with its query kept as the workspace keeps it (in the URL), every change seen by `onQuery`. */
function Harness({ initial = DEFAULT_CARD_QUERY, onQuery, ...overrides }: Partial<Props> & { initial?: CardQuery }) {
  const [query, setQuery] = useState<CardQuery>(initial);
  return (
    <CardWorkbenchScreen
      deck={deck}
      course={false}
      rows={rows}
      total={4}
      languages={["en", "ja", "unstated"]}
      lapses={{ lapses: new Map([[water.url, 2]]), since: "2025-03" }}
      lapsesFailed={false}
      scheduleHref="#/schedule"
      query={query}
      onQuery={(next) => {
        onQuery?.(next);
        setQuery(next);
      }}
      cardHref={(card) => `#/card?card=${card.id}`}
      onOpen={() => undefined}
      plan={(ids, edit) => planCardEdit(rows.map((row) => row.card), ids, edit)}
      onEdit={async () => true}
      lastEdit={null}
      undone={false}
      onUndo={() => undefined}
      today="2026-10-09"
      onReviewEdit={async () => true}
      reviewDone={null}
      decks={[nouns]}
      onTransfer={async () => true}
      transferDone={null}
      busy={false}
      error={null}
      {...overrides}
    />
  );
}

const table = () => screen.getByRole("table", { name: "The cards of Kanji N5" });
const fronts = () => within(table()).getAllByRole("rowheader").map((cell) => cell.textContent);
const link = (front: string | RegExp) => within(table()).getByRole("link", { name: front });
const key = (target: Element, name: string, extra: KeyboardEventInit = {}) => fireEvent.keyDown(target, { key: name, ...extra });

describe("CardWorkbenchScreen", () => {
  it("shows each card's lapses, says since when they count, and links to the deck's schedule", () => {
    const { rerender } = render(<Harness />);
    expect(screen.getByText("Lapses count the card's wrong answers since March 2025, the month of the deck's first answer in the log.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Schedule, lapses and leeches" })).toHaveAttribute("href", "#/schedule");
    rerender(<Harness lapses={undefined} />);
    expect(screen.getByText("Reading the answer log for the lapses…")).toBeInTheDocument();
    rerender(<Harness lapses={{ lapses: new Map(), since: null }} />);
    expect(screen.getByText("Lapses count the card's wrong answers: none are logged yet.")).toBeInTheDocument();
    rerender(<Harness lapsesFailed={true} />);
    expect(screen.getByText("The answer log could not be read, so the lapses are not known.")).toBeInTheDocument();
  });

  it("has a row per card, named by its front, with its back, schedule, when it was added and its id", () => {
    render(<Harness />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Cards: Kanji N5");
    expect(within(table()).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Select",
      "Front",
      "Back",
      "Due",
      "Interval",
      "Ease",
      "Lapses",
      "Added",
      "Id",
    ]);
    const row = within(table()).getByRole("row", { name: /水/ });
    expect(link("水")).toHaveAttribute("href", "#/card?card=water");
    // Markdown, shown as such.
    expect(within(row).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "",
      "Water",
      "October 12, 2026",
      "1 day",
      "2.50",
      "2",
      "September 21, 2026",
      "water",
    ]);
    expect(within(within(table()).getByRole("row", { name: /木/ })).getAllByRole("cell")[3]).toHaveTextContent("21 days");
    const retired = within(table()).getByRole("row", { name: /火/ });
    expect(retired).toHaveClass("retired");
    expect(within(retired).getByRole("rowheader")).toHaveTextContent("火Retired");
    expect(within(retired).getAllByRole("cell").slice(2, 5).map((cell) => cell.textContent)).toEqual(
      Array(3).fill("–Not studied yet"),
    );
    expect(screen.getByText("3 of 4 cards")).toBeInTheDocument();
    expect(screen.getByText(/move between the cards/)).toHaveTextContent(
      "Keys: j and k move between the cards, x selects one, Enter opens it.",
    );
    expect(screen.queryByText("Course")).toBeNull();
  });

  it("labels a course's copy", () => {
    render(<Harness course />);
    expect(screen.getByText("Course")).toHaveClass("studio-badge");
    expect(screen.getByText("A copy of a course: its cards are the course's questions.")).toBeInTheDocument();
  });

  it("says when the deck has no cards, or none matches", () => {
    const { unmount } = render(<Harness rows={[]} total={0} />);
    expect(screen.getByText("No cards in this deck yet.")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).toBeNull();
    unmount();
    render(<Harness rows={[]} />);
    expect(screen.getByText("No card matches.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    // No rows to move between.
    key(screen.getByRole("heading", { level: 2 }), "j");
    expect(screen.getByRole("heading", { level: 2 })).not.toHaveFocus();
  });

  it("sorts by a column, then the other way, then not, saying so on the column", () => {
    const onQuery = vi.fn();
    render(<Harness onQuery={onQuery} />);
    const header = (name: string) => within(table()).getByRole("columnheader", { name });
    fireEvent.click(within(table()).getByRole("button", { name: "Ease" }));
    expect(onQuery).toHaveBeenLastCalledWith({ ...DEFAULT_CARD_QUERY, sort: { key: "ease", descending: false } });
    expect(header("Ease")).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(within(table()).getByRole("button", { name: "Ease" }));
    expect(header("Ease")).toHaveAttribute("aria-sort", "descending");
    expect(header("Front")).not.toHaveAttribute("aria-sort");
    fireEvent.click(within(table()).getByRole("button", { name: "Ease" }));
    expect(header("Ease")).not.toHaveAttribute("aria-sort");
  });

  it("searches and filters, each change from the first page", () => {
    const onQuery = vi.fn();
    render(<Harness initial={{ ...DEFAULT_CARD_QUERY, page: 2, size: 10 }} onQuery={onQuery} />);
    fireEvent.input(screen.getByRole("searchbox", { name: "Search" }), { target: { value: "wat" } });
    expect(onQuery).toHaveBeenLastCalledWith({ ...DEFAULT_CARD_QUERY, text: "wat", size: 10 });
    choose("In", "back");
    expect(onQuery).toHaveBeenLastCalledWith({ ...DEFAULT_CARD_QUERY, text: "wat", field: "back", size: 10 });
    expect(within(screen.getByRole("combobox", { name: "Language" })).getAllByRole("option").map((o) => o.textContent)).toEqual(
      ["Any language", expect.stringMatching(/^English/), expect.stringMatching(/^Japanese/), "No language stated"],
    );
    choose("Language", "unstated");
    choose("State", "due");
    choose("Has", "picture");
    choose("Cards per page", "200");
    expect(onQuery).toHaveBeenLastCalledWith({
      ...DEFAULT_CARD_QUERY,
      text: "wat",
      field: "back",
      lang: "unstated",
      state: "due",
      has: "picture",
      size: 200,
    });
    // The first choice again: any.
    choose("Language", "");
    choose("Has", "");
    expect(onQuery).toHaveBeenLastCalledWith({ ...DEFAULT_CARD_QUERY, text: "wat", field: "back", state: "due", size: 200 });
  });

  it("offers the language the URL names though the deck's sides have none in it, to clear it", () => {
    const onQuery = vi.fn();
    render(<Harness initial={{ ...DEFAULT_CARD_QUERY, lang: "de" }} onQuery={onQuery} />);
    const language = screen.getByRole("combobox", { name: "Language" });
    expect(language).toHaveValue("de");
    expect(within(language).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Any language",
      expect.stringMatching(/^English/),
      expect.stringMatching(/^Japanese/),
      "No language stated",
      expect.stringMatching(/^German/),
    ]);
    choose("Language", "");
    expect(onQuery).toHaveBeenLastCalledWith(DEFAULT_CARD_QUERY);
  });

  it("shows a page at a time, with a pager while there are more", () => {
    const onQuery = vi.fn();
    const many = Array.from({ length: 12 }, (_, i) => ({ card: { ...tree, id: `c${i}`, url: `${tree.url}${i}` }, states: [] }));
    render(<Harness rows={many} initial={{ ...DEFAULT_CARD_QUERY, size: 10 }} onQuery={onQuery} />);
    expect(fronts()).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onQuery).toHaveBeenLastCalledWith({ ...DEFAULT_CARD_QUERY, size: 10, page: 2 });
    expect(fronts()).toHaveLength(2);
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });

  it("selects cards one by one or a page's at once, counting them aloud, and clears the selection", () => {
    render(<Harness />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("0 cards selected");
    expect(screen.queryByRole("button", { name: "Clear selection" })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select 水" }));
    expect(status).toHaveTextContent("1 card selected");
    const all = screen.getByRole("checkbox", { name: "Select every card on this page" });
    fireEvent.click(all);
    expect(status).toHaveTextContent("3 cards selected");
    expect(all).toBeChecked();
    fireEvent.click(all);
    expect(status).toHaveTextContent("0 cards selected");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select 木" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(status).toHaveTextContent("0 cards selected");
  });

  it("moves between the rows with j and k, selects one with x and opens one with Enter", () => {
    const onOpen = vi.fn();
    render(<Harness onOpen={onOpen} />);
    const heading = screen.getByRole("heading", { level: 2 });
    // Nowhere in the table yet: x and Enter do nothing, k goes to the first row as j does.
    key(heading, "x");
    key(heading, "Enter");
    expect(screen.getByRole("status")).toHaveTextContent("0 cards selected");
    key(heading, "k");
    expect(link("水")).toHaveFocus();
    key(link("水"), "j");
    expect(link(/^火/)).toHaveFocus();
    key(link(/^火/), "j");
    key(link("木"), "j");
    expect(link("木")).toHaveFocus();
    key(link("木"), "k");
    expect(link(/^火/)).toHaveFocus();
    key(link(/^火/), "x");
    expect(screen.getByRole("checkbox", { name: "Select 火" })).toBeChecked();
    // On the row's link, Enter is the link's own; on its checkbox, it opens the card.
    key(link(/^火/), "Enter");
    expect(onOpen).not.toHaveBeenCalled();
    const box = screen.getByRole("checkbox", { name: "Select 火" });
    box.focus();
    key(box, "x");
    expect(box).not.toBeChecked();
    key(box, "Enter");
    expect(onOpen).toHaveBeenCalledWith(fire);
  });

  it("takes the keys with the focus on the page's body, as a reload or a cleared selection leaves it", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select 水" }));
    const clear = screen.getByRole("button", { name: "Clear selection" });
    clear.focus();
    fireEvent.click(clear);
    expect(document.body).toHaveFocus();
    key(document.body, "j");
    expect(link("水")).toHaveFocus();
  });

  it("leaves the keys to the search and the filters, and to shortcuts with a modifier", () => {
    render(<Harness />);
    const search = screen.getByRole("searchbox", { name: "Search" });
    key(search, "j");
    key(screen.getByRole("combobox", { name: "State" }), "j");
    key(screen.getByRole("heading", { level: 2 }), "j", { ctrlKey: true });
    key(screen.getByRole("heading", { level: 2 }), "q");
    expect(document.activeElement).not.toBe(link("水"));
  });

  it("edits the selected cards the query keeps, deleted ones leaving the selection", async () => {
    vi.stubGlobal("confirm", () => true);
    const onEdit = vi.fn(async () => true);
    render(<Harness onEdit={onEdit} />);
    expect(screen.queryByRole("group", { name: "Selected cards" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select 木" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select 水" }));
    const bulk = screen.getByRole("group", { name: "Selected cards" });
    fireEvent.click(within(bulk).getByRole("button", { name: "Retire" }));
    // In the table's order.
    expect(onEdit).toHaveBeenCalledWith(["water", "tree"], { kind: "retire" }, expect.objectContaining({ inverse: expect.anything() }));
    fireEvent.click(within(bulk).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.getAllByRole("status")[0]).toHaveTextContent("0 cards selected"));
    vi.unstubAllGlobals();
  });

  it("forgets or reschedules the selected cards' progress, and says what it did", () => {
    vi.stubGlobal("confirm", () => true);
    const onReviewEdit = vi.fn(async () => true);
    const { rerender } = render(<Harness onReviewEdit={onReviewEdit} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select 木" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Selected cards" })).getByRole("button", { name: "Forget progress" }));
    expect(onReviewEdit).toHaveBeenCalledWith(["tree"], { kind: "reset" });
    vi.unstubAllGlobals();
    rerender(<Harness reviewDone={{ edit: { kind: "reset" }, count: 2 }} />);
    expect(screen.getByText("Forgot the progress of 2 cards.")).toBeInTheDocument();
    rerender(<Harness reviewDone={{ edit: { kind: "reschedule", due: "2026-10-20" }, count: 1 }} />);
    expect(screen.getByText("Set 1 card due on October 20, 2026.")).toBeInTheDocument();
    rerender(<Harness reviewDone={{ edit: { kind: "reschedule", due: "2026-10-20" }, count: 0 }} />);
    expect(screen.getByText("None of the selected cards has been studied yet.")).toBeInTheDocument();
  });

  it("moves or copies the selected cards, a move clearing them from the selection, and says what it did", async () => {
    const onTransfer = vi.fn(async () => true);
    const { rerender } = render(<Harness onTransfer={onTransfer} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select 木" }));
    const bulk = () => within(screen.getByRole("group", { name: "Selected cards" }));
    fireEvent.click(bulk().getByRole("button", { name: "Copy to deck…" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy 1 card" }));
    expect(onTransfer).toHaveBeenCalledWith(["tree"], { to: nouns, mode: "copy", keepProgress: true });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Copy 1 card" })).toBeNull());
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("1 card selected");
    fireEvent.click(bulk().getByRole("button", { name: "Move to deck…" }));
    fireEvent.click(screen.getByRole("button", { name: "Move 1 card" }));
    await waitFor(() => expect(screen.getAllByRole("status")[0]).toHaveTextContent("0 cards selected"));

    const plan = {
      cards: [
        { from: "tree", to: "tree", present: false },
        { from: "fire", to: "fire", present: false },
      ],
      missing: [],
      target: { save: [], reviewSaves: [], reviewRemovals: [] },
      source: { remove: [], reviewRemovals: [] },
    };
    rerender(<Harness transferDone={{ transfer: { to: nouns, mode: "move", keepProgress: false }, plan }} />);
    expect(screen.getByText("Moved 2 cards to Nouns.")).toBeInTheDocument();
  });

  it("keeps the selection when a move fails", async () => {
    const onTransfer = vi.fn(async () => false);
    render(<Harness onTransfer={onTransfer} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select 木" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Selected cards" })).getByRole("button", { name: "Move to deck…" }));
    fireEvent.click(screen.getByRole("button", { name: "Move 1 card" }));
    await waitFor(() => expect(onTransfer).toHaveBeenCalled());
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("1 card selected");
  });

  it("keeps the selection when a deletion fails", async () => {
    vi.stubGlobal("confirm", () => true);
    const onEdit = vi.fn(async () => false);
    render(<Harness onEdit={onEdit} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select 木" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Selected cards" })).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onEdit).toHaveBeenCalled());
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("1 card selected");
    vi.unstubAllGlobals();
  });

  it("says what the last edit did, and undoes it", () => {
    const onUndo = vi.fn();
    const plan = planCardEdit([water, fire], ["water", "fire"], { kind: "setTextFormat", markdown: false });
    const { rerender } = render(<Harness lastEdit={{ edit: { kind: "setTextFormat", markdown: false }, plan }} onUndo={onUndo} />);
    expect(screen.getByText("Wrote 1 card as plain text. 1 card was left as it was.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalled();
    const markdown = planCardEdit([water, fire], ["fire"], { kind: "setTextFormat", markdown: true });
    rerender(<Harness lastEdit={{ edit: { kind: "setTextFormat", markdown: true }, plan: markdown }} busy />);
    expect(screen.getByText("Wrote 1 card in Markdown.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    const removal = planCardEdit([water, fire], ["water", "fire"], { kind: "remove" });
    rerender(<Harness lastEdit={{ edit: { kind: "remove" }, plan: removal }} total={0} />);
    // Even with no card left.
    expect(screen.getByText("Deleted 2 cards.")).toBeInTheDocument();
    rerender(<Harness undone error="The cards changed elsewhere." />);
    expect(screen.getByText("Undone: the cards are as they were.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("The cards changed elsewhere.");
  });
});
