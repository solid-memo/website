// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { compare, pageOf, type Results, summary } from "./compare.ts";

const results: Results = {
  suites: [
    {
      title: "smoke.journey.ts",
      specs: [
        { title: "logs in", file: "smoke.journey.ts", tests: [{ status: "expected" }] },
        { title: "studies", file: "smoke.journey.ts", tests: [{ status: "unexpected" }] },
        { title: "imports", file: "smoke.journey.ts", tests: [{ status: "unexpected" }] },
        { title: "waits", file: "smoke.journey.ts", tests: [{ status: "skipped" }] },
      ],
      suites: [
        {
          title: "a course",
          specs: [
            { title: "plays", file: "smoke.journey.ts", tests: [{ status: "flaky" }] },
            { title: "publishes", file: "smoke.journey.ts", tests: [{ status: "expected" }] },
          ],
        },
      ],
    },
  ],
};

describe("compare", () => {
  it("names each journey by its file, its describe blocks and its title, and sorts it by what it did", () => {
    const expected = {
      "smoke.journey.ts > studies": "why",
      "smoke.journey.ts > a course > publishes": "why",
    };
    expect(compare(results, expected)).toEqual({
      passed: ["smoke.journey.ts > logs in", "smoke.journey.ts > a course > plays"],
      skipped: ["smoke.journey.ts > waits"],
      known: ["smoke.journey.ts > studies"],
      failed: ["smoke.journey.ts > imports"],
      fixed: ["smoke.journey.ts > a course > publishes"],
    });
  });

  it("fails a run with an error outside any journey, as its list may expect", () => {
    const run = { ...results, errors: [{ message: "teardown threw" }] };
    expect(compare(run, {}).failed).toEqual([
      "smoke.journey.ts > studies",
      "smoke.journey.ts > imports",
      "(outside any journey)",
    ]);
    expect(compare(run, { "(outside any journey)": "why" }).known).toEqual([
      "(outside any journey)",
    ]);
  });

  it("finds no journeys in a report without suites", () => {
    expect(compare({}, {})).toEqual({ passed: [], skipped: [], known: [], failed: [], fixed: [] });
  });
});

describe("summary", () => {
  it("says what failed anew, what passes though listed, and each expected failure under its cause", () => {
    const expected = {
      "a.journey.ts > one": "lws-x",
      "a.journey.ts > two": "lws-x",
      "a.journey.ts > three": "lws-y",
      "a.journey.ts > four": "lws-y",
    };
    const text = summary(
      "css-lws-only",
      {
        passed: ["a.journey.ts > five"],
        skipped: [],
        known: ["a.journey.ts > one", "a.journey.ts > two", "a.journey.ts > three"],
        failed: ["a.journey.ts > six"],
        fixed: ["a.journey.ts > four"],
      },
      expected,
      "docs/interop.md",
    );
    expect(text).toBe(
      [
        "### Journeys on css-lws-only: new failures",
        "",
        "1 passed, 0 skipped, 3 failed as expected, 1 failed anew, 1 passed though listed.",
        "",
        "**Failed anew**",
        "",
        "- a.journey.ts > six",
        "",
        "**Passed though listed (take them off expected-failures.json)**",
        "",
        "- a.journey.ts > four",
        "",
        "**Failed as expected, by cause ([interop.md](docs/interop.md))**",
        "",
        "- [lws-x](docs/interop.md#lws-x): 2 journeys",
        "  - a.journey.ts > one",
        "  - a.journey.ts > two",
        "- [lws-y](docs/interop.md#lws-y): 1 journey",
        "  - a.journey.ts > three",
        "",
      ].join("\n"),
    );
  });

  it("says a run with nothing unexpected went as expected", () => {
    expect(
      summary(
        "css-lws",
        { passed: ["a.journey.ts > one"], skipped: [], known: [], failed: [], fixed: [] },
        {},
        "docs/interop.md",
      ),
    ).toBe(
      "### Journeys on css-lws: as expected\n\n1 passed, 0 skipped, 0 failed as expected, 0 failed anew, 0 passed though listed.\n",
    );
  });
});

describe("pageOf", () => {
  it("links the page at the run's commit on CI", () => {
    expect(
      pageOf({
        GITHUB_SERVER_URL: "https://github.com",
        GITHUB_REPOSITORY: "solid-memo/website",
        GITHUB_SHA: "abc",
      }),
    ).toBe("https://github.com/solid-memo/website/blob/abc/docs/interop.md");
  });

  it("names the page's path elsewhere", () => {
    expect(pageOf({})).toBe("docs/interop.md");
  });
});
