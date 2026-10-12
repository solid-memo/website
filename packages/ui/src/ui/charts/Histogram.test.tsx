// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { easeHistogram, intervalHistogram } from "@solid-memo/domain/scheduleInsight";
import { Histogram, SpreadCharts, useBinRanges } from "./Histogram";

describe("Histogram", () => {
  function Intervals() {
    const ranges = useBinRanges();
    return (
      <Histogram
        caption="Intervals"
        label="Intervals as bars"
        heading="Interval"
        bins={intervalHistogram(
          [1, 1, 3, 400].map((intervalDays) => ({
            cardId: "a",
            direction: "front-to-back" as const,
            easeFactor: 2.5,
            intervalDays,
            repetitions: 1,
            due: "2026-09-21",
            firstReviewedAt: "2026-09-01T10:00:00.000Z",
            lastReviewedAt: "2026-09-20T10:00:00.000Z",
            formatVersion: 2,
          })),
        )}
        range={ranges.interval}
      />
    );
  }

  it("names each bin's span, a day, days or days and more, with its count, and lists them all", () => {
    const { container } = render(<Intervals />);
    expect(container.querySelector(".chart-note")).toBeNull();
    fireEvent.pointerEnter(container.querySelector('g[data-bar="1"]')!);
    expect(screen.getByText("1 day: 2.")).toBeInTheDocument();
    fireEvent.click(container.querySelector('g[data-bar="2"]')!);
    expect(screen.getByText("2–3 days: 1.")).toBeInTheDocument();
    fireEvent.click(container.querySelector('g[data-bar="366"]')!);
    expect(screen.getByText("366 days or more: 1.")).toBeInTheDocument();
    expect(screen.getAllByRole("row")[0]).toHaveTextContent("IntervalCards, each way");
    expect(screen.getAllByRole("row")).toHaveLength(10);
  });
});

describe("SpreadCharts", () => {
  const state = (intervalDays: number, easeFactor: number) => ({
    cardId: "a",
    direction: "front-to-back" as const,
    easeFactor,
    intervalDays,
    repetitions: 1,
    due: "2026-09-21",
    firstReviewedAt: "2026-09-01T10:00:00.000Z",
    lastReviewedAt: "2026-09-20T10:00:00.000Z",
    formatVersion: 2,
  });
  const states = [state(1, 2.5), state(6, 1.3), state(15, 2.7)];

  it("shows the intervals with why some bins are nearly empty, and the eases folded away", () => {
    const { container } = render(
      <SpreadCharts intervals={intervalHistogram(states)} eases={easeHistogram(states)} />,
    );
    expect(screen.getByText("Days until cards come back")).toBeInTheDocument();
    expect(
      screen.getByText(/1 day apart, then 6 days, then about 15 and about 38/),
    ).toBeInTheDocument();
    const fold = container.querySelector<HTMLDetailsElement>("details.chart-fold")!;
    expect(fold.open).toBe(false);
    expect(fold.querySelector("summary")).toHaveTextContent("Show how easy cards feel");
    expect(fold.querySelector("figcaption")).toHaveTextContent("How easy cards feel");
    expect(screen.getByText(/Every card starts at 2.5/)).toBeInTheDocument();
    fireEvent.click(fold.querySelector('g[data-bar="1.3"]')!);
    expect(screen.getByText("1.3 to under 1.5: 1.")).toBeInTheDocument();
    fireEvent.click(fold.querySelector('g[data-bar="2.7"]')!);
    expect(screen.getByText("2.7 or more: 1.")).toBeInTheDocument();
  });
});
