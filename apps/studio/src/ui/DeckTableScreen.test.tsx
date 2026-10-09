import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "preact/hooks";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import type { DeckTableRow, DeckTableView } from "@solid-memo/domain/deckTable";
import type { DeckGroup } from "@solid-memo/domain/deckTree";
import { I18nProvider } from "@solid-memo/ui/i18n";
import { DeckTableScreen, type DeckBadge } from "./DeckTableScreen";
import { choose } from "../test/choose";
import { instanceA, makeDeck } from "../test/fixtures";

const languages: DeckGroup = { url: `${instanceA.url}catalog.ttl#group-1`, title: { en: "Languages" } };
const scripts: DeckGroup = { url: `${instanceA.url}catalog.ttl#group-2`, title: { en: "Scripts" } };
const kanji = makeDeck("deck-1", { en: "Kanji N5" });
const verbs = { ...makeDeck("deck-2", { en: "Verbs", sv: "Verb" }), direction: "bidirectional" as const, newCardsPerDay: 5 };

const rows: DeckTableRow[] = [
  { deck: kanji, groups: [languages, scripts], figures: { cards: 12, due: 3, new: 4 }, newCardsPerDay: 20, maxReviewsPerDay: 200 },
  { deck: verbs, groups: [], figures: {}, newCardsPerDay: 5, maxReviewsPerDay: 200 },
];

type Props = Parameters<typeof DeckTableScreen>[0];

/** The screen with its view kept as the workspace keeps it (in the URL). */
function Harness({ initial = { filter: "" }, ...overrides }: Partial<Props> & { initial?: DeckTableView }) {
  const [view, setView] = useState<DeckTableView>(initial);
  return (
    <DeckTableScreen
      instance={instanceA}
      rows={rows}
      view={view}
      onView={setView}
      pending={(deck, figure) => (deck.url === verbs.url && figure === "cards" ? "unreadable" : "loading")}
      badges={(deck): DeckBadge[] => (deck.url === kanji.url ? ["library", "invalid"] : [])}
      groups={[
        { group: languages, trail: [languages] },
        { group: scripts, trail: [languages, scripts] },
      ]}
      readOnly={false}
      deckHref={(deck) => `#/deck?deck=${deck.id}`}
      cardsHref={(deck) => `#/browse?deck=${deck.id}`}
      appHref="#/decks"
      groupsHref="#/groups?instance=a"
      instanceHref="#/instance?instance=a"
      healthHref="#/health?instance=a"
      transferHref={(decks) => `#/transfer?${decks.map((deck) => `deck=${deck.id}`).join("&")}`}
      healthBadge={() => null}
      libraryHref="#/library?instance=a"
      updateBadge={() => null}
      onMove={async () => true}
      onPace={async () => true}
      onDirection={async () => true}
      onRemove={async () => true}
      error={null}
      {...overrides}
    />
  );
}

const table = () => screen.getByRole("table", { name: "The decks of Deck set A" });
const names = () => within(table()).getAllByRole("rowheader").map((cell) => within(cell).getByRole("link").textContent);
const select = (name: string) => fireEvent.click(screen.getByRole("checkbox", { name: `Select ${name}` }));

afterEach(() => vi.unstubAllGlobals());

describe("DeckTableScreen", () => {
  it("has a row per deck, named by the deck, with its groups, settings and figures", () => {
    render(<Harness />);
    expect(within(table()).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Select",
      "Deck",
      "Group",
      "Direction",
      "New per day",
      "Reviews per day",
      "Due today",
      "New today",
      "Last changed",
      "Cards",
    ]);
    const row = within(table()).getByRole("row", { name: /Kanji N5/ });
    expect(within(row).getByRole("rowheader")).toHaveTextContent("Kanji N5LibraryInvalid data");
    expect(within(row).getByRole("link", { name: "Kanji N5" })).toHaveAttribute("href", "#/deck?deck=deck-1");
    expect(within(row).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "",
      "Languages › Scripts",
      "Front → back",
      "20 (instance)",
      "200 (instance)",
      "3",
      "4",
      "September 21, 2026",
      "12 cards of Kanji N5",
    ]);
    expect(within(row).getByRole("link", { name: "12 cards of Kanji N5" })).toHaveAttribute(
      "href",
      "#/browse?deck=deck-1",
    );
    // The deck's own pace, and figures not known yet, or not to be.
    const other = within(table()).getByRole("row", { name: /Verbs/ });
    expect(within(other).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "",
      "Top level",
      "Both ways",
      "5",
      "200 (instance)",
      "Counting…",
      "Counting…",
      "September 21, 2026",
      "–Could not be read",
    ]);
    expect(screen.getByRole("link", { name: "Arrange groups" })).toHaveAttribute("href", "#/groups?instance=a");
    expect(screen.getByRole("link", { name: "Name and catalogue" })).toHaveAttribute("href", "#/instance?instance=a");
  });

  it("links to the instance's health, and puts each deck's beside its name", () => {
    render(<Harness healthBadge={(deck) => <a href={`#/health?deck=${deck.id}`}>Health of {deck.id}</a>} />);
    expect(screen.getByRole("link", { name: "Health" })).toHaveAttribute("href", "#/health?instance=a");
    const kanjiRow = within(table()).getAllByRole("rowheader")[0]!;
    expect(within(kanjiRow).getByRole("link", { name: "Health of deck-1" })).toHaveAttribute("href", "#/health?deck=deck-1");
  });

  it("links to the instance's library copies, and puts a deck's update beside its name", () => {
    render(<Harness updateBadge={(deck) => (deck.url === kanji.url ? <a href="#/library?instance=a">Release 2 out</a> : null)} />);
    expect(screen.getByRole("link", { name: "Library copies" })).toHaveAttribute("href", "#/library?instance=a");
    const kanjiRow = within(table()).getAllByRole("rowheader")[0]!;
    expect(within(kanjiRow).getByRole("link", { name: "Release 2 out" })).toHaveAttribute("href", "#/library?instance=a");
  });

  it("links to import and export, and exports the selected decks there", () => {
    render(<Harness />);
    expect(screen.getByRole("link", { name: "Import and export" })).toHaveAttribute("href", "#/transfer?");
    select("Verbs");
    select("Kanji N5");
    const bulk = screen.getByRole("group", { name: "Selected decks" });
    expect(within(bulk).getByRole("link", { name: "Export" })).toHaveAttribute("href", "#/transfer?deck=deck-1&deck=deck-2");
  });

  it("sorts by a column, then the other way, then as arranged, saying so on the column", () => {
    render(<Harness />);
    const sortBy = (name: string) => fireEvent.click(within(table()).getByRole("button", { name }));
    const header = (name: string) => within(table()).getByRole("columnheader", { name });
    expect(header("Deck")).not.toHaveAttribute("aria-sort");
    sortBy("Due today");
    expect(header("Due today")).toHaveAttribute("aria-sort", "ascending");
    // Verbs' count is not known yet: last, either way.
    expect(names()).toEqual(["Kanji N5", "Verbs"]);
    sortBy("Deck");
    sortBy("Deck");
    expect(header("Deck")).toHaveAttribute("aria-sort", "descending");
    expect(header("Due today")).not.toHaveAttribute("aria-sort");
    expect(names()).toEqual(["Verbs", "Kanji N5"]);
    sortBy("Deck");
    expect(header("Deck")).not.toHaveAttribute("aria-sort");
    expect(names()).toEqual(["Kanji N5", "Verbs"]);
  });

  it("filters the decks by name or group, saying how many it shows, and when none", () => {
    render(<Harness initial={{ filter: "script" }} />);
    expect(names()).toEqual(["Kanji N5"]);
    expect(screen.getByText("1 of 2 decks")).toBeInTheDocument();
    fireEvent.input(screen.getByRole("searchbox", { name: "Filter by name or group" }), { target: { value: "nouns " } });
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("No deck matches “nouns”.")).toBeInTheDocument();
  });

  it("selects decks one by one or all those shown, and offers what can be done with them", () => {
    render(<Harness />);
    expect(screen.queryByRole("group", { name: "Selected decks" })).toBeNull();
    select("Verbs");
    const bulk = screen.getByRole("group", { name: "Selected decks" });
    expect(within(bulk).getByText("1 deck selected")).toBeInTheDocument();
    const all = screen.getByRole("checkbox", { name: "Select every deck shown" });
    expect(all).not.toBeChecked();
    fireEvent.click(all);
    expect(within(bulk).getByText("2 decks selected")).toBeInTheDocument();
    expect(all).toBeChecked();
    fireEvent.click(all);
    expect(screen.queryByRole("group", { name: "Selected decks" })).toBeNull();
    select("Kanji N5");
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.getByRole("checkbox", { name: "Select Kanji N5" })).not.toBeChecked();
  });

  it("moves the selected decks into a group, or to the top level, and says so", async () => {
    const onMove = vi.fn(async () => true);
    render(<Harness onMove={onMove} />);
    select("Kanji N5");
    select("Verbs");
    const move = screen.getByRole("button", { name: "Move to group" });
    fireEvent.click(move);
    expect(move).toHaveAttribute("aria-expanded", "true");
    const group = screen.getByRole("combobox", { name: "Group" });
    expect(within(group).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Top level (no group)",
      "Languages",
      "Languages › Scripts",
    ]);
    choose("Group", scripts.url);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onMove).toHaveBeenCalledWith([kanji, verbs], scripts);
    expect(await screen.findByRole("status")).toHaveTextContent("Moved 2 decks to Scripts.");
    expect(screen.queryByRole("combobox", { name: "Group" })).toBeNull();
    // Still selected, for what comes next.
    fireEvent.click(move);
    choose("Group", "");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onMove).toHaveBeenLastCalledWith([kanji, verbs], null);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Moved 2 decks to Top level (no group)."));
  });

  it("moves the selected decks in the order the table shows them", () => {
    const onMove = vi.fn(async () => true);
    render(<Harness onMove={onMove} />);
    select("Kanji N5");
    select("Verbs");
    fireEvent.click(within(table()).getByRole("button", { name: "Deck" }));
    fireEvent.click(within(table()).getByRole("button", { name: "Deck" }));
    expect(names()).toEqual(["Verbs", "Kanji N5"]);
    fireEvent.click(screen.getByRole("button", { name: "Move to group" }));
    choose("Group", languages.url);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onMove).toHaveBeenCalledWith([verbs, kanji], languages);
  });

  it("leaves alone a selected deck the filter hides, until it is shown again", async () => {
    const onDirection = vi.fn(async () => true);
    render(<Harness onDirection={onDirection} />);
    select("Kanji N5");
    select("Verbs");
    const filter = screen.getByRole("searchbox", { name: "Filter by name or group" });
    fireEvent.input(filter, { target: { value: "verbs" } });
    expect(screen.getByText("1 deck selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Set direction" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onDirection).toHaveBeenCalledWith([verbs], expect.anything());
    await screen.findByText(/1 deck/, { selector: "[role=status]" });
    fireEvent.input(filter, { target: { value: "" } });
    expect(screen.getByText("2 decks selected")).toBeInTheDocument();
  });

  it("does not offer a move when a newer version arranged the decks", () => {
    render(<Harness readOnly />);
    select("Verbs");
    fireEvent.click(screen.getByRole("button", { name: "Move to group" }));
    expect(screen.getByText(/A newer version of Solid Memo arranged these groups/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Group" })).toBeNull();
  });

  it("sets the selected decks' pace, a limit left empty following the instance", async () => {
    const onPace = vi.fn(async () => true);
    render(<Harness onPace={onPace} />);
    select("Verbs");
    fireEvent.click(screen.getByRole("button", { name: "Set pace" }));
    fireEvent.input(screen.getByRole("spinbutton", { name: "New cards per day" }), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onPace).toHaveBeenCalledWith([verbs], { newCardsPerDay: 8 });
    expect(await screen.findByText("Set the pace of 1 deck.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Set pace" }));
    fireEvent.input(screen.getByRole("spinbutton", { name: "New cards per day" }), { target: { value: " " } });
    fireEvent.input(screen.getByRole("spinbutton", { name: "Max reviews per day" }), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onPace).toHaveBeenLastCalledWith([verbs], { maxReviewsPerDay: 50 });
  });

  it("keeps a form open, as filled in, when its action was not done, and closes it on Cancel", async () => {
    const onDirection = vi.fn(async () => false);
    render(<Harness onDirection={onDirection} error="The pod said no" />);
    expect(screen.getByRole("alert")).toHaveTextContent("The pod said no");
    select("Kanji N5");
    const direction = screen.getByRole("button", { name: "Set direction" });
    fireEvent.click(direction);
    choose("Direction", "back-to-front");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onDirection).toHaveBeenCalledWith([kanji], "back-to-front");
    await waitFor(() => expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled());
    expect(screen.getByRole("combobox", { name: "Direction" })).toHaveValue("back-to-front");
    expect(screen.getByRole("status")).toHaveTextContent("");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("combobox", { name: "Direction" })).toBeNull();
    // The same button opens and closes its form.
    fireEvent.click(direction);
    fireEvent.click(direction);
    expect(direction).toHaveAttribute("aria-expanded", "false");
  });

  it("deletes the selected decks once the user confirms, naming each", async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    const onRemove = vi.fn(async () => true);
    render(<Harness onRemove={onRemove} />);
    select("Kanji N5");
    select("Verbs");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(confirm).toHaveBeenCalledWith(
      "Delete 2 decks and all their cards: “Kanji N5”, “Verbs”? This cannot be undone.",
    );
    expect(onRemove).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onRemove).toHaveBeenCalledWith([kanji, verbs]);
    expect(await screen.findByText("Deleted 2 decks.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Selected decks" })).toBeNull();
  });

  it("sends the user to Solid Memo for decks when there are none", () => {
    render(<Harness rows={[]} />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("link", { name: "Solid Memo" })).toHaveAttribute("href", "#/decks");
    expect(screen.getByRole("link", { name: "Name and catalogue" })).toHaveAttribute("href", "#/instance?instance=a");
    expect(screen.getByRole("link", { name: "Import and export" })).toHaveAttribute("href", "#/transfer?");
  });

  it("names a deck in the reader's language, in Swedish", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <Harness />
      </I18nProvider>,
    );
    expect(screen.getByRole("heading", { name: "Kortlekar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Verb" })).toBeInTheDocument();
    // An English-only deck is marked as English on a Swedish page.
    expect(screen.getByText("Kanji N5")).toHaveAttribute("lang", "en");
  });
});
