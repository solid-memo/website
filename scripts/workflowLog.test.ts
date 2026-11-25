// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { inert } from "./workflowLog.ts";

describe("inert", () => {
  it("escapes `::` at a line's start, after any blank space, and `##[` anywhere", () => {
    expect(inert("::add-mask::8.5.1")).toBe("\\::add-mask::8.5.1");
    expect(inert("a\n  ::error::x\r\t::warning::y")).toBe("a\n  \\::error::x\r\t\\::warning::y");
    expect(inert("a\n\u0085 ::error::x")).toBe("a\n\u0085 \\::error::x");
    expect(inert("fix: tidy ##[add-mask]8.5.1 and ##[error]x")).toBe(
      "fix: tidy ##\\[add-mask]8.5.1 and ##\\[error]x",
    );
  });

  it("leaves other text as it is", () => {
    const text = "0123abcd fix: tidy a::b and std::move ## [x] #[y]";
    expect(inert(text)).toBe(text);
    expect(inert("")).toBe("");
  });
});
