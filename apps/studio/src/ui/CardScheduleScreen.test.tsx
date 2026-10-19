// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import type { ReviewState } from "@solid-memo/domain/review";
import { CardScheduleScreen } from "./CardScheduleScreen";
import { answer, dialog } from "../test/dialogs";

const state: ReviewState = {
  cardId: "water",
  direction: "front-to-back",
  easeFactor: 2.36,
  intervalDays: 15,
  repetitions: 3,
  due: "2026-10-24",
  firstReviewedAt: "2026-09-21T12:00:00.000Z",
  lastReviewedAt: "2026-10-09T12:00:00.000Z",
  formatVersion: 2,
};

function renderScreen(overrides: Partial<Parameters<typeof CardScheduleScreen>[0]> = {}) {
  const props = {
    directions: [
      { direction: "front-to-back" as const, state, studied: true, fsrs: null },
      { direction: "back-to-front" as const, state: null, studied: true, fsrs: null },
    ],
    busy: false,
    done: null,
    error: null,
    onReset: vi.fn(),
    onReschedule: vi.fn(),
    ...overrides,
  };
  const view = render(<CardScheduleScreen {...props} />);
  return { ...props, ...view };
}

/** An instant as the screen shows it, in the time zone the test runs in. */
const instant = (iso: string) =>
  new Date(iso).toLocaleString("en", { dateStyle: "long", timeStyle: "short" });

const direction = (name: string) => within(screen.getByRole("region", { name }));

describe("CardScheduleScreen", () => {
  it("shows the card's state in each direction, and says when it has none", () => {
    renderScreen();
    const forward = direction("Front → back");
    const facts = forward.getAllByRole("definition").map((each) => each.textContent);
    expect(forward.getAllByRole("term").map((each) => each.textContent)).toEqual([
      "Due",
      "Interval",
      "Ease",
      "Right in a row",
      "First reviewed",
      "Last reviewed",
    ]);
    expect(facts.slice(0, 4)).toEqual(["October 24, 2026", "15 days", "2.36", "3"]);
    expect(facts.slice(4)).toEqual([instant(state.firstReviewedAt), instant(state.lastReviewedAt)]);
    expect(
      direction("Back → front").getByText("Not studied this way yet: the card is new."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Neither changes the card's answers: they stay in the history and the statistics.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.queryByRole("heading", { name: "FSRS-6" })).not.toBeInTheDocument();
  });

  it("shows FSRS-6's memory beside SM-2's state, and starts the due day at FSRS-6's when it sets it", () => {
    const fsrs = {
      kind: "memory" as const,
      stability: 21.347,
      difficulty: 5.04,
      recall: 0.934,
      due: "2026-10-30",
      sets: true,
    };
    const { onReschedule } = renderScreen({
      directions: [{ direction: "front-to-back", state, studied: true, fsrs }],
    });
    const forward = direction("Front → back");
    expect(forward.getAllByRole("heading", { level: 4 }).map((each) => each.textContent)).toEqual([
      "SM-2",
      "FSRS-6",
    ]);
    expect(forward.getAllByRole("term").map((each) => each.textContent)).toEqual([
      "Due",
      "Interval",
      "Ease",
      "Right in a row",
      "First reviewed",
      "Last reviewed",
      "Due",
      "Stability",
      "Difficulty",
      "Recall chance now",
    ]);
    expect(
      forward
        .getAllByRole("definition")
        .slice(6)
        .map((each) => each.textContent),
    ).toEqual(["October 30, 2026", "21.3 days", "5 of 10", "93%"]);
    expect(
      forward.getByText(
        "FSRS-6 sets the due days, as the instance's preferences say; SM-2's state is kept up to date beside it.",
      ),
    ).toBeInTheDocument();
    expect(forward.getByLabelText("Due on")).toHaveValue("2026-10-30");
    fireEvent.click(forward.getByRole("button", { name: "Set due date" }));
    expect(onReschedule).toHaveBeenCalledWith("front-to-back", "2026-10-30");
  });

  it("says FSRS-6's state is not kept up to date while SM-2 sets the due days", () => {
    renderScreen({
      directions: [
        {
          direction: "front-to-back",
          state,
          studied: true,
          fsrs: {
            kind: "memory",
            stability: 1,
            difficulty: 9.96,
            recall: 0.5,
            due: "2026-10-10",
            sets: false,
          },
        },
      ],
    });
    const forward = direction("Front → back");
    expect(forward.getAllByRole("definition").at(-3)).toHaveTextContent("1 day");
    expect(forward.getAllByRole("definition").at(-2)).toHaveTextContent("10 of 10");
    expect(
      forward.getByText(
        "SM-2 sets the due days, as the instance's preferences say; FSRS-6's state is not updated meanwhile, and switching to FSRS-6 works it out anew.",
      ),
    ).toBeInTheDocument();
    expect(forward.getByLabelText("Due on")).toHaveValue("2026-10-24");
  });

  it("says FSRS-6 estimates the card's state at its next review when it has none up to date", () => {
    renderScreen({
      directions: [
        { direction: "front-to-back", state, studied: true, fsrs: { kind: "estimated" } },
      ],
    });
    const forward = direction("Front → back");
    expect(forward.getByRole("heading", { name: "FSRS-6" })).toBeInTheDocument();
    expect(forward.getAllByRole("term")).toHaveLength(6);
    expect(
      forward.getByText(
        "FSRS-6 sets the due days, as the instance's preferences say, but has no up-to-date state of the card this way: SM-2's due day counts until the next review, which estimates FSRS-6's state from SM-2's.",
      ),
    ).toBeInTheDocument();
    expect(forward.getByLabelText("Due on")).toHaveValue("2026-10-24");
  });

  it("says when the deck no longer studies the card a way it keeps progress in", () => {
    renderScreen({
      directions: [
        {
          direction: "back-to-front",
          state: { ...state, direction: "back-to-front" },
          studied: false,
          fsrs: null,
        },
      ],
    });
    expect(
      direction("Back → front").getByText(
        "The deck is no longer studied this way. The card's progress this way is kept.",
      ),
    ).toBeInTheDocument();
  });

  it("sets the due day, the one it has to start with", () => {
    const { onReschedule } = renderScreen();
    const day = direction("Front → back").getByLabelText("Due on");
    expect(day).toHaveValue("2026-10-24");
    fireEvent.input(day, { target: { value: "2026-10-12" } });
    fireEvent.click(direction("Front → back").getByRole("button", { name: "Set due date" }));
    expect(onReschedule).toHaveBeenCalledWith("front-to-back", "2026-10-12");
  });

  it("forgets the progress once the user confirms", () => {
    const { onReset } = renderScreen();
    const forget = direction("Front → back").getByRole("button", { name: "Forget progress" });
    fireEvent.click(forget);
    expect(dialog("Forget the card's progress")).toHaveTextContent(
      "Forget the card's progress this way? It becomes new again. Its answers stay in the history.",
    );
    answer("Forget the card's progress", "Cancel");
    expect(onReset).not.toHaveBeenCalled();
    fireEvent.click(forget);
    answer("Forget the card's progress", "Forget progress");
    expect(onReset).toHaveBeenCalledWith("front-to-back");
  });

  it("says what was done, or why not, and does nothing while a change is made", () => {
    const { rerender } = renderScreen({ done: { kind: "reset", direction: "back-to-front" } });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Forgot the card's progress in the direction “Back → front”.",
    );
    rerender(
      <CardScheduleScreen
        directions={[{ direction: "front-to-back", state, studied: true, fsrs: null }]}
        busy
        done={{ kind: "reschedule", direction: "front-to-back", due: "2026-10-12" }}
        error="Pod unreachable"
        onReset={vi.fn()}
        onReschedule={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "“Front → back” is now due on October 12, 2026.",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Pod unreachable");
    expect(screen.getByRole("button", { name: "Set due date" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Forget progress" })).toBeDisabled();
    expect(screen.getByLabelText("Due on")).toBeDisabled();
  });
});
