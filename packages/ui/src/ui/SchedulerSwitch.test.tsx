// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/preact";
import { SchedulerSwitchProgress, SchedulerSwitchResult } from "./SchedulerSwitch";

describe("SchedulerSwitchProgress", () => {
  it("names every step, the one under way announced", () => {
    render(<SchedulerSwitchProgress progress={{ step: "preferences", done: 2, total: 3 }} />);
    const region = screen.getByRole("region", { name: "Switching to FSRS-6" });
    expect(region).toHaveTextContent("Reading your answers and decks");
    expect(region).toHaveTextContent("Working out each card's memory");
    expect(screen.getByRole("progressbar", { name: "Switch progress" })).toHaveAttribute(
      "value",
      "2",
    );
    expect(region).toHaveTextContent(/Keep this page open until the switch is done/);
  });
});

describe("SchedulerSwitchResult", () => {
  it("says only that the due days are kept when no card was there to switch", () => {
    const onClose = vi.fn();
    render(
      <SchedulerSwitchResult
        outcome={{ switched: true, decks: 0, replayed: 0, estimated: 0, failed: [] }}
        onRetry={vi.fn()}
        onClose={onClose}
      />,
    );
    const region = screen.getByRole("region", { name: "Switched to FSRS-6" });
    expect(region).not.toHaveTextContent(/worked out|estimated/);
    expect(region).toHaveTextContent("Every card stays due on the day it was due.");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    screen.getByRole("button", { name: "Done" }).click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("says how many decks were switched, and how each card was worked out", () => {
    render(
      <SchedulerSwitchResult
        outcome={{ switched: true, decks: 2, replayed: 5, estimated: 1, failed: [] }}
        onRetry={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const region = screen.getByRole("region", { name: "Switched to FSRS-6" });
    expect(region).toHaveTextContent("2 decks were switched.");
    expect(region).toHaveTextContent("5 cards were worked out from all your answers to them.");
    expect(region).toHaveTextContent("1 card, whose answers are not all in your history");
  });

  it("names the decks that failed, how many were switched before, and offers to try again", () => {
    const onRetry = vi.fn();
    render(
      <SchedulerSwitchResult
        outcome={{
          switched: false,
          decks: 1,
          replayed: 0,
          estimated: 0,
          failed: [{ url: "d", title: { en: "Verbs" }, error: new Error("offline") }],
        }}
        onRetry={onRetry}
        onClose={vi.fn()}
      />,
    );
    const region = screen.getByRole("region", { name: "Switch not finished" });
    expect(region).toHaveTextContent("1 deck could not be switched now:");
    expect(region).toHaveTextContent("Verbs: ");
    expect(region).toHaveTextContent("1 deck was switched. SM-2 still schedules your reviews.");
    screen.getByRole("button", { name: "Try again" }).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
