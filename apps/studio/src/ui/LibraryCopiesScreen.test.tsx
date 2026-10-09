import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import { LibraryCopiesScreen, type BatchResult, type BatchRun, type CopyRow } from "./LibraryCopiesScreen";
import { capitals, instanceA, makeCard, makeCopy, makePlan } from "../test/fixtures";

const old = makeCopy("deck-1", { en: "Capitals" }, "1");
const mine = makeCopy("deck-2", { en: "My capitals" }, "1");
const fresh = makeCopy("deck-3", { en: "Fresh capitals" }, "2");
const gone = { ...makeCopy("deck-4", { en: "Rivers" }, "1"), sourceUrl: "https://solid-memo.com/decks/rivers/v1.ttl" };
const stray = { ...makeCopy("deck-5", { en: "Odd capitals" }, "1"), sourceUrl: "https://solid-memo.com/decks/capitals/v7.ttl" };
const planning = makeCopy("deck-6", { en: "Slow capitals" }, "1");
const broken = makeCopy("deck-7", { en: "Broken capitals" }, "1");

const plan = makePlan(old);
const minePlan = { ...makePlan(mine), add: [], change: [], remove: [], retire: [makeCard(mine, "latvia")], kept: [makeCard(mine, "sweden")], notes: [] };

const rows: CopyRow[] = [
  { copy: { deck: old, series: capitals, version: "1", newer: true }, plan },
  { copy: { deck: mine, series: capitals, version: "1", newer: true }, plan: minePlan },
  { copy: { deck: fresh, series: capitals, version: "2", newer: false }, plan: "loading" },
  { copy: { deck: gone, series: null, version: null, newer: false }, plan: "loading" },
  { copy: { deck: stray, series: capitals, version: null, newer: true }, plan: null },
  { copy: { deck: planning, series: capitals, version: "1", newer: true }, plan: "loading" },
  { copy: { deck: broken, series: capitals, version: "1", newer: true }, plan: "failed" },
];

type Props = Parameters<typeof LibraryCopiesScreen>[0];

function renderScreen(overrides: Partial<Props> = {}) {
  const onUpgrade = vi.fn();
  render(
    <LibraryCopiesScreen
      instance={instanceA}
      rows={rows}
      running={null}
      results={[]}
      deckHref={(deck) => `#/about?deck=${deck.id}`}
      libraryHref="#/library"
      onUpgrade={onUpgrade}
      {...overrides}
    />,
  );
  return { onUpgrade };
}

const table = () => screen.getByRole("table", { name: "The decks of Deck set A copied from the library" });
const row = (name: string) => within(table()).getByRole("rowheader", { name }).closest("tr")!;
const cells = (name: string) => within(row(name)).getAllByRole("cell").map((cell) => cell.textContent);

describe("LibraryCopiesScreen", () => {
  it("lists each copy with the release it came from, the library's, and what updating would change", () => {
    renderScreen();
    expect(screen.getByRole("heading", { name: "Library copies in Deck set A" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse the deck library" })).toHaveAttribute("href", "#/library");
    expect(within(row("Capitals")).getByRole("link", { name: "Capitals" })).toHaveAttribute("href", "#/about?deck=deck-1");
    expect(cells("Capitals")[1]).toBe("Release 1");
    expect(cells("Capitals")[2]).toBe("Release 2");
    expect(cells("Capitals")[3]).toMatch(/^Release 2: updating adds 1 card, changes 1 card and removes 1 card\.What changes/);
    expect(cells("Fresh capitals")[3]).toBe("Up to date");
    expect(cells("Rivers").slice(1)).toEqual(["Unknown release", "No longer in the library", ""]);
    expect(cells("Odd capitals")[1]).toBe("Unknown release");
    expect(cells("Odd capitals")[3]).toBe("Release 2 is out, with nothing to update your copy with.");
    expect(cells("Slow capitals")[3]).toBe("Looking at what an update would change…");
    expect(cells("Broken capitals")[3]).toBe("Release 2 is out, but what it would change could not be read.");
  });

  it("details what updating keeps, the releases' notes, and the cards each change touches", () => {
    renderScreen();
    const details = within(row("Capitals")).getByText("What changes").closest("details")!;
    expect(details).toHaveTextContent("Your review history is kept, but for the cards removed.");
    expect(details).toHaveTextContent("Release 2: Norway added.");
    expect(within(details).getAllByRole("heading").map((heading) => heading.textContent)).toEqual([
      "Added: 1 card",
      "Changed: 1 card",
      "Removed: 1 card",
    ]);
    expect(within(details).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Release 2: Norway added.",
      "Norway",
      "Sweden",
      "latvia",
    ]);
    const other = within(row("My capitals")).getByText("What changes").closest("details")!;
    expect(other).toHaveTextContent("a retired card is kept, but no longer studied. 1 card you changed is left as you have it.");
    expect(within(other).getAllByRole("heading").map((heading) => heading.textContent)).toEqual([
      "Retired: 1 card",
      "Left as you have it: 1 card",
    ]);
  });

  it("updates the copies chosen, all at once or one by one, only those that can be", () => {
    const { onUpgrade } = renderScreen();
    expect(screen.queryByRole("button", { name: /Update/ })).toBeNull();
    expect(within(row("Fresh capitals")).queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select every deck that can be updated" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select My capitals" }));
    fireEvent.click(screen.getByRole("button", { name: "Update 1 deck" }));
    expect(onUpgrade).toHaveBeenCalledWith([{ deck: old, plan }]);
    // The selection goes with the batch.
    expect(screen.getByRole("checkbox", { name: "Select Capitals" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select every deck that can be updated" }));
    fireEvent.click(screen.getByRole("button", { name: "Update 2 decks" }));
    expect(onUpgrade).toHaveBeenLastCalledWith([
      { deck: old, plan },
      { deck: mine, plan: minePlan },
    ]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select every deck that can be updated" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select every deck that can be updated" }));
    expect(screen.queryByRole("button", { name: /Update/ })).toBeNull();
  });

  it("shows the deck a batch is updating, with its steps, and nothing to choose meanwhile", () => {
    const running: BatchRun = { index: 1, total: 2, deck: mine, step: "cards", done: 1 };
    renderScreen({ running, results: [{ deck: old, plan, outcome: { ok: true, deck: old } }] });
    expect(screen.getByText(/^Updating My/).textContent).toBe("Updating My capitals (2 of 2)");
    expect(screen.getByRole("region", { name: "Updating the deck" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Capitals" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Select every deck that can be updated" })).toBeDisabled();
    // How each ended is said once the batch is over.
    expect(screen.queryByText(/updated to release/)).toBeNull();
  });

  it("says how each update of the batch ended", () => {
    const results: BatchResult[] = [
      { deck: old, plan, outcome: { ok: true, deck: old } },
      { deck: mine, plan: minePlan, outcome: { ok: false, step: "entry", error: new Error("boom"), changed: false } },
      { deck: broken, plan, outcome: { ok: false, step: "reviews", error: new Error("boom"), changed: true } },
    ];
    renderScreen({ results });
    const items = within(screen.getByRole("status")).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Capitals: updated to release 2.");
    expect(items[1]).toHaveTextContent(/^My capitals: the update failed while moving the deck to the new release: .*Your deck was not changed\.$/);
    expect(items[2]).toHaveTextContent(/^Broken capitals: the update failed while dropping the review states of removed cards: .*Part of the new release may be in your deck already, which you can study as it is\. Update it again to finish\.$/);
  });

  it("says when no deck is a copy, linking to the library", () => {
    renderScreen({ rows: [] });
    expect(screen.getByText(/No deck here is a copy/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "the deck library" })).toHaveAttribute("href", "#/library");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("offers nothing to choose when no copy can be updated", () => {
    renderScreen({ rows: [rows[2]!] });
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
