// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { defaultIo, saysBreaking } from "./checkBreaking.ts";
import releaseWithoutMerges from "./releaseWithoutMerges.ts";
import { main as releaseCommit, defaultIo as releaseCommitIo } from "./releaseCommit.ts";

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
  default: { branches: string[]; plugins: Plugin[] };
};

const config = (await import(new URL("../release.config.mjs", import.meta.url).href)) as Config;
const { SKIP_KEYWORD } = (await import(
  new URL("../commitlint.config.mjs", import.meta.url).href
)) as { SKIP_KEYWORD: RegExp };

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

  it("titles the release commit with its version alone, which GitHub skips no CI for", () => {
    expect(options("@semantic-release/git").message).toBe("chore(release): ${nextRelease.version}");
  });

  it("writes the version, then the docs' archive, with npm scripts that are there", () => {
    const command = options("@semantic-release/exec").prepareCmd as string;
    const scripts = (
      JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
        scripts: Record<string, string>;
      }
    ).scripts;
    // Each step only when the one before it passed, and each given the
    // version; the archive with --drawn, as the job that runs it starts
    // no browser: the draw job drew the diagrams.
    const steps = command.split(" && ").map((step) => {
      const match = /^npm run (\S+) -- \$\{nextRelease\.version\}( --drawn)?$/.exec(step);
      expect(match, step).not.toBeNull();
      return `${match![1]!}${match![2] ?? ""}`;
    });
    expect(steps).toEqual(["release:version", "docs:archive --drawn"]);
    expect(scripts["release:version"]).toContain("scripts/releaseVersion.ts");
    expect(scripts["docs:archive"]).toContain("scripts/docsArchive.ts");
  });

  // release.yml's publish job makes it, with no package loaded
  // (docs/releasing.md#the-deploy-key): semantic-release runs with no
  // token that could.
  it("makes no GitHub release", () => {
    const names = config.default.plugins.map(([name]) => name);
    expect(names).not.toContain("@semantic-release/github");
    expect(names).toEqual([
      "./scripts/releaseWithoutMerges.ts",
      "@semantic-release/changelog",
      "@semantic-release/npm",
      "@semantic-release/exec",
      "@semantic-release/git",
    ]);
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
  // The plugin that wraps both, given their options (scripts/releaseWithoutMerges.ts).
  const wrapper = "./scripts/releaseWithoutMerges.ts";
  const logger = { log: () => {}, warn: () => {}, error: () => {}, success: () => {} };

  async function bump(...messages: string[]): Promise<string | null> {
    const { analyzeCommits } = (await import(analyzer)) as {
      analyzeCommits(config: unknown, context: unknown): Promise<string | null>;
    };
    return analyzeCommits(options(wrapper), {
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
    expect(await bump("revert(app)!: take back the deck filter")).toBe("major");
    expect(await bump("revert: x\n\nBREAKING CHANGE: an older app refuses it.")).toBe("major");
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
    return generateNotes(options(wrapper), {
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
      "feat(ns)!:write deck format 8",
      "revert: take back the deck filter",
      "revert(app)!: take back the deck filter",
      "revert: x\n\nBREAKING CHANGE: an older app refuses it.",
      "feat: write deck format 8\r\n\r\nBREAKING CHANGE: an older app refuses it.",
      // A footer or a header after a character that the release does not
      // end a line at.
      ...["\u2028", "\u2029", "\u0085", "\r", "\x1e\x1f"].flatMap((between) => [
        `feat(app): change the deck page\n\nIt changes.${between}BREAKING CHANGE: x\n\nCloses: #12`,
        `feat(app): change the deck page\n\nIt changes.${between}feat!: x\n\nCloses: #12`,
      ]),
    ];
    for (const message of messages) {
      expect((await bump(message)) === "major", JSON.stringify(message)).toBe(
        saysBreaking(message),
      );
    }
  });

  // A revert takes a commit out of the release only when its change
  // undoes it (scripts/reverts.ts), and check:breaking reads the range
  // the same way, so a breaking commit counts in both or in neither.
  it("agrees with npm run check:breaking on a revert of a breaking commit", async () => {
    const breaking = "feat(api)!: drop the old deck address\n\nBREAKING CHANGE: old links break.";
    for (const genuine of [true, false]) {
      const cwd = mkdtempSync(join(tmpdir(), "release-"));
      const git = (...args: string[]) =>
        execFileSync(
          "git",
          [
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@example.org",
            "-c",
            "commit.gpgsign=false",
            ...args,
          ],
          { cwd, encoding: "utf8" },
        ).trim();
      try {
        git("init", "-q", "-b", "main");
        writeFileSync(join(cwd, "a"), "1");
        git("add", "a");
        git("commit", "-qm", "chore: start");
        const base = git("rev-parse", "HEAD");
        writeFileSync(join(cwd, "a"), "2");
        git("commit", "-qam", breaking);
        const named = git("rev-parse", "HEAD");
        if (genuine) git("revert", "--no-edit", "HEAD");
        else {
          const revert = `Revert "feat(api)!: drop the old deck address"\n\nThis reverts commit ${named}.`;
          git("commit", "-q", "--allow-empty", "-m", revert);
        }
        const commits = defaultIo(cwd).commitsSince(base);
        const release = await releaseWithoutMerges.analyzeCommits(options(wrapper), {
          commits: git("rev-list", `${base}..HEAD`)
            .split("\n")
            .map((hash) => ({ hash, message: git("log", "-1", "--format=%B", hash) })),
          cwd,
          logger,
          lastRelease: { gitHead: base },
        });
        expect(release === "major", `genuine: ${genuine}`).toBe(!genuine);
        expect(commits.some(({ message }) => saysBreaking(message))).toBe(!genuine);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    }
  });

  it("runs both plugins only through the wrapper, which finds the footer one way", () => {
    expect(options(wrapper).parserOpts).toBe(config.parserOpts);
    const names = config.default.plugins.map(([name]) => name);
    expect(names).not.toContain(analyzer);
    expect(names).not.toContain(notesGenerator);
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

  it('heads fixes "Fixes" and keeps the other sections', async () => {
    const written = await notes(
      { hash: "a".repeat(40), message: "fix(studio): keep a draft's title\n\nWhy." },
      { hash: "b".repeat(40), message: "perf(solid): read a deck once\n\nWhy." },
      { hash: "c".repeat(40), message: "ci: cache the images\n\nWhy." },
    );
    expect(written).toContain("### Fixes");
    expect(written).not.toContain("Bug Fixes");
    expect(written).toContain("### Performance Improvements");
    expect(written).not.toContain("cache the images");
  });

  // The release commit's message, as @semantic-release/git fills in its
  // template: GitHub skips CI on a push whose message holds a skip
  // keyword anywhere, and the deploy runs only after CI on it.
  it("writes a release commit message without the skip keywords the notes copy", async () => {
    const written = await notes({
      hash: "f".repeat(40),
      message: `fix(web): tidy the deck list [skip ci]\n\nThe list reads better.\n\nCloses: #1`,
    });
    expect(written).toMatch(SKIP_KEYWORD);
    const template = options("@semantic-release/git").message as string;
    const message = template
      .replaceAll("${nextRelease.version}", "1.1.0")
      .replaceAll("${nextRelease.notes}", written);
    expect(message).toBe("chore(release): 1.1.0");
    expect(message).not.toMatch(SKIP_KEYWORD);
  });

  // A line such as `-notes-` named a field to the parser, which put the
  // lines after it there: notes and references as text, which stopped
  // both plugins, and revert and type, which changed the version chosen.
  // commitlint reads it as text, and so does the release.
  it("reads a line that looks like a field as text, as commitlint does", async () => {
    const withField = (subject: string, field: string) =>
      `${subject}\n\nWhy this is.\n\n-${field}-\nanything\n\nRefs: #42`;
    const plain = (subject: string) => `${subject}\n\nWhy this is.\n\nRefs: #42`;
    const fields = ["notes", "references", "revert", "type", "mentions", "header"];
    const subjects = ["fix(app): keep the title", "feat: add a deck", "docs: say why"];
    const hash = "a".repeat(40);
    for (const subject of subjects) {
      const expected = await bump(plain(subject));
      const expectedNotes = await notes({ hash, message: plain(subject) });
      for (const field of fields) {
        const message = withField(subject, field);
        expect(await bump(message), message).toBe(expected);
        expect(await notes({ hash, message }), message).toBe(expectedNotes);
      }
    }
  });

  // Like the body of a4d7b99, which 5.2.0's notes say closes #9ba6b2 and
  // #aab4bf: the parser's own prefix takes `#` and any word after it.
  it("links only `#` and a number as an issue, not a CSS color", async () => {
    const written = await notes({
      hash: "e".repeat(40),
      message: [
        "fix(ui): raise Standard's dark muted text to 4.5:1 on a hovered grade",
        "",
        "Standard's dark #9ba6b2 measured 4.29:1; #aab4bf holds it at 4.70:1,",
        "as #rrggbb, see #216.",
        "",
        "Refs: #216",
      ].join("\n"),
    });
    expect(written).toContain("[#216](https://github.com/solid-memo/website/issues/216)");
    for (const color of ["9ba6b2", "aab4bf", "rrggbb"]) expect(written).not.toContain(color);
  });
});

/**
 * The prepare job's release (release.yml, docs/releasing.md#the-deploy-key):
 * semantic-release with release.config.mjs's plugins, in a checkout whose
 * repository URL is GitHub's, which git's url.<copy>.insteadOf points at
 * a bare copy, with https refused. It commits and tags the release in the
 * copy, with notes that link to GitHub; and the push job's check
 * (npm run release:commit -- next) passes the commit, fetched from a
 * bundle into a checkout of main's tip. The docs' archive is left out:
 * the files a release writes are the repository's own, but for a
 * package.json and a lockfile of one package.
 */
describe("a release in the prepare job, into a bare copy", () => {
  const URL_ = "https://github.com/solid-memo/website.git";
  const bot = "github-actions[bot]";
  const botEmail = "41898282+github-actions[bot]@users.noreply.github.com";

  it("commits and tags in the copy alone, and the push job's check passes the commit", () => {
    const dir = mkdtempSync(join(tmpdir(), "release-prepare-"));
    const work = join(dir, "work");
    const copy = join(dir, "copy.git");
    const target = join(dir, "target");
    const git = (cwd: string, ...args: string[]) =>
      execFileSync("git", ["-C", cwd, ...args], {
        encoding: "utf8",
        env: { ...process.env, HOME: dir, GIT_CONFIG_NOSYSTEM: "1" },
      }).trim();
    try {
      git(dir, "init", "-q", "-b", "main", work);
      git(work, "config", "user.name", "Test");
      git(work, "config", "user.email", "test@example.org");
      git(work, "config", "commit.gpgsign", "false");
      git(work, "config", "tag.gpgsign", "false");
      for (const file of ["CHANGELOG.md", "publiccode.yml", "CITATION.cff"]) {
        writeFileSync(join(work, file), readFileSync(join(ROOT, file)));
      }
      writeFileSync(
        join(work, "package.json"),
        '{\n  "name": "x",\n  "version": "1.0.0",\n  "private": true\n}\n',
      );
      writeFileSync(
        join(work, "package-lock.json"),
        '{\n  "name": "x",\n  "version": "1.0.0",\n  "lockfileVersion": 3,\n  "requires": true,\n  "packages": {\n    "": {\n      "name": "x",\n      "version": "1.0.0"\n    }\n  }\n}\n',
      );
      writeFileSync(join(work, ".gitignore"), "release.config.mjs\nversion.mjs\n");
      git(work, "add", ".");
      git(work, "commit", "-q", "-m", "feat: start");
      git(work, "tag", "v1.0.0");
      writeFileSync(join(work, "app.txt"), "kept\n");
      git(work, "add", ".");
      git(work, "commit", "-q", "-m", "fix(app): keep the title\n\nWhy.\n\nRefs: #1");
      const tip = git(work, "rev-parse", "HEAD");
      git(dir, "clone", "-q", work, target);

      // release.config.mjs as it is, but for paths from the repository,
      // and a prepare step that writes the version alone.
      const root = pathToFileURL(`${ROOT}/`).href;
      writeFileSync(
        join(work, "version.mjs"),
        `const m = await import(${JSON.stringify(`${root}scripts/releaseVersion.ts`)});\nprocess.exitCode = m.main(["node", process.argv[2]], m.defaultIo(process.cwd()));\n`,
      );
      writeFileSync(
        join(work, "release.config.mjs"),
        `import config from ${JSON.stringify(`${root}release.config.mjs`)};
export default {
  ...config,
  plugins: config.plugins.map(([name, options]) =>
    name.startsWith("./") ? [${JSON.stringify(ROOT)} + name.slice(1), options]
    : name === "@semantic-release/exec" ? [name, { prepareCmd: "node version.mjs \${nextRelease.version}" }]
    : [name, options]),
};
`,
      );

      // As the prepare job's step does it.
      git(dir, "clone", "-q", "--bare", work, copy);
      git(work, "config", `url.file://${copy}.insteadOf`, URL_);
      git(work, "config", "protocol.https.allow", "never");
      // In a process of its own, as the job runs it: the plugins it loads
      // are read as Node reads them, not as this test runner does.
      execFileSync(
        process.execPath,
        [
          join(ROOT, "node_modules/semantic-release/bin/semantic-release.js"),
          "--no-ci",
          "--repository-url",
          URL_,
        ],
        {
          cwd: work,
          encoding: "utf8",
          env: {
            PATH: process.env.PATH,
            HOME: dir,
            GIT_CONFIG_NOSYSTEM: "1",
            GIT_TERMINAL_PROMPT: "0",
            GIT_AUTHOR_NAME: bot,
            GIT_AUTHOR_EMAIL: botEmail,
            GIT_COMMITTER_NAME: bot,
            GIT_COMMITTER_EMAIL: botEmail,
          },
        },
      );

      const released = git(copy, "rev-parse", "refs/heads/main");
      expect(git(copy, "rev-parse", `${released}^`)).toBe(tip);
      expect(git(copy, "tag", "--points-at", released)).toBe("v1.0.1");
      expect(git(target, "rev-parse", "HEAD")).toBe(tip);

      // As the push job's checks do it.
      const bundle = join(dir, "release.bundle");
      git(copy, "bundle", "create", "-q", bundle, "refs/tags/v1.0.1", `^${tip}`);
      git(target, "bundle", "verify", "--quiet", bundle);
      git(target, "fetch", "--no-tags", "--quiet", bundle, "refs/tags/v1.0.1:refs/tags/v1.0.1");
      const messages: string[] = [];
      const io = { ...releaseCommitIo(target, "HEAD"), log: (m: string) => messages.push(m) };
      expect(releaseCommit(["node", "next", "v1.0.1"], io)).toBe(0);
      expect(messages).toEqual([`v1.0.1 names ${released}, a release commit onto main's tip.`]);

      // As the publish job reads the notes, once main holds the commit.
      git(target, "merge", "-q", "--ff-only", "refs/tags/v1.0.1");
      messages.length = 0;
      expect(releaseCommit(["node", "notes", "v1.0.1"], io)).toBe(0);
      expect(messages[0]).toMatch(
        /^## \[1\.0\.1\]\(https:\/\/github\.com\/solid-memo\/website\/compare\/v1\.0\.0\.\.\.v1\.0\.1\) \(\d{4}-\d{2}-\d{2}\)\n\n### Fixes\n\n\* \*\*app:\*\* keep the title \(\[[0-9a-f]{7}\]\(https:\/\/github\.com\/solid-memo\/website\/commit\/[0-9a-f]{40}\)\), closes \[#1\]/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
