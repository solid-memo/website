import { describe, expect, it } from "vitest";
import type { ReviewState } from "./review";
import { isStudyDay, rescheduleState, rescheduleStates, resetStates } from "./reviewStateEdits";
import { resetStudyDay } from "./scheduling";

const now = new Date(2026, 9, 9, 15, 0);
const lastWeek = new Date(2026, 9, 2, 15, 0);
const yesterday = new Date(2026, 9, 8, 15, 0);

/** A state reviewed today, after a first review last week, with its snapshot of yesterday's state. */
function state(cardId: string, direction: ReviewState["direction"] = "front-to-back"): ReviewState {
  return {
    cardId,
    direction,
    easeFactor: 2.6,
    intervalDays: 15,
    repetitions: 3,
    due: "2026-10-24",
    firstReviewedAt: lastWeek.toISOString(),
    lastReviewedAt: now.toISOString(),
    formatVersion: 2,
    previous: {
      easeFactor: 2.5,
      intervalDays: 6,
      repetitions: 2,
      due: "2026-10-08",
      lastReviewedAt: yesterday.toISOString(),
    },
  };
}

const states = [state("a"), state("a", "back-to-front"), state("b"), state("c")];

describe("isStudyDay", () => {
  it("takes a real date as YYYY-MM-DD only", () => {
    expect(isStudyDay("2026-10-09")).toBe(true);
    expect(isStudyDay("2028-02-29")).toBe(true);
    expect(isStudyDay("2026-02-30")).toBe(false);
    expect(isStudyDay("2026-13-01")).toBe(false);
    expect(isStudyDay("2026-1-9")).toBe(false);
    expect(isStudyDay("2026-10-09T00:00")).toBe(false);
    expect(isStudyDay("")).toBe(false);
  });
});

describe("resetStates", () => {
  it("forgets the chosen cards in both directions, and only them", () => {
    expect(resetStates(states, ["a", "c"])).toEqual([
      { cardId: "a", direction: "front-to-back" },
      { cardId: "a", direction: "back-to-front" },
      { cardId: "c", direction: "front-to-back" },
    ]);
  });

  it("forgets one direction when asked", () => {
    expect(resetStates(states, ["a"], "back-to-front")).toEqual([{ cardId: "a", direction: "back-to-front" }]);
  });

  it("has nothing to forget of a card never studied", () => {
    expect(resetStates(states, ["new"])).toEqual([]);
  });
});

describe("rescheduleState", () => {
  it("sets the due day, keeping the rest of the schedule", () => {
    const { previous: _previous, ...rest } = state("a");
    expect(rescheduleState(state("a"), "2026-11-01")).toEqual({ ...rest, due: "2026-11-01" });
  });

  it("drops the snapshot, so resetting the day can never bring back a state from before it", () => {
    const moved = rescheduleState(state("a"), "2026-11-01");
    expect(moved).not.toHaveProperty("previous");
    // Without the rule, the reset would restore the snapshot: due 2026-10-08, interval 6.
    expect(resetStudyDay([moved], now, 4)).toEqual({ restore: [{ ...moved, due: "2026-10-09" }], remove: [] });
  });

  it("refuses a day that is no date", () => {
    expect(() => rescheduleState(state("a"), "2026-02-30")).toThrow(expect.objectContaining({ code: "dueDayInvalid" }));
  });
});

describe("rescheduleStates", () => {
  it("sets the chosen cards due, in both directions or one, a card never studied staying new", () => {
    expect(rescheduleStates(states, ["a", "new"], "2026-11-01").map((s) => [s.cardId, s.direction, s.due])).toEqual([
      ["a", "front-to-back", "2026-11-01"],
      ["a", "back-to-front", "2026-11-01"],
    ]);
    expect(rescheduleStates(states, ["a"], "2026-11-01", "front-to-back")).toHaveLength(1);
  });

  it("refuses a day that is no date even with nothing to set", () => {
    expect(() => rescheduleStates(states, ["new"], "tomorrow")).toThrow(expect.objectContaining({ code: "dueDayInvalid" }));
  });
});
