import { describe, expect, it, vi } from "vitest";
import { defaultIo, docsIndexProblems, listedPages, main, run } from "./checkDocs.ts";

const INDEX = `# Docs

Start with [architecture.md](architecture.md).

- [testing.md](testing.md#commands) — the tests.
- [boundaries.md](boundaries.md) — the rules, as [checkBoundaries.ts](../scripts/checkBoundaries.ts) and the [root README](../README.md) say.
- [Turbo](https://turbo.build/docs/README.md) — not a page.
`;

describe("listedPages", () => {
  it("finds the pages beside the index, with or without a heading", () => {
    expect([...listedPages(INDEX)].sort()).toEqual(["architecture.md", "boundaries.md", "testing.md"]);
  });
});

describe("docsIndexProblems", () => {
  it("passes when every page is listed, the index itself aside", () => {
    expect(docsIndexProblems(["README.md", "architecture.md", "boundaries.md", "testing.md"], INDEX)).toEqual([]);
  });

  it("names a page the index does not list, and a page it lists that is gone", () => {
    expect(docsIndexProblems(["README.md", "architecture.md", "testing.md", "privacy.md"], INDEX)).toEqual([
      "docs/privacy.md: not listed in docs/README.md; add a line for it there.",
      "docs/README.md lists boundaries.md, which is not in docs/.",
    ]);
  });
});

describe("main", () => {
  function fakeIo(pages: string[]) {
    const logs: string[] = [];
    return { logs, pages: () => pages, index: () => INDEX, log: (message: string) => logs.push(message) };
  }

  it("says so and returns 0 when the index is whole", () => {
    const io = fakeIo(["README.md", "architecture.md", "boundaries.md", "testing.md"]);
    expect(main(io)).toBe(0);
    expect(io.logs).toEqual(["docs/README.md lists every page in docs/."]);
  });

  it("logs each problem and returns 1", () => {
    const io = fakeIo(["README.md", "architecture.md", "boundaries.md", "testing.md", "privacy.md"]);
    expect(main(io)).toBe(1);
    expect(io.logs).toEqual(["docs/privacy.md: not listed in docs/README.md; add a line for it there."]);
  });
});

describe("the repository's docs", () => {
  it("are all listed", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const process = { exitCode: undefined as number | string | null | undefined };
    run(process);
    expect(process.exitCode).toBe(0);
    expect(log).toHaveBeenCalledWith("docs/README.md lists every page in docs/.");
    log.mockRestore();
  });

  it("are read from docs/", () => {
    const io = defaultIo(`${import.meta.dirname}/..`);
    expect(io.pages()).toContain("README.md");
    expect(io.index()).toContain("# Docs");
  });
});
