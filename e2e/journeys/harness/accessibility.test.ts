// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  KNOWN_EXCEPTIONS,
  type KnownException,
  unexcused,
  type Violation,
  violationLines,
} from "./accessibility.ts";

const targetSize: Violation = {
  id: "target-size",
  impact: "serious",
  help: "All touch targets must be 24px large, or leave sufficient space",
  helpUrl: "https://dequeuniversity.com/rules/axe/4.13/target-size",
  nodes: [{ target: [".masthead > button"] }, { target: [["iframe", "a.small"]] }],
};
const imageAlt: Violation = {
  id: "image-alt",
  help: "Images must have alternative text",
  helpUrl: "https://dequeuniversity.com/rules/axe/4.13/image-alt",
  nodes: [{ target: ["img"] }],
};

describe("unexcused", () => {
  it("keeps every violation when nothing is excepted", () => {
    expect(unexcused([targetSize, imageAlt], [])).toEqual([targetSize, imageAlt]);
  });

  it("takes out a rule excepted everywhere, and of a rule excepted on some elements those only", () => {
    const exceptions: KnownException[] = [
      { rule: "image-alt", reason: "a test" },
      { rule: "target-size", target: /^\.masthead/, reason: "a test" },
    ];
    expect(unexcused([targetSize, imageAlt], exceptions)).toEqual([
      { ...targetSize, nodes: [{ target: [["iframe", "a.small"]] }] },
    ]);
  });

  it("matches an element inside a frame by its selectors joined", () => {
    const exceptions = [{ rule: "target-size", target: /^iframe a\.small$/, reason: "a test" }];
    expect(unexcused([targetSize], exceptions)).toEqual([
      { ...targetSize, nodes: [{ target: [".masthead > button"] }] },
    ]);
  });

  it("gives each known exception a reason", () => {
    for (const exception of KNOWN_EXCEPTIONS) expect(exception.reason).not.toBe("");
    expect(unexcused([imageAlt])).toEqual([imageAlt]);
  });
});

describe("violationLines", () => {
  it("says one line an element: its rule, the rule's impact, where it is and where to read about it", () => {
    expect(violationLines([targetSize, imageAlt])).toEqual([
      "target-size (serious) on .masthead > button: All touch targets must be 24px large, or leave sufficient space https://dequeuniversity.com/rules/axe/4.13/target-size",
      "target-size (serious) on iframe a.small: All touch targets must be 24px large, or leave sufficient space https://dequeuniversity.com/rules/axe/4.13/target-size",
      "image-alt (no impact given) on img: Images must have alternative text https://dequeuniversity.com/rules/axe/4.13/image-alt",
    ]);
  });
});
