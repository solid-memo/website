import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VOCAB_ROOT } from "./root.ts";

const execFileSync = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ execFileSync }));

const { appVersion, commitSha, shapesRuleset, siteDefines } = await import("./siteBuild.ts");

afterEach(() => {
  vi.unstubAllEnvs();
  execFileSync.mockReset();
});

describe("commitSha", () => {
  it("is the checkout's HEAD", () => {
    execFileSync.mockReturnValue("abc123\n");
    expect(commitSha()).toBe("abc123");
    expect(execFileSync).toHaveBeenCalledWith("git", ["rev-parse", "HEAD"], expect.anything());
  });

  it("is GITHUB_SHA outside a git checkout, else unknown", () => {
    execFileSync.mockImplementation(() => {
      throw new Error("not a git repository");
    });
    vi.stubEnv("GITHUB_SHA", "def456");
    expect(commitSha()).toBe("def456");
    vi.stubEnv("GITHUB_SHA", undefined);
    expect(commitSha()).toBeNull();
  });
});

describe("shapesRuleset", () => {
  it("is a short hash of the shapes and the vendored profiles, the same each time", () => {
    expect(shapesRuleset()).toMatch(/^[0-9a-f]{16}$/);
    expect(shapesRuleset()).toBe(shapesRuleset());
  });
});

describe("appVersion", () => {
  it("is the repository's version, from its root package.json", () => {
    expect(appVersion()).toBe(JSON.parse(readFileSync(join(VOCAB_ROOT, "../../package.json"), "utf8")).version);
    expect(appVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe("siteDefines", () => {
  it("gives the apps all three as code", () => {
    execFileSync.mockReturnValue("abc123\n");
    expect(siteDefines()).toEqual({
      __APP_VERSION__: JSON.stringify(appVersion()),
      __COMMIT_SHA__: '"abc123"',
      __SHAPES_RULESET__: JSON.stringify(shapesRuleset()),
    });
  });
});
