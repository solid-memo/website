// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { useState } from "preact/hooks";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import type { DeckTableRow, DeckTableView } from "@solid-memo/domain/deckTable";
import type { DeckGroup } from "@solid-memo/domain/deckTree";
import { I18nProvider } from "@solid-memo/ui/i18n";
import { DeckTableScreen, type DeckBadge } from "./DeckTableScreen";
import type { HomeView } from "./shell/views";
import { choose } from "../test/choose";
import { answer, dialog, pick } from "../test/dialogs";
import { WithKeys } from "../test/keys";
import { instanceA, makeDeck } from "../test/fixtures";

const languages: DeckGroup = {
  url: `${instanceA.url}catalog.ttl#group-1`,
  title: { en: "Languages" },
};
const scripts: DeckGroup = { url: `${instanceA.url}catalog.ttl#group-2`, title: { en: "Scripts" } };
const kanji = makeDeck("deck-1", { en: "Kanji N5" });
const verbs = {
  ...makeDeck("deck-2", { en: "Verbs", sv: "Verb" }),
  direction: "bidirectional" as const,
  newCardsPerDay: 5,
};

const rows: DeckTableRow[] = [
  {
    deck: kanji,
    groups: [languages, scripts],
    figures: { cards: 12, due: 3, new: 4 },
    newCardsPerDay: 20,
    maxReviewsPerDay: 200,
  },
  { deck: verbs, groups: [], figures: {}, newCardsPerDay: 5, maxReviewsPerDay: 200 },
];

type Props = Parameters<typeof DeckTableScreen>[0];

/** The screen with its view kept as the workspace keeps it (in the URL). */
function Harness({
  initial = { filter: "" },
  ...overrides
}: Partial<Props> & { initial?: DeckTableView }) {
  const [view, setView] = useState<DeckTableView>(initial);
  const [shown, setShown] = useState<HomeView>("all");
  return (
    <DeckTableScreen
      instance={instanceA}
      rows={rows}
      view={view}
      onView={setView}
      shownView={shown}
      onShow={setShown}
      savedViews={[]}
      onSavedViews={() => undefined}
      onApply={() => undefined}
      onCursor={() => undefined}
      onOpen={() => undefined}
      pending={(deck, figure) =>
        deck.url === verbs.url && figure === "cards" ? "unreadable" : "loading"
      }
      badges={(deck): DeckBadge[] => (deck.url === kanji.url ? ["library", "invalid"] : [])}
      groups={[
        { group: languages, trail: [languages] },
        { group: scripts, trail: [languages, scripts] },
      ]}
      moveLocked={null}
      readOnly={null}
      selectable={() => true}
      deckHref={(deck) => `#/deck?deck=${deck.id}`}
      cardsHref={(deck) => `#/browse?deck=${deck.id}`}
      appHref="#/decks"
      healthHref="#/health?instance=a"
      transferHref={(decks) => `#/transfer?${decks.map((deck) => `deck=${deck.id}`).join("&")}`}
      healthBadge={() => null}
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

const EDIT = "Edit the selected decks";
/** What Home says it did (the bar's count is a status line too, after it). */
const said = () => screen.getAllByRole("status")[0]!;
const bar = () => screen.getByRole("group", { name: "Selected decks" });
const table = () => screen.getByRole("table", { name: "The decks of Deck set A" });
const names = () =>
  within(table())
    .getAllByRole("rowheader")
    .map((cell) => within(cell).getByRole("link").textContent);
const select = (name: string) =>
  fireEvent.click(screen.getByRole("checkbox", { name: `Select ${name}` }));

describe("DeckTableScreen", () => {
  it("has a row per deck, named by the deck, with its groups, settings and figures", () => {
    render(<Harness />);
    expect(
      within(table())
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual([
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
    expect(within(row).getByRole("link", { name: "Kanji N5" })).toHaveAttribute(
      "href",
      "#/deck?deck=deck-1",
    );
    expect(
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual([
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
    expect(
      within(other)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual([
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
  });

  it("puts each deck's health beside its name", () => {
    render(
      <Harness
        healthBadge={(deck) => <a href={`#/health?deck=${deck.id}`}>Health of {deck.id}</a>}
      />,
    );
    const kanjiRow = within(table()).getAllByRole("rowheader")[0]!;
    expect(within(kanjiRow).getByRole("link", { name: "Health of deck-1" })).toHaveAttribute(
      "href",
      "#/health?deck=deck-1",
    );
  });

  it("puts a deck's update beside its name", () => {
    render(
      <Harness
        updateBadge={(deck) =>
          deck.url === kanji.url ? <a href="#/library?instance=a">Release 2 out</a> : null
        }
      />,
    );
    const kanjiRow = within(table()).getAllByRole("rowheader")[0]!;
    expect(within(kanjiRow).getByRole("link", { name: "Release 2 out" })).toHaveAttribute(
      "href",
      "#/library?instance=a",
    );
  });

  it("exports the selected decks in import and export", () => {
    render(<Harness />);
    select("Verbs");
    select("Kanji N5");
    const bulk = screen.getByRole("group", { name: "Selected decks" });
    expect(within(bulk).getByRole("link", { name: "Export" })).toHaveAttribute(
      "href",
      "#/transfer?deck=deck-1&deck=deck-2",
    );
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
    fireEvent.input(screen.getByRole("searchbox", { name: "Filter by name or group" }), {
      target: { value: "nouns " },
    });
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("No deck matches “nouns”.")).toBeInTheDocument();
  });

  it("shows the decks of a view from its tab, each counting its decks, the view chosen pressed", () => {
    render(<Harness />);
    const views = screen.getByRole("group", { name: "Views" });
    expect(
      within(views)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual([
      "All 2",
      // Verbs' cards are still counted: shown as they may be due.
      "Due today 2",
      "Courses 0",
      "Library copies 1",
      "Needs attention 1",
      "+ Save view",
    ]);
    expect(within(views).getByRole("button", { name: "All 2" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(within(views).getByRole("button", { name: "Due today 2" }));
    expect(names()).toEqual(["Kanji N5", "Verbs"]);
    const verbsDue = within(within(table()).getByRole("row", { name: /Verbs/ })).getAllByRole(
      "cell",
    )[5]!;
    expect(verbsDue).toHaveTextContent("Counting…");
    fireEvent.click(within(views).getByRole("button", { name: "Needs attention 1" }));
    expect(within(views).getByRole("button", { name: "Needs attention 1" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(names()).toEqual(["Kanji N5"]);
    expect(screen.getByText("1 of 2 decks")).toBeInTheDocument();
    fireEvent.click(within(views).getByRole("button", { name: "Courses 0" }));
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("No deck in this view.")).toBeInTheDocument();
  });

  it("shows or hides its columns from the Columns menu", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Show or hide columns" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Direction" }));
    expect(within(table()).queryByRole("columnheader", { name: /^Direction/ })).toBeNull();
    expect(within(table()).getByRole("columnheader", { name: /^Group/ })).toBeInTheDocument();
  });

  it("marks the deck shown beside it, shows the one at its cursor, and opens one with Enter", () => {
    const onCursor = vi.fn();
    const onOpen = vi.fn();
    render(
      <WithKeys>
        <Harness current={verbs.url} onCursor={onCursor} onOpen={onOpen} />
      </WithKeys>,
    );
    expect(within(table()).getByRole("row", { current: true })).toHaveTextContent("Verbs");
    document.body.focus();
    fireEvent.keyDown(document.body, { key: "k" });
    expect(onCursor).toHaveBeenCalledWith(kanji);
    fireEvent.keyDown(screen.getByRole("checkbox", { name: "Select Kanji N5" }), { key: "Enter" });
    expect(onOpen).toHaveBeenCalledWith(kanji);
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
    pick(EDIT, "Move to group");
    expect(dialog("Move to group")).toBeInTheDocument();
    const group = screen.getByRole("combobox", { name: "Group" });
    expect(
      within(group)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Top level (no group)", "Languages", "Languages › Scripts"]);
    choose("Group", scripts.url);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onMove).toHaveBeenCalledWith([kanji, verbs], scripts);
    await waitFor(() => expect(said()).toHaveTextContent("Moved 2 decks to Scripts."));
    expect(screen.queryByRole("combobox", { name: "Group" })).toBeNull();
    // Still selected, for what comes next.
    pick(EDIT, "Move to group");
    choose("Group", "");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onMove).toHaveBeenLastCalledWith([kanji, verbs], null);
    await waitFor(() => expect(said()).toHaveTextContent("Moved 2 decks to Top level (no group)."));
  });

  it("moves the selected decks in the order the table shows them", () => {
    const onMove = vi.fn(async () => true);
    render(<Harness onMove={onMove} />);
    select("Kanji N5");
    select("Verbs");
    fireEvent.click(within(table()).getByRole("button", { name: "Deck" }));
    fireEvent.click(within(table()).getByRole("button", { name: "Deck" }));
    expect(names()).toEqual(["Verbs", "Kanji N5"]);
    pick(EDIT, "Move to group");
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
    expect(bar()).toHaveTextContent("1 deck selected");
    pick(EDIT, "Set direction");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onDirection).toHaveBeenCalledWith([verbs], expect.anything());
    await waitFor(() => expect(said()).toHaveTextContent("Set the direction of 1 deck."));
    fireEvent.input(filter, { target: { value: "" } });
    expect(bar()).toHaveTextContent("2 decks selected");
  });

  it("does not offer a move when a newer version arranged the decks", () => {
    render(<Harness moveLocked="newerVersion" />);
    select("Verbs");
    pick(EDIT, "Move to group");
    expect(
      screen.getByText(/A newer version of Solid Memo arranged these groups/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Group" })).toBeNull();
  });

  it("does not offer a move while the arrangement is set aside", () => {
    render(<Harness moveLocked="setAside" />);
    select("Verbs");
    pick(EDIT, "Move to group");
    expect(screen.getByText(/The arrangement of these decks has invalid data/)).toBeInTheDocument();
  });

  it("selects only the decks that may be changed, saying why the others cannot be, all at once too", () => {
    render(<Harness selectable={(deck) => deck.url !== kanji.url} readOnly="setAside" />);
    expect(screen.getByText(/Decks with invalid data are set aside/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Repair them on the health screen." })).toHaveAttribute(
      "href",
      "#/health?instance=a",
    );
    expect(screen.getByRole("checkbox", { name: "Select Kanji N5" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select every deck shown" }));
    expect(screen.getByRole("checkbox", { name: "Select every deck shown" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select Kanji N5" })).not.toBeChecked();
    expect(bar()).toHaveTextContent("1 deck selected");
  });

  it("selects no deck while the data is checked", () => {
    render(<Harness selectable={() => false} readOnly="checking" />);
    expect(screen.getByText(/being checked/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select every deck shown" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Select Verbs" })).toBeDisabled();
  });

  it("sets the selected decks' pace, a limit left empty following the instance", async () => {
    const onPace = vi.fn(async () => true);
    render(<Harness onPace={onPace} />);
    select("Verbs");
    pick(EDIT, "Set pace");
    fireEvent.input(screen.getByRole("spinbutton", { name: "New cards per day" }), {
      target: { value: "8" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onPace).toHaveBeenCalledWith([verbs], { newCardsPerDay: 8 });
    await waitFor(() => expect(said()).toHaveTextContent("Set the pace of 1 deck."));
    pick(EDIT, "Set pace");
    fireEvent.input(screen.getByRole("spinbutton", { name: "New cards per day" }), {
      target: { value: " " },
    });
    fireEvent.input(screen.getByRole("spinbutton", { name: "Max reviews per day" }), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onPace).toHaveBeenLastCalledWith([verbs], { maxReviewsPerDay: 50 });
  });

  it("keeps a form open, as filled in, when its action was not done, and closes it on Cancel", async () => {
    const onDirection = vi.fn(async () => false);
    render(<Harness onDirection={onDirection} error="The pod said no" />);
    expect(screen.getByRole("alert")).toHaveTextContent("The pod said no");
    select("Kanji N5");
    pick(EDIT, "Set direction");
    choose("Direction", "back-to-front");
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onDirection).toHaveBeenCalledWith([kanji], "back-to-front");
    await waitFor(() => expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled());
    expect(screen.getByRole("combobox", { name: "Direction" })).toHaveValue("back-to-front");
    expect(said()).toHaveTextContent("");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("combobox", { name: "Direction" })).toBeNull();
    // Its dialog's Close leaves it too.
    pick(EDIT, "Set direction");
    fireEvent.click(within(dialog("Set direction")).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("deletes the selected decks once the user confirms, naming each", async () => {
    const onRemove = vi.fn(async () => true);
    render(<Harness onRemove={onRemove} />);
    select("Kanji N5");
    select("Verbs");
    fireEvent.click(within(bar()).getByRole("button", { name: "Delete" }));
    expect(dialog("Delete the selected decks")).toHaveTextContent(
      "Delete 2 decks and all their cards: “Kanji N5”, “Verbs”? This cannot be undone.",
    );
    answer("Delete the selected decks", "Cancel");
    expect(onRemove).not.toHaveBeenCalled();
    fireEvent.click(within(bar()).getByRole("button", { name: "Delete" }));
    answer("Delete the selected decks", "Delete");
    expect(onRemove).toHaveBeenCalledWith([kanji, verbs]);
    expect(await screen.findByText("Deleted 2 decks.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Selected decks" })).toBeNull();
  });

  it("edits a deck's pace and direction in its cell, as the bulk actions change them, and says so", async () => {
    const onPace = vi.fn(async () => true);
    const onDirection = vi.fn(async () => true);
    render(<Harness onPace={onPace} onDirection={onDirection} />);
    const edit = (name: string, role: "spinbutton" | "combobox", value: string) => {
      fireEvent.click(screen.getByRole("button", { name }));
      const field = screen.getByRole(role, { name: name.replace(/:.*/, "") });
      if (role === "combobox") choose(name.replace(/:.*/, ""), value);
      else fireEvent.input(field, { target: { value } });
      fireEvent.keyDown(field, { key: "Enter" });
    };
    edit("New per day of Kanji N5: 20 (instance)", "spinbutton", "8");
    await waitFor(() => expect(onPace).toHaveBeenCalledWith([kanji], { newCardsPerDay: 8 }));
    await waitFor(() => expect(said()).toHaveTextContent("Set the pace of 1 deck."));
    edit("Reviews per day of Verbs: 200 (instance)", "spinbutton", "50");
    await waitFor(() =>
      expect(onPace).toHaveBeenLastCalledWith([verbs], { newCardsPerDay: 5, maxReviewsPerDay: 50 }),
    );
    // Empty, the instance's pace again.
    fireEvent.click(screen.getByRole("button", { name: "New per day of Verbs: 5" }));
    expect(screen.getByRole("spinbutton", { name: "New per day of Verbs" })).toHaveValue(5);
    fireEvent.input(screen.getByRole("spinbutton", { name: "New per day of Verbs" }), {
      target: { value: "" },
    });
    fireEvent.keyDown(screen.getByRole("spinbutton", { name: "New per day of Verbs" }), {
      key: "Enter",
    });
    await waitFor(() => expect(onPace).toHaveBeenLastCalledWith([verbs], {}));
    edit("Direction of Kanji N5: Front → back", "combobox", "bidirectional");
    await waitFor(() => expect(onDirection).toHaveBeenCalledWith([kanji], "bidirectional"));
    await waitFor(() => expect(said()).toHaveTextContent("Set the direction of 1 deck."));
  });

  it("edits no cell of a deck that may not be changed", () => {
    render(<Harness selectable={(deck) => deck.url !== kanji.url} />);
    const row = within(table()).getByRole("row", { name: /Kanji N5/ });
    expect(within(row).queryByRole("button", { name: /of Kanji N5/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Direction of Verbs: Both ways" }),
    ).toBeInTheDocument();
  });

  it("shows the views saved beside Home's own, saves the view it is in, and puts Home in one chosen", () => {
    const onApply = vi.fn();
    const onSavedViews = vi.fn();
    render(
      <Harness
        savedViews={[{ name: "Kanji due", params: "q=kanji&show=due" }]}
        onApply={onApply}
        onSavedViews={onSavedViews}
      />,
    );
    const views = screen.getByRole("group", { name: "Views" });
    expect(within(views).getByRole("button", { name: "Kanji due" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    fireEvent.click(within(views).getByRole("button", { name: "Due today 2" }));
    fireEvent.input(screen.getByRole("searchbox", { name: "Filter by name or group" }), {
      target: { value: "kanji" },
    });
    expect(within(views).getByRole("button", { name: "Kanji due" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(within(views).getByRole("button", { name: "Kanji due" }));
    expect(onApply).toHaveBeenCalledWith({ view: { filter: "kanji" }, show: "due" });
    fireEvent.click(within(views).getByRole("button", { name: "+ Save view" }));
    fireEvent.input(within(dialog("Save the view")).getByRole("textbox", { name: "Name" }), {
      target: { value: "Mine" },
    });
    fireEvent.click(within(dialog("Save the view")).getByRole("button", { name: "Save" }));
    expect(onSavedViews).toHaveBeenCalledWith([
      { name: "Kanji due", params: "q=kanji&show=due" },
      { name: "Mine", params: "q=kanji&show=due" },
    ]);
  });

  it("sends the user to Solid Memo for decks when there are none", () => {
    render(<Harness rows={[]} />);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("link", { name: "Solid Memo" })).toHaveAttribute("href", "#/decks");
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
