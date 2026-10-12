// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/preact";
import { I18nProvider } from "../i18n";
import { MaturityBar } from "./MaturityBar";

describe("MaturityBar", () => {
  it("gives each stage with prompts a share of one bar, and every count, zeros too, in words", () => {
    const { container } = render(
      <MaturityBar
        progress={{ new: 3, relearning: 2, young: 0, mature: 1 }}
        caption="Card maturity"
      />,
    );
    expect(
      screen.getByRole("img", { name: "3 new, 2 relearning, 0 young and 1 mature." }),
    ).toBeInTheDocument();
    const segments = container.querySelectorAll<HTMLElement>(".maturity-segment");
    expect([...segments].map((segment) => segment.className)).toEqual([
      "maturity-segment maturity-new",
      "maturity-segment maturity-relearning",
      "maturity-segment maturity-mature",
    ]);
    expect(segments[0]!.style.flexGrow).toBe("3");
    expect(container.querySelector(".maturity-legend")).toHaveTextContent(
      "3 new2 relearning0 young1 mature",
    );
  });

  it("speaks the counts in the chosen language", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <MaturityBar progress={{ new: 1, relearning: 0, young: 2, mature: 0 }} caption="Mognad" />
      </I18nProvider>,
    );
    expect(
      screen.getByRole("img", { name: "1 nytt, 0 lärs om, 2 unga och 0 mogna." }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 nytt")).toBeInTheDocument();
  });
});
