// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { I18nProvider } from "../i18n";
import { HourChart } from "./HourChart";

const hours = Array.from({ length: 24 }, (_, hour) => (hour === 9 ? 3 : hour === 2 ? 1 : 0));

describe("HourChart", () => {
  it("folds the answers by hour away, from the hour the study day begins, with the total", () => {
    const { container } = render(<HourChart hours={hours} dayBoundaryHour={4} />);
    expect(container.querySelector("details.chart-fold")).not.toHaveAttribute("open");
    expect(screen.getByText("Show when in the day you study")).toBeInTheDocument();
    expect(screen.getByText(/^In your current time zone/)).toBeInTheDocument();
    const bars = [...container.querySelectorAll("g[data-bar]")].map((bar) =>
      bar.getAttribute("data-bar"),
    );
    expect(bars).toHaveLength(24);
    expect(bars.slice(0, 2)).toEqual(["4", "5"]);
    expect(bars.at(-1)).toBe("3");
    expect(container.querySelectorAll("rect.bar")).toHaveLength(2);
    // Every sixth hour, centred over its six bars.
    expect(
      [...container.querySelectorAll(".bar-ticks span")].map((tick) => tick.textContent),
    ).toEqual(["7 AM", "1 PM", "7 PM", "1 AM"]);
    fireEvent.pointerEnter(container.querySelector('g[data-bar="9"]')!);
    expect(screen.getByText("9 AM: 3 answers.")).toBeInTheDocument();
    const rows = screen.getAllByRole("row", { hidden: true }).map((row) => row.textContent);
    expect(rows[0]).toBe("HourAnswers");
    expect(rows[1]).toBe("4 AM0");
    expect(rows.at(-1)).toBe("Total4");
  });

  it("names the hours as the spoken language writes them", () => {
    const { container } = render(
      <I18nProvider locale="de" onChoose={() => undefined}>
        <HourChart hours={hours} dayBoundaryHour={0} />
      </I18nProvider>,
    );
    expect(container.querySelector(".bar-ticks span")).toHaveTextContent("03 Uhr");
  });
});
