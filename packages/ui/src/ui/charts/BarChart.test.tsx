// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/preact";
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
});
