// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * release.config.mjs agrees with the files it releases
 * (docs/releasing.md): a mismatch would show only when a release runs,
 * on main, after the change was merged.
 */

const ROOT = join(import.meta.dirname, "..");

type Plugin = [string, Record<string, unknown>];
type Config = {
  changelogTitle: string;
  assets: string[];
  default: { branches: string[]; plugins: Plugin[] };
};

const config = (await import(new URL("../release.config.mjs", import.meta.url).href)) as Config;

function options(name: string): Record<string, unknown> {
  const plugin = config.default.plugins.find(([plugin]) => plugin === name);
  if (plugin === undefined) throw new Error(`${name} is not in release.config.mjs`);
  return plugin[1];
}

describe("release.config.mjs", () => {
  it("releases from main only", () => {
    expect(config.default.branches).toEqual(["main"]);
  });

  it("finds CHANGELOG.md's header where it writes the notes under it", () => {
    const changelog = readFileSync(join(ROOT, "CHANGELOG.md"), "utf8");
    expect(options("@semantic-release/changelog").changelogTitle).toBe(config.changelogTitle);
    expect(changelog.startsWith(config.changelogTitle)).toBe(true);
    // The first version's summary, below the generated entries, turns the
    // linters back on.
    const rest = changelog.slice(config.changelogTitle.length);
    expect(rest).toMatch(/<!-- markdownlint-enable -->\n<!-- cspell:enable -->\n/);
  });

  it("commits every file the release writes, and they are all there", () => {
    expect(options("@semantic-release/git").assets).toEqual(config.assets);
    for (const asset of config.assets) expect(existsSync(join(ROOT, asset))).toBe(true);
  });

  it("does not skip CI on the release commit, so the deploy shows its version", () => {
    expect(options("@semantic-release/git").message).not.toMatch(/skip ci|ci skip/i);
  });

  it("runs an npm script that is there", () => {
    const command = options("@semantic-release/exec").prepareCmd as string;
    const script = /^npm run (\S+) -- /.exec(command)?.[1];
    const scripts = (
      JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
        scripts: Record<string, string>;
      }
    ).scripts;
    expect(script).toBe("release:version");
    expect(scripts[script!]).toContain("scripts/releaseVersion.ts");
  });

  it("publishes nothing to npm", () => {
    expect(options("@semantic-release/npm").npmPublish).toBe(false);
  });
});

/**
 * The plugins that read the commits, run with release.config.mjs's
 * options on commits like this project's: the preset must load, and be
 * one the plugins' changelog writer can render (a newer major of
 * conventional-changelog-conventionalcommits needs a newer writer than
 * semantic-release ships, and fails only when a release runs).
 */
describe("the commits, as the release reads them", () => {
  // Untyped modules: imported by a name TypeScript does not resolve.
  const analyzer = "@semantic-release/commit-analyzer";
  const notesGenerator = "@semantic-release/release-notes-generator";
  const logger = { log: () => {}, warn: () => {}, error: () => {}, success: () => {} };

  async function bump(...messages: string[]): Promise<string | null> {
    const { analyzeCommits } = (await import(analyzer)) as {
      analyzeCommits(config: unknown, context: unknown): Promise<string | null>;
    };
    return analyzeCommits(options(analyzer), {
      commits: messages.map((message, i) => ({ hash: `${i}`.padStart(40, "0"), message })),
      cwd: ROOT,
      logger,
    });
  }

  it("bumps by the largest change among them", async () => {
    expect(await bump("docs: say why", "test: cover it", "chore(deps): update biome")).toBeNull();
    expect(await bump("Add a deck, before Conventional Commits")).toBeNull();
    expect(await bump("docs: say why", "fix(deps): update dependency n3 to v2")).toBe("patch");
    expect(await bump("revert: take back the deck filter")).toBe("patch");
    expect(await bump('Revert "feat: x"\n\nThis reverts commit abcdef1.')).toBe("patch");
    expect(await bump("fix: a bug", "feat(decks): add the Vim commands")).toBe("minor");
    expect(await bump("feat(ns)!: write deck format 8")).toBe("major");
    expect(
      await bump("feat: write deck format 8\n\nBREAKING CHANGE: an older app refuses it."),
    ).toBe("major");
  });

  it("writes notes with a section per kind, linking each commit", async () => {
    const { generateNotes } = (await import(notesGenerator)) as {
      generateNotes(config: unknown, context: unknown): Promise<string>;
    };
    const hash = "a".repeat(40);
    const notes = await generateNotes(options(notesGenerator), {
      commits: [
        { hash, message: "feat(studio): check a draft's links\n\nWhy.\n\nRefs: #42" },
        { hash: "b".repeat(40), message: "docs: say why" },
      ],
      lastRelease: { gitTag: "v1.0.0" },
      nextRelease: { gitTag: "v1.1.0", version: "1.1.0" },
      options: { repositoryUrl: "git@github.com:solid-memo/website.git" },
      cwd: ROOT,
      logger,
    });
    expect(notes).toContain(
      "## [1.1.0](https://github.com/solid-memo/website/compare/v1.0.0...v1.1.0)",
    );
    expect(notes).toContain("### Features");
    expect(notes).toContain(
      `* **studio:** check a draft's links ([aaaaaaa](https://github.com/solid-memo/website/commit/${hash}))`,
    );
    expect(notes).not.toContain("say why");
  });
});
