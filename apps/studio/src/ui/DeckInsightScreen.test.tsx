import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import type { DeckInsight } from "@solid-memo/application/useCases";
import { easeHistogram, intervalHistogram } from "@solid-memo/domain/scheduleInsight";
import type { ReviewState } from "@solid-memo/domain/review";
import { DeckInsightScreen } from "./DeckInsightScreen";
import { makeCard, makeDeck } from "../test/fixtures";

const deck = makeDeck("deck-1", { en: "Kanji N5" });
const water = makeCard(deck, "water");
const state = (intervalDays: number, easeFactor: number) => ({ intervalDays, easeFactor }) as ReviewState;
const states = [state(1, 2.5), state(3, 2.5), state(400, 1.3)];

const insight: DeckInsight = {
  today: "2026-10-09",
  maxReviewsPerDay: 5,
  forecast: [
    { studyDay: "2026-10-09", due: 7, reviews: 5 },
    { studyDay: "2026-10-10", due: 1, reviews: 3 },
    { studyDay: "2026-10-11", due: 0, reviews: 0 },
  ],
  scheduled: 3,
  intervals: intervalHistogram(states),
  eases: easeHistogram(states),
  lapses: { lapses: new Map([[water.url, 5]]), since: "2025-03" },
  leeches: [{ card: water, lapses: 5 }],
};

function renderScreen(shown: DeckInsight = insight, ownCap = false) {
  return render(
    <DeckInsightScreen deck={deck} insight={shown} ownCap={ownCap} cardHref={(card) => `#card=${card.id}`} leechesHref="#leeches" />,
  );
}

describe("DeckInsightScreen", () => {
  it("shows the reviews to come, today's and the week's, as the cap lets them through", () => {
    renderScreen();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Schedule: Kanji N5");
    expect(screen.getByRole("group", { name: "Reviews today" })).toHaveTextContent("5");
    expect(screen.getByRole("group", { name: "Reviews, the next 7 days" })).toHaveTextContent("8");
    expect(screen.getByRole("group", { name: "Studied, each way" })).toHaveTextContent("3");
    expect(screen.getByText(/At most 5 reviews a day, as the instance's preferences set it/)).toBeInTheDocument();
    const forecast = screen.getByRole("img", { name: "Reviews on each of the next 3 days, as the daily cap lets them through." });
    fireEvent.pointerEnter(forecast.querySelector('[data-bar="2026-10-10"]')!);
    expect(screen.getByText("October 10, 2026: 3 to review, 1 falling due.")).toBeInTheDocument();
    const table = forecast.closest("figure")!.querySelector("table")!;
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("October 9, 2026" + "7" + "5");
  });

  it("names a cap the deck sets itself", () => {
    renderScreen(insight, true);
    expect(screen.getByText(/as this deck sets it/)).toBeInTheDocument();
  });

  it("spreads the intervals and eases, each bin named in its table", () => {
    renderScreen();
    const intervals = screen.getByRole("img", { name: "How many cards, each way, have each interval." }).closest("figure")!;
    const named = within(intervals).getAllByRole("row").slice(1).map((row) => row.firstChild!.textContent);
    expect(named.slice(0, 3)).toEqual(["1 day", "2–3 days", "4–7 days"]);
    expect(named.at(-1)).toBe("366 days or more");
    fireEvent.click(intervals.querySelector('[data-bar="366"]')!);
    expect(within(intervals).getByText("366 days or more: 1.")).toBeInTheDocument();
    const eases = screen.getByRole("img", { name: "How many cards, each way, have each ease." }).closest("figure")!;
    const easeRows = within(eases).getAllByRole("row").slice(1).map((row) => row.textContent);
    expect(easeRows[0]).toBe("1.3 to under 1.51");
    expect(easeRows.at(-1)).toBe("2.7 or more0");
  });

  it("lists the leeches, each a link to its card, and links to them all among the deck's cards", () => {
    renderScreen();
    expect(screen.getByText("Lapses count the wrong answers since March 2025, the month of the deck's first answer in the log.")).toBeInTheDocument();
    const leeches = screen.getByRole("list", { name: "Leeches" });
    expect(within(leeches).getByRole("link", { name: "water" })).toHaveAttribute("href", "#card=water");
    expect(leeches).toHaveTextContent("forgotten 5 times");
    expect(screen.getByRole("link", { name: "Show the leeches among the deck's cards" })).toHaveAttribute("href", "#leeches");
  });

  it("says when nothing is studied or logged yet", () => {
    renderScreen({
      ...insight,
      forecast: [],
      scheduled: 0,
      lapses: { lapses: new Map(), since: null },
      leeches: [],
    });
    expect(screen.getByRole("group", { name: "Reviews today" })).toHaveTextContent("0");
    expect(screen.getByText("No card of this deck is studied yet.")).toBeInTheDocument();
    expect(screen.getByText("No answers are logged yet.")).toBeInTheDocument();
    expect(screen.getByText("No leeches.")).toBeInTheDocument();
  });
});
