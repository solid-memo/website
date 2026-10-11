// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { problem } from "@solid-memo/domain/release/problems";
import { DRAFT_URL } from "../test/fixtures";
import { listedProblems } from "./ProblemList";

describe("listedProblems", () => {
  it("puts the errors first, each subject's together, as the list shows them", () => {
    const warning = problem(
      `${DRAFT_URL}#a`,
      { code: "unshaped", params: {} },
      { severity: "warning" },
    );
    const a = problem(`${DRAFT_URL}#a`, { code: "noBack", params: {} });
    const b = problem(`${DRAFT_URL}#b`, { code: "noBack", params: {} });
    const a2 = problem(`${DRAFT_URL}#a`, { code: "unshaped", params: {} });
    expect(listedProblems([warning, a, b, a2])).toEqual([a, a2, b, warning]);
  });
});
