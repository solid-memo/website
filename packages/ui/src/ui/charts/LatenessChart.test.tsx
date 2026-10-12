// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { LATENESSES, type Lateness, type LatenessRecall } from "@solid-memo/domain/memoryCurve";
import { LatenessChart } from "./LatenessChart";

/** Every lateness, those given with their reviews and how many were remembered, the rest none. */
function latenessOf(given: Partial<Record<Lateness, [number, number]>>): LatenessRecall[] {
  return LATENESSES.map((lateness) => {
    const [reviews, recalled] = given[lateness] ?? [0, 0];
    return { lateness, recall: { reviews, recalled } };
  });
}

describe("LatenessChart", () => {
  it("draws the share remembered by lateness, and sets the reviews on time beside the late ones", () => {
    const { container } = render(
      <LatenessChart
        lateness={latenessOf({ onTime: [10, 9], late1: [2, 1], late30: [2, 0], unknown: [1, 1] })}
      />,
    );
    expect(screen.getByText("What a late review costs")).toBeInTheDocument();
    expect(screen.getByText(/^Approximate:/)).toBeInTheDocument();
    expect(
      screen.getByText(
        "Reviews done on time: 90% of 10 reviews remembered. Done late: 25% of 4 reviews.",
      ),
    ).toBeInTheDocument();
    fireEvent.pointerEnter(container.querySelector('g[data-bar="late1"]')!);
    expect(screen.getByText("1–2 days late: 50% of 2 reviews.")).toBeInTheDocument();
    expect(screen.getAllByRole("row").map((row) => row.textContent)).toEqual([
      "DoneRecall",
      "On time90% of 10 reviews",
      "1–2 days late50% of 2 reviews",
      "3–6 days lateno reviews",
      "7–29 days lateno reviews",
      "30 days late or more0% of 2 reviews",
      "Early, or moved earlier in the Studiono reviews",
      "Unknown100% of 1 review",
    ]);
  });

  it("says nothing of on time against late without reviews of both", () => {
    const { rerender } = render(<LatenessChart lateness={latenessOf({ onTime: [3, 3] })} />);
    expect(screen.queryByText(/^Reviews done on time/)).toBeNull();
    rerender(<LatenessChart lateness={latenessOf({ late7: [1, 1] })} />);
    expect(screen.queryByText(/^Reviews done on time/)).toBeNull();
  });
});
