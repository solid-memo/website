import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import type { ReviewState } from "@solid-memo/domain/review";
import { CardScheduleScreen } from "./CardScheduleScreen";

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
      { direction: "front-to-back" as const, state, studied: true },
      { direction: "back-to-front" as const, state: null, studied: true },
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
const instant = (iso: string) => new Date(iso).toLocaleString("en", { dateStyle: "long", timeStyle: "short" });

const direction = (name: string) => within(screen.getByRole("region", { name }));

afterEach(() => vi.unstubAllGlobals());

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
    expect(direction("Back → front").getByText("Not studied this way yet: the card is new.")).toBeInTheDocument();
    expect(screen.getByText("Neither changes the card's answers: they stay in the history and the statistics.")).toBeInTheDocument();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("says when the deck no longer studies the card a way it keeps progress in", () => {
    renderScreen({ directions: [{ direction: "back-to-front", state: { ...state, direction: "back-to-front" }, studied: false }] });
    expect(direction("Back → front").getByText("The deck is no longer studied this way. The card's progress this way is kept.")).toBeInTheDocument();
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
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    const { onReset } = renderScreen();
    const forget = direction("Front → back").getByRole("button", { name: "Forget progress" });
    fireEvent.click(forget);
    expect(confirm).toHaveBeenCalledWith("Forget the card's progress this way? It becomes new again. Its answers stay in the history.");
    expect(onReset).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(forget);
    expect(onReset).toHaveBeenCalledWith("front-to-back");
  });

  it("says what was done, or why not, and does nothing while a change is made", () => {
    const { rerender } = renderScreen({ done: { kind: "reset", direction: "back-to-front" } });
    expect(screen.getByRole("status")).toHaveTextContent("Forgot the card's progress in the direction “Back → front”.");
    rerender(
      <CardScheduleScreen
        directions={[{ direction: "front-to-back", state, studied: true }]}
        busy
        done={{ kind: "reschedule", direction: "front-to-back", due: "2026-10-12" }}
        error="Pod unreachable"
        onReset={vi.fn()}
        onReschedule={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("“Front → back” is now due on October 12, 2026.");
    expect(screen.getByRole("alert")).toHaveTextContent("Pod unreachable");
    expect(screen.getByRole("button", { name: "Set due date" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Forget progress" })).toBeDisabled();
    expect(screen.getByLabelText("Due on")).toBeDisabled();
  });
});
