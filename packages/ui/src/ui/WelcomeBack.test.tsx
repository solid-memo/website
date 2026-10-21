// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/preact";
import type { WelcomeBack as Welcome } from "@solid-memo/domain/statistics";
import { WelcomeBack } from "./WelcomeBack";

// A day number that is a multiple of both notes' counts: each list's first.
const DAY = 20;
const welcome = (summary: Partial<Welcome> = {}): Welcome => ({
  streak: 5,
  longestStreak: 9,
  dayNumber: DAY,
  ...summary,
});
const strip = () => screen.getByRole("complementary", { name: "Your streak" });

describe("WelcomeBack", () => {
  it("leads with the streak and the day's note on it, then the cards left and their time", () => {
    render(<WelcomeBack welcome={welcome()} left={7} minutesLeft={3} />);
    expect(strip()).toHaveTextContent(
      "5-day streak Welcome back! Study today to make it 6." +
        "7 left to study today · about 3 minutes to go",
    );
  });

  it("takes the notes on the streak in turn, one a study day", () => {
    const notes = [0, 1, 2, 3, 4].map((day) => {
      const { unmount } = render(<WelcomeBack welcome={welcome({ dayNumber: DAY + day })} />);
      const text = strip().textContent;
      unmount();
      return text;
    });
    expect(notes).toEqual([
      "5-day streak Welcome back! Study today to make it 6.",
      "5-day streak Keep it going: 5 days and counting.",
      "5-day streak Your 5-day streak is waiting for today's cards.",
      "5-day streak One session keeps your streak alive.",
      // Round again.
      "5-day streak Welcome back! Study today to make it 6.",
    ]);
  });

  it("speaks of the record whenever one more day ties or beats it, whatever the day", () => {
    const { rerender } = render(
      <WelcomeBack welcome={welcome({ streak: 8, longestStreak: 9, dayNumber: DAY + 1 })} />,
    );
    expect(strip()).toHaveTextContent("8-day streak One more day ties your record of 9.");
    rerender(
      <WelcomeBack welcome={welcome({ streak: 9, longestStreak: 9, dayNumber: DAY + 2 })} />,
    );
    expect(strip()).toHaveTextContent("9-day streak Study today for a new record!");
  });

  it("nudges gently once the streak has lapsed, a note a study day, with no streak to show", () => {
    const notes = [0, 1, 2, 3, 4].map((day) => {
      const { unmount } = render(
        <WelcomeBack welcome={welcome({ streak: 0, dayNumber: DAY + day })} />,
      );
      const text = strip().textContent;
      unmount();
      return text;
    });
    expect(notes).toEqual([
      "Start a new streak today.",
      "Welcome back! A few cards today begin a new streak.",
      "Every streak begins with day one. Today can be it.",
      "Your record is 9 days. Start a new streak today.",
      "Good to see you again. Your cards are ready when you are.",
    ]);
    render(<WelcomeBack welcome={welcome({ streak: 0, longestStreak: 1, dayNumber: DAY + 3 })} />);
    expect(
      screen.getByText("Your record is 1 day. Start a streak today to beat it."),
    ).toBeVisible();
  });

  it("says the cards left once known and while there are any, and their time once known", () => {
    const { rerender } = render(<WelcomeBack welcome={welcome()} left={7} />);
    expect(screen.getByText("7 left to study today")).toBeInTheDocument();
    rerender(<WelcomeBack welcome={welcome()} left={0} minutesLeft={1} />);
    expect(screen.queryByText(/left to study today|to go/)).toBeNull();
    rerender(<WelcomeBack welcome={welcome()} minutesLeft={1} />);
    expect(screen.queryByText(/left to study today|to go/)).toBeNull();
  });
});
