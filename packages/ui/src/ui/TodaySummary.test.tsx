import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentChildren } from "preact";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Answer } from "@solid-memo/domain/answer";
import { statisticsOf, type TodaySummary as Today } from "@solid-memo/domain/statistics";
import { makeUseCasesFake } from "../test/useCasesFake";
import { statisticsHref } from "./router";
import { TodaySummary } from "./TodaySummary";
import { TodaySummaryContainer } from "./TodaySummaryContainer";

const INSTANCE = { url: "https://pod.example/solid-memo/a/", name: "A" };
const today = (summary: Partial<Today> = {}): Today => ({
  answers: 4,
  introduced: 2,
  recalled: 3,
  streak: 1,
  longestStreak: 1,
  ...summary,
});

describe("TodaySummary", () => {
  it("leads with the streak, then praises the day's work with its numbers", () => {
    render(<TodaySummary today={today()} statisticsHref="#/statistics" />);
    const strip = screen.getByRole("complementary", { name: "Today" });
    expect(strip).toHaveTextContent(
      "1-day streak Day one! Come back tomorrow for two." + "Nice work! 4 cards · 2 new · 75% remembered · All statistics",
    );
    expect(screen.getByRole("link", { name: "All statistics" })).toHaveAttribute("href", "#/statistics");
  });

  it("celebrates a record streak, and otherwise names the record to beat", () => {
    const { rerender } = render(
      <TodaySummary today={today({ streak: 3, longestStreak: 3 })} statisticsHref="#/statistics" />,
    );
    expect(screen.getByText("3-day streak")).toBeInTheDocument();
    expect(screen.getByText("Your longest yet!")).toBeInTheDocument();
    rerender(<TodaySummary today={today({ streak: 3, longestStreak: 9 })} statisticsHref="#/statistics" />);
    expect(screen.getByText("Record: 9 days")).toBeInTheDocument();
  });

  it("cheers louder the more was studied", () => {
    const { rerender } = render(<TodaySummary today={today({ answers: 10, recalled: 1 })} statisticsHref="#/statistics" />);
    expect(screen.getByText(/^Great session! 10 cards/)).toBeInTheDocument();
    rerender(<TodaySummary today={today({ answers: 50, introduced: 1, recalled: 1 })} statisticsHref="#/statistics" />);
    expect(screen.getByText(/^Impressive effort! 50 cards · 1 new/)).toBeInTheDocument();
  });
});

describe("TodaySummaryContainer", () => {
  function renderContainer(getStatistics: UseCases["getStatistics"]) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = (node: ComponentChildren) => <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>;
    return render(wrap(<TodaySummaryContainer useCases={makeUseCasesFake({ getStatistics })} instance={INSTANCE} />));
  }
  const answer = (studyDay: string): Answer => ({
    id: `answer-${studyDay}`,
    deckUrl: `${INSTANCE.url}catalog.ttl#deck-1`,
    cardUrl: `${INSTANCE.url}decks/deck-1.ttl#se`,
    direction: "front-to-back",
    grade: 4,
    answeredAt: `${studyDay}T10:00:00.000Z`,
    studyDay,
    nextIntervalDays: 1,
  });

  it("shows today's study, linking to the statistics", async () => {
    const getStatistics = vi.fn(async () => statisticsOf([answer("2026-10-03")], "2026-10-03"));
    renderContainer(getStatistics);
    expect(await screen.findByRole("link", { name: "All statistics" })).toHaveAttribute(
      "href",
      statisticsHref(INSTANCE.url),
    );
    expect(getStatistics).toHaveBeenCalledWith(INSTANCE.url, expect.any(Date));
  });

  it("shows nothing before the day's first answer, even with a streak to keep", async () => {
    const getStatistics = vi.fn(async () => statisticsOf([answer("2026-10-01"), answer("2026-10-02")], "2026-10-03"));
    const { container } = renderContainer(getStatistics);
    await vi.waitFor(() => expect(getStatistics).toHaveBeenCalled());
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });
});
