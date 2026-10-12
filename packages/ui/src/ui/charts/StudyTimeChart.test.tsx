// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { StudyTime } from "@solid-memo/domain/studyTime";
import { StudyTimeChart, StudyTimeHint, StudyTimeTiles } from "./StudyTimeChart";

const time: StudyTime = {
  answers: 30,
  sessions: 3,
  ms: 2 * 3_600_000 + 15 * 60_000,
  medianAnswerMs: 8_400,
  days: [
    { studyDay: "2026-08-01", answers: 10, sessions: 1, ms: 3_600_000 },
    { studyDay: "2026-10-02", answers: 15, sessions: 1, ms: 45 * 60_000 },
    { studyDay: "2026-10-03", answers: 5, sessions: 1, ms: 30 * 60_000 },
  ],
  recorded: null,
};

describe("StudyTimeTiles", () => {
  it("says about how long, in seconds, minutes or hours, and how many sessions", () => {
    render(<StudyTimeTiles time={time} />);
    expect(screen.getByRole("group", { name: "Time studied" })).toHaveTextContent(
      "about 2.3 hoursabout 45 minutes a study day on average",
    );
    expect(screen.getByRole("group", { name: "Sessions" })).toHaveTextContent(
      "31 a study day on average",
    );
    expect(screen.getByRole("group", { name: "Time per answer (median)" })).toHaveTextContent(
      "about 8 seconds",
    );
  });

  it("picks the unit by the rounded time, and says at least one second", () => {
    const tile = (ms: number) => {
      const { unmount } = render(<StudyTimeTiles time={{ ...time, medianAnswerMs: ms }} />);
      const text = screen.getByRole("group", { name: "Time per answer (median)" }).textContent;
      unmount();
      return text;
    };
    expect(tile(200)).toBe("Time per answer (median)about 1 second");
    expect(tile(59_400)).toBe("Time per answer (median)about 59 seconds");
    expect(tile(59_600)).toBe("Time per answer (median)about 1 minute");
    expect(tile(59.4 * 60_000)).toBe("Time per answer (median)about 59 minutes");
    expect(tile(59.6 * 60_000)).toBe("Time per answer (median)about 1 hour");
  });

  it("gives dashes while no session has had two answers", () => {
    render(
      <StudyTimeTiles
        time={{
          ...time,
          ms: 0,
          medianAnswerMs: null,
          days: [{ studyDay: "2026-10-03", answers: 1, sessions: 1, ms: 0 }],
        }}
      />,
    );
    expect(screen.getByRole("group", { name: "Time studied" })).toHaveTextContent(
      "–Too few answers in a row to tell yet",
    );
    expect(screen.getByRole("group", { name: "Time per answer (median)" })).toHaveTextContent("–");
  });
});

describe("StudyTimeTiles of recorded times", () => {
  it("gives the time recorded, and a dash for the time per answer while no recalled answer has one", () => {
    render(
      <StudyTimeTiles
        time={{
          ...time,
          ms: 6_000,
          medianAnswerMs: null,
          days: [{ studyDay: "2026-10-03", answers: 1, sessions: 1, ms: 6_000 }],
          recorded: { since: "2026-10-03", answers: 1, ms: 6_000, unknown: 0 },
        }}
      />,
    );
    expect(screen.getByRole("group", { name: "Time studied" })).toHaveTextContent(
      "about 6 secondsabout 6 seconds a study day on average",
    );
    expect(screen.getByRole("group", { name: "Time per answer (median)" })).toHaveTextContent("–");
  });
});

describe("StudyTimeHint", () => {
  it("says how the time is estimated before any is recorded", () => {
    render(<StudyTimeHint time={time} />);
    expect(screen.getByText(/^Approximate, estimated from the times/)).toBeInTheDocument();
  });

  it("says since when times are recorded, and how many of the range's answers since have none", () => {
    const recorded = { since: "2026-10-02", answers: 20, ms: 60_000, unknown: 0 };
    const { container, rerender } = render(<StudyTimeHint time={{ ...time, recorded }} />);
    expect(container).toHaveTextContent(
      /^Since October 2, 2026, the app records how long each answer takes.*course answers are left out\.$/,
    );
    rerender(<StudyTimeHint time={{ ...time, recorded: { ...recorded, unknown: 1 } }} />);
    expect(container).toHaveTextContent(
      /left out\. Of the answers in this range since then, 1 has no time recorded and is not counted\.$/,
    );
  });
});

describe("StudyTimeChart", () => {
  it("draws the minutes of each of the last days, with their sessions, and the table of those days", () => {
    const { container } = render(<StudyTimeChart time={time} today="2026-10-03" />);
    expect(screen.getByText("Time studied each day, the last 30 days")).toBeInTheDocument();
    expect(container.querySelectorAll("g[data-bar]")).toHaveLength(30);
    expect(container.querySelectorAll("rect.bar")).toHaveLength(2);
    fireEvent.pointerEnter(container.querySelector('g[data-bar="2026-10-02"]')!);
    expect(screen.getByText("October 2, 2026: about 45 minutes in 1 session.")).toBeInTheDocument();
    fireEvent.pointerEnter(container.querySelector('g[data-bar="2026-10-01"]')!);
    expect(screen.getByText("October 1, 2026: no time counted.")).toBeInTheDocument();
    // August is before the days shown: only theirs, newest first.
    expect(screen.getAllByRole("row").map((row) => row.textContent)).toEqual([
      "DayTimeSessionsAnswers",
      "October 3, 2026about 30 minutes15",
      "October 2, 2026about 45 minutes115",
    ]);
  });

  it("tells a day that only carries on the session of the day before", () => {
    const { container } = render(
      <StudyTimeChart
        time={{
          ...time,
          days: [
            { studyDay: "2026-10-02", answers: 3, sessions: 1, ms: 3 * 60_000 },
            { studyDay: "2026-10-03", answers: 12, sessions: 0, ms: 10 * 60_000 },
          ],
        }}
        today="2026-10-03"
      />,
    );
    fireEvent.pointerEnter(container.querySelector('g[data-bar="2026-10-03"]')!);
    expect(
      screen.getByText(
        "October 3, 2026: about 10 minutes, carrying on a session from the day before.",
      ),
    ).toBeInTheDocument();
  });
});
