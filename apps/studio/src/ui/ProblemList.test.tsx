// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/preact";
import { problem, type ReleaseProblem } from "@solid-memo/domain/release/problems";
import { courseDraft, DRAFT_URL } from "../test/fixtures";
import { listedProblems, PROBLEM_LIMIT, ProblemList, shownProblems } from "./ProblemList";

const warning = problem(
  `${DRAFT_URL}#a`,
  { code: "unshaped", params: {} },
  { severity: "warning" },
);
const a = problem(`${DRAFT_URL}#a`, { code: "noBack", params: {} });
const b = problem(`${DRAFT_URL}#b`, { code: "noBack", params: {} });
const a2 = problem(`${DRAFT_URL}#a`, { code: "unshaped", params: {} });

/** So many problems of each severity, each of its own subject. */
function many(count: number): ReleaseProblem[] {
  return (["error", "warning"] as const).flatMap((severity) =>
    Array.from({ length: count }, (_, at) =>
      problem(`${DRAFT_URL}#${severity}-${at}`, { code: "noBack", params: {} }, { severity }),
    ),
  );
}

describe("listedProblems", () => {
  it("puts the errors first, each subject's together, as the list shows them", () => {
    expect(listedProblems([warning, a, b, a2])).toEqual([a, a2, b, warning]);
  });
});

describe("shownProblems", () => {
  it("is the first PROBLEM_LIMIT of each severity, in the order listed", () => {
    expect(shownProblems([warning, a, b, a2])).toEqual([a, a2, b, warning]);
    const all = many(3000);
    const shown = shownProblems(all);
    expect(shown).toEqual([
      ...all.slice(0, PROBLEM_LIMIT),
      ...all.slice(3000, 3000 + PROBLEM_LIMIT),
    ]);
  });
});

describe("ProblemList", () => {
  it("lists at most PROBLEM_LIMIT problems of each severity, and says how many more there are", () => {
    render(<ProblemList draft={courseDraft()} problems={many(3000)} targetHref={() => "#/x"} />);
    for (const name of ["Errors", "Warnings"]) {
      const list = screen.getByRole("list", { name });
      expect(list.querySelectorAll("li li")).toHaveLength(PROBLEM_LIMIT);
      expect(
        within(list.parentElement!).getByText("And 2,950 more problems, not listed here."),
      ).toBeInTheDocument();
    }
  });

  it("says nothing more of a list it shows whole", () => {
    render(<ProblemList draft={courseDraft()} problems={[a, a2, b]} targetHref={() => "#/x"} />);
    expect(screen.getByRole("list", { name: "Errors" }).querySelectorAll("li li")).toHaveLength(3);
    expect(screen.queryByText(/not listed here/)).toBeNull();
  });
});
