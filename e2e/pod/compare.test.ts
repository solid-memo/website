// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { compare, keyOf, pageOf, summary, type Results } from "./compare.ts";

const results: Results = {
  testResults: [
    {
      name: "/repo/e2e/pod/src/digest.integration.test.ts",
      status: "failed",
      assertionResults: [
        {
          ancestorTitles: ["the instance digest on Server 1.0.0"],
          title: "keeps",
          status: "passed",
        },
        {
          ancestorTitles: ["the instance digest on Server 1.0.0"],
          title: "counts",
          status: "failed",
        },
        {
          ancestorTitles: ["the instance digest on Server 1.0.0"],
          title: "learns",
          status: "failed",
        },
        {
          ancestorTitles: ["the instance digest on Server 1.0.0"],
          title: "skips",
          status: "skipped",
        },
        {
          ancestorTitles: ["the instance digest on Server 1.0.0", "inner"],
          title: "mends",
          status: "passed",
        },
      ],
    },
  ],
};

describe("keyOf", () => {
  it("names a test by its file and titles, without the server's", () => {
    expect(
      keyOf("/a/b/digest.integration.test.ts", ["the digest on Server 2.0.0", "inner"], "keeps"),
    ).toBe("digest.integration.test.ts > inner > keeps");
  });
});

describe("compare", () => {
  it("sorts each test by what it did and whether it is expected to fail", () => {
    const expected = {
      "digest.integration.test.ts > counts": "why",
      "digest.integration.test.ts > inner > mends": "why",
    };
    expect(compare(results, expected)).toEqual({
      passed: ["digest.integration.test.ts > keeps"],
      skipped: ["digest.integration.test.ts > skips"],
      known: ["digest.integration.test.ts > counts"],
      failed: ["digest.integration.test.ts > learns"],
      fixed: ["digest.integration.test.ts > inner > mends"],
    });
  });
});

describe("a file that failed around its tests", () => {
  it("is a failure, though its tests only skipped", () => {
    const skippedAll: Results = {
      testResults: [
        {
          name: "/a/deck.integration.test.ts",
          status: "failed",
          assertionResults: [{ ancestorTitles: ["on S"], title: "t", status: "skipped" }],
        },
      ],
    };
    expect(compare(skippedAll, {}).failed).toEqual([
      "deck.integration.test.ts > (the file, around its tests)",
    ]);
    expect(
      compare(skippedAll, { "deck.integration.test.ts > (the file, around its tests)": "why" })
        .known,
    ).toHaveLength(1);
  });
});

describe("summary", () => {
  it("says what failed anew, what to take off the list, and the rest by cause", () => {
    const expected = {
      "digest.integration.test.ts > counts": "srv-no-etag",
      "digest.integration.test.ts > inner > mends": "srv-broken",
    };
    const text = summary("srv", compare(results, expected), expected, "p.md");
    expect(text).toContain("### srv: new failures");
    expect(text).toContain(
      "1 passed, 1 skipped, 1 failed as expected, 1 failed anew, 1 passed though listed.",
    );
    expect(text).toContain("- digest.integration.test.ts > learns\n");
    expect(text).toContain("take them off expected-failures.json");
    expect(text).toContain(
      "- [srv-no-etag](p.md#srv-no-etag): 1 test\n  - digest.integration.test.ts > counts\n",
    );
  });

  it("lists the tests of one cause together, and counts them", () => {
    const file = (title: string) => ({ ancestorTitles: ["on S"], title, status: "failed" });
    const run: Results = {
      testResults: [
        {
          name: "/a/x.test.ts",
          status: "failed",
          assertionResults: [file("a"), file("b"), file("c")],
        },
      ],
    };
    const expected = { "x.test.ts > a": "one", "x.test.ts > b": "two", "x.test.ts > c": "one" };
    expect(summary("srv", compare(run, expected), expected, "p.md")).toContain(
      "- [one](p.md#one): 2 tests\n  - x.test.ts > a\n  - x.test.ts > c\n- [two](p.md#two): 1 test\n",
    );
  });

  it("says a run went as expected when nothing failed anew", () => {
    const text = summary("srv", compare({ testResults: [] }, {}), {}, "p.md");
    expect(text).toContain("### srv: as expected");
    expect(text).not.toContain("by cause");
  });
});

describe("pageOf", () => {
  it("links the page at the run's commit on CI", () => {
    expect(
      pageOf({
        GITHUB_SERVER_URL: "https://github.com",
        GITHUB_REPOSITORY: "o/r",
        GITHUB_SHA: "abc",
      }),
    ).toBe("https://github.com/o/r/blob/abc/docs/interop.md");
  });

  it("names its path elsewhere", () => {
    expect(pageOf({})).toBe("docs/interop.md");
  });
});
