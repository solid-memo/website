// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { I18nProvider } from "../i18n";
import { WeekdayChart } from "./WeekdayChart";

describe("WeekdayChart", () => {
  const weekdays = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    answers: weekday === 0 ? 5 : 0,
    days: weekday < 2 ? 2 : 1,
    studied: weekday === 0 ? 2 : 0,
  }));

  it("draws the answers on each weekday on average, Monday first, named under the bars", () => {
    const { container } = render(<WeekdayChart weekdays={weekdays} />);
    expect(screen.getByText("Answers by weekday")).toBeInTheDocument();
    expect(container.querySelectorAll("g[data-bar]")).toHaveLength(7);
    expect(container.querySelectorAll("rect.bar")).toHaveLength(1);
    expect(container.querySelector(".bar-ticks")).toHaveTextContent("MonTueWedThuFriSatSun");
    fireEvent.pointerEnter(container.querySelector('g[data-bar="0"]')!);
    expect(screen.getByText("Monday: 2.5 answers on average; studied 2 of 2.")).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("row")
        .map((row) => row.textContent)
        .slice(0, 3),
    ).toEqual(["WeekdayAnswers on averageStudied", "Monday2.52 of 2", "Tuesday00 of 2"]);
  });

  it("says an average to the tenth, in its plural form", () => {
    const { container } = render(
      <WeekdayChart
        weekdays={weekdays.map((weekday) =>
          weekday.weekday === 1
            ? { ...weekday, answers: 2, studied: 1 }
            : weekday.weekday === 2
              ? { ...weekday, answers: 4, days: 3, studied: 3 }
              : weekday,
        )}
      />,
    );
    fireEvent.click(container.querySelector('g[data-bar="1"]')!);
    expect(screen.getByText("Tuesday: 1 answer on average; studied 1 of 2.")).toBeInTheDocument();
    fireEvent.click(container.querySelector('g[data-bar="2"]')!);
    expect(
      screen.getByText("Wednesday: 1.3 answers on average; studied 3 of 3."),
    ).toBeInTheDocument();
  });

  it("names the weekdays in the spoken language", () => {
    const { container } = render(
      <I18nProvider locale="de" onChoose={() => undefined}>
        <WeekdayChart weekdays={weekdays.map((weekday) => ({ ...weekday, days: 0, studied: 0 }))} />
      </I18nProvider>,
    );
    expect(container.querySelector(".bar-ticks")!.firstChild).toHaveTextContent("Mo");
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Montag00 von 0");
  });
});
