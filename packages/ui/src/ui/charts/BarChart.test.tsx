// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { statusTexts } from "../../test/liveRegions";
import { BarChart } from "./BarChart";

describe("BarChart", () => {
  it("stands a bar's figures side by side when grouped, and names the bars under them", () => {
    const { container } = render(
      <BarChart
        caption="Pairs"
        label="Pairs of bars"
        bars={[
          { key: "a", values: [2, 4], text: "A" },
          { key: "b", values: [0, 1], text: "B" },
        ]}
        series={[
          { label: "One", step: 2 },
          { label: "Two", step: 4 },
        ]}
        grouped
        ticks={["Mo", "Tu"]}
        prompt="Point"
      >
        {null}
      </BarChart>,
    );
    const [first, second] = container.querySelectorAll('g[data-bar="a"] rect.bar');
    expect(Number(second!.getAttribute("x"))).toBeGreaterThan(Number(first!.getAttribute("x")));
    expect(Number(second!.getAttribute("height"))).toBe(60);
    expect(container.querySelectorAll('g[data-bar="b"] rect.bar')).toHaveLength(1);
    expect(container.querySelector(".bar-ticks")).toHaveTextContent("MoTu");
  });

  it("is one tab stop whose bars the arrow keys step along, each read out", () => {
    const { container } = render(
      <BarChart
        caption="Bars"
        label="Bars"
        bars={[
          { key: "a", values: [2], text: "A holds 2" },
          { key: "b", values: [1], text: "B holds 1" },
        ]}
        prompt="Point"
      >
        {null}
      </BarChart>,
    );
    const chart = screen.getByRole("img", { name: "Bars" });
    expect(chart).toHaveAttribute("tabindex", "0");
    expect(chart).toHaveAccessibleDescription("Point");
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    expect(container.querySelector('g[data-bar="b"] rect.bar')).toHaveClass("pointed");
    expect(container.querySelector(".chart-inspector")).toHaveTextContent("B holds 1");
    expect(statusTexts()).toEqual(["B holds 1"]);
    fireEvent.keyDown(chart, { key: "Escape" });
    expect(container.querySelector(".chart-inspector")).toHaveTextContent("Point");
    expect(statusTexts()).toEqual([]);
  });

  it("scales the bars to a top given, not to the largest", () => {
    const { container } = render(
      <BarChart
        caption="Shares"
        label="Shares"
        bars={[{ key: "a", values: [50], text: "A" }]}
        max={100}
        prompt="Point"
      >
        {null}
      </BarChart>,
    );
    expect(Number(container.querySelector("rect.bar")!.getAttribute("height"))).toBe(30);
  });
});
