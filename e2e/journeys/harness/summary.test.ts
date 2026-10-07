import { describe, expect, it } from "vitest";
import { failingStepPath, summarize, type Report } from "./summary.ts";

const failing: Report = {
  stats: { expected: 1, unexpected: 1, flaky: 0, skipped: 0, duration: 61_500 },
  suites: [
    {
      specs: [{ title: "smoke", file: "smoke.journey.ts", tests: [{ results: [{ status: "passed", duration: 1 }] }] }],
      suites: [
        {
          specs: [
            {
              title: "a learner's full journey",
              file: "full-learner.journey.ts",
              tests: [
                {
                  annotations: [{ type: "webId", description: "https://127.0.0.1:1/j/profile/card#me" }, { type: "note" }],
                  results: [
                    {
                      status: "failed",
                      duration: 60_000,
                      errors: [{ message: "\u001b[31mError: expect(locator).toHaveText()\u001b[39m\nExpected: 4" }],
                      steps: [
                        { title: "01 · Visit Solid Memo" },
                        { title: "15 · Check the statistics", error: {}, steps: [{ title: "Open Statistics" }, { title: "Check the tiles", error: {} }] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe("failingStepPath", () => {
  it("follows the failed steps down to the innermost", () => {
    expect(failingStepPath(failing.suites![0]!.suites![0]!.specs![0]!.tests[0]!.results[0]!.steps)).toEqual([
      "15 · Check the statistics",
      "Check the tiles",
    ]);
  });

  it("is empty when no step failed", () => {
    expect(failingStepPath([{ title: "a" }])).toEqual([]);
    expect(failingStepPath(undefined)).toEqual([]);
  });
});

describe("summarize", () => {
  it("names each failed journey, the step it failed in, its error without colours, and how to replay it", () => {
    const markdown = summarize(failing, "journeys-1");
    expect(markdown).toContain("1 passed, 1 failed, 0 flaky, 0 skipped in 62s.");
    expect(markdown).toContain("### ✗ a learner's full journey (full-learner.journey.ts)");
    expect(markdown).toContain("**Failed in:** 15 · Check the statistics › Check the tiles");
    expect(markdown).toContain("webId: `https://127.0.0.1:1/j/profile/card#me`");
    expect(markdown).toContain("Error: expect(locator).toHaveText()\nExpected: 4");
    expect(markdown).not.toContain("\u001b");
    expect(markdown).toContain("**journeys-1** artifact");
    expect(markdown).not.toContain("smoke");
  });

  it("says so when every journey passed", () => {
    expect(summarize({ suites: [] }, "x")).toBe("## User journeys\n\nEvery journey passed.\n");
  });

  it("says when a failure was outside any step", () => {
    const report: Report = { suites: [{ specs: [{ title: "t", file: "f", tests: [{ results: [{ status: "timedOut", duration: 1 }] }] }] }] };
    expect(summarize(report, "x")).toContain("**Failed in:** (outside any step)");
  });
});
