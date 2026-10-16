// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { existsSync, readFileSync } from "node:fs";
import { join, matchesGlob } from "node:path";
import { describe, expect, it } from "vitest";
import { saysBreaking } from "./checkBreaking.ts";
import { ASSETS_DIR, archivePath } from "./docsArchive.ts";

/**
 * release.config.mjs agrees with the files it releases
 * (docs/releasing.md): a mismatch would show only when a release runs,
 * on main, after the change was merged.
 */

const ROOT = join(import.meta.dirname, "..");

type Plugin = [string, Record<string, unknown>];
type Config = {
  changelogTitle: string;
  parserOpts: Record<string, unknown>;
  assets: string[];
  docsArchive: { path: string; label: string };
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

  it("writes the version, then the docs' archive, with npm scripts that are there", () => {
    const command = options("@semantic-release/exec").prepareCmd as string;
    const scripts = (
      JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
        scripts: Record<string, string>;
      }
    ).scripts;
    // Each step only when the one before it passed, and each given the
    // version.
    const steps = command.split(" && ").map((step) => {
      const match = /^npm run (\S+) -- \$\{nextRelease\.version\}$/.exec(step);
      expect(match, step).not.toBeNull();
      return match![1]!;
    });
    expect(steps).toEqual(["release:version", "docs:archive"]);
    expect(scripts["release:version"]).toContain("scripts/releaseVersion.ts");
    expect(scripts["docs:archive"]).toContain("scripts/docsArchive.ts");
  });

  it("attaches the archive that npm run docs:archive writes, and nothing else", () => {
    const github = options("@semantic-release/github");
    expect(github.assets).toEqual([config.docsArchive]);
    const { path, label } = config.docsArchive;
    expect(matchesGlob(archivePath("2.2.0"), path)).toBe(true);
    expect(matchesGlob(archivePath("10.0.12"), path)).toBe(true);
    expect(matchesGlob(`${ASSETS_DIR}/notes-2.2.0.tar.gz`, path)).toBe(false);
    expect(matchesGlob(`${ASSETS_DIR}/docs-2.2.0.zip`, path)).toBe(false);
    // The plugin fills in the label, but not the path.
    expect(label.replaceAll("${nextRelease.version}", "2.2.0")).toBe("Documentation 2.2.0 (HTML)");
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

  async function notes(...commits: { hash: string; message: string }[]): Promise<string> {
    const { generateNotes } = (await import(notesGenerator)) as {
      generateNotes(config: unknown, context: unknown): Promise<string>;
    };
    return generateNotes(options(notesGenerator), {
      commits,
      lastRelease: { gitTag: "v1.0.0" },
      nextRelease: { gitTag: "v1.1.0", version: "1.1.0" },
      options: { repositoryUrl: "git@github.com:solid-memo/website.git" },
      cwd: ROOT,
      logger,
    });
  }

  // The body of 4e18c227, which released 2.0.0 though it breaks nothing
  // (#84): a line of it begins "breaking change", in lowercase, with no
  // colon.
  const declareTheApi = [
    "docs(releasing): declare the public API that the version promises",
    "",
    "A published shape is now never edited, with no exception for an optional",
    "term. A term that a shape gains goes into its next version, which is a",
    "breaking change of the app. One rule, with no judgment of what an older",
    "reader loses, can be checked.",
    "",
    "Refs: #72",
  ].join("\n");

  it("tells a breaking change only by `!` or its footer as written", async () => {
    expect(await bump(declareTheApi)).toBeNull();
    expect(await bump("fix: a bug\n\nBreaking change: an older app refuses it.")).toBe("patch");
    expect(await bump("fix: a bug\n\nBREAKING CHANGE an older app refuses it.")).toBe("patch");
    expect(await bump("fix: a bug\n\nBREAKING-CHANGE: an older app refuses it.")).toBe("major");
    expect(await bump("feat(ns)!: write deck format 8")).toBe("major");
  });

  it("agrees with npm run check:breaking on what breaks", async () => {
    const messages = [
      declareTheApi,
      "fix: a bug\n\nBreaking change: an older app refuses it.",
      "fix: a bug\n\nBREAKING CHANGE an older app refuses it.",
      "feat: write deck format 8\n\nBREAKING CHANGE: an older app refuses it.",
      "fix: a bug\n\nBREAKING-CHANGE: an older app refuses it.",
      "feat(ns)!: write deck format 8",
    ];
    for (const message of messages) {
      expect((await bump(message)) === "major", message).toBe(saysBreaking(message));
    }
  });

  it("gives both plugins the same way to find the footer", () => {
    expect(options(analyzer).parserOpts).toBe(config.parserOpts);
    expect(options(notesGenerator).parserOpts).toBe(config.parserOpts);
  });

  it("lists under BREAKING CHANGES only a footer as written", async () => {
    expect(await notes({ hash: "c".repeat(40), message: declareTheApi })).not.toContain(
      "BREAKING CHANGES",
    );
    const breaking = await notes({
      hash: "d".repeat(40),
      message: "feat(ns)!: write deck format 8\n\nBREAKING CHANGE: an older app refuses it.",
    });
    expect(breaking).toContain("BREAKING CHANGES");
    expect(breaking).toContain("an older app refuses it.");
  });

  it("writes notes with a section per kind, linking each commit", async () => {
    const hash = "a".repeat(40);
    const written = await notes(
      { hash, message: "feat(studio): check a draft's links\n\nWhy.\n\nRefs: #42" },
      { hash: "b".repeat(40), message: "docs: say why" },
    );
    expect(written).toContain(
      "## [1.1.0](https://github.com/solid-memo/website/compare/v1.0.0...v1.1.0)",
    );
    expect(written).toContain("### Features");
    expect(written).toContain(
      `* **studio:** check a draft's links ([aaaaaaa](https://github.com/solid-memo/website/commit/${hash}))`,
    );
    expect(written).not.toContain("say why");
  });
});
