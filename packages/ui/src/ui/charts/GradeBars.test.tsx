// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { statusTexts } from "../../test/liveRegions";
import { GradeBars } from "./GradeBars";

describe("GradeBars", () => {
  const buttons = {
    introductions: { again: 1, hard: 0, good: 3, easy: 0 },
    young: { again: 0, hard: 1, good: 2, easy: 1 },
    mature: { again: 0, hard: 0, good: 0, easy: 0 },
  };

  it("gives each kind of answer a bar of the buttons pressed, its share when pointed at, and every count in the table", () => {
    const { container } = render(<GradeBars buttons={buttons} />);
    expect(screen.getByText("Answer buttons")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "First answers: Again 1, Hard 0, Good 3, Easy 0." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Mature: Again 0, Hard 0, Good 0, Easy 0." }),
    ).toBeEmptyDOMElement();
    expect(container.querySelectorAll(".grade-segment")).toHaveLength(2 + 3);
    fireEvent.pointerEnter(container.querySelector('[data-part="introductions good"]')!);
    expect(screen.getByText("First answers: Good on 3 answers, 75%.")).toBeInTheDocument();
    expect(container.querySelector('[data-part="introductions good"]')).toHaveClass("pointed");
    fireEvent.click(container.querySelector('[data-part="young easy"]')!);
    expect(screen.getByText("Young: Easy on 1 answer, 25%.")).toBeInTheDocument();
    expect(screen.getAllByRole("row").map((row) => row.textContent)).toEqual([
      "AnswersAgainHardGoodEasy",
      "First answers1 (25%)03 (75%)0",
      "Young01 (25%)2 (50%)1 (25%)",
      "Mature0000",
    ]);
  });

  it("makes each bar with answers a tab stop whose steps the arrow keys move along", () => {
    const { container } = render(<GradeBars buttons={buttons} />);
    const young = screen.getByRole("img", { name: /^Young:/ });
    expect(young).toHaveAttribute("tabindex", "0");
    expect(young).toHaveAccessibleDescription(/arrow keys/);
    expect(screen.getByRole("img", { name: /^Mature:/ })).not.toHaveAttribute("tabindex");
    fireEvent.keyDown(young, { key: "End" });
    expect(container.querySelector('[data-part="young easy"]')).toHaveClass("pointed");
    fireEvent.keyDown(young, { key: "ArrowLeft" });
    expect(statusTexts()).toEqual(["Young: Good on 2 answers, 50%."]);
  });
});
