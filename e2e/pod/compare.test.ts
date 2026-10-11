import { describe, expect, it } from "vitest";
import { compare, keyOf, summary, type Results } from "./compare.ts";

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
  it("says what failed anew, what to take off the list, and why the rest fail", () => {
    const expected = {
      "digest.integration.test.ts > counts": "no ETag",
      "digest.integration.test.ts > inner > mends": "was broken",
    };
    const text = summary("srv", compare(results, expected), expected);
    expect(text).toContain("### srv: new failures");
    expect(text).toContain(
      "1 passed, 1 skipped, 1 failed as expected, 1 failed anew, 1 passed though listed.",
    );
    expect(text).toContain("- digest.integration.test.ts > learns\n");
    expect(text).toContain("- digest.integration.test.ts > counts: no ETag");
    expect(text).toContain("take them off expected-failures.json");
  });

  it("says a run went as expected when nothing failed anew", () => {
    expect(summary("srv", compare({ testResults: [] }, {}), {})).toContain("### srv: as expected");
  });
});
