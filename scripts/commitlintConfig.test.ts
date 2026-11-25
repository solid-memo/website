// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { join } from "node:path";
import lint from "@commitlint/lint";
import load from "@commitlint/load";
import { describe, expect, it } from "vitest";

/**
 * commitlint.config.mjs, run as CI's commits job and `npm run lint:commits`
 * run it, on messages like this project's (CONTRIBUTING.md#commit-messages):
 * every commit says why and names its issue, and Renovate's updates keep
 * every other rule.
 */

const ROOT = join(import.meta.dirname, "..");

const { RENOVATE_WHY, WORKFLOW_COMMAND, holdsChangelogLink } = (await import(
  new URL("../commitlint.config.mjs", import.meta.url).href
)) as {
  RENOVATE_WHY: string;
  WORKFLOW_COMMAND: RegExp;
  holdsChangelogLink(message: string): boolean;
};
const config = await load({}, { cwd: ROOT });

async function errors(message: string): Promise<string[]> {
  const result = await lint(message, config.rules, {
    parserOpts: config.parserPreset?.parserOpts as object,
    plugins: config.plugins,
    defaultIgnores: config.defaultIgnores,
    ignores: config.ignores,
  });
  return result.errors.map(({ name }) => name);
}

const why = "A deck with a broken link leaves the learner nowhere.";

// 06aba864, as Renovate wrote it from commitBody in renovate.json5.
const renovateBody = [
  "- vite 8.3.1 → 8.3.4 (patch, devDependencies) in package.json; source and release notes: https://github.com/vitejs/vite",
  "",
  "Why: renovate.json5 keeps every dependency current, within the versions it allows, so that fixes arrive while they are small; the update was merged only after CI passed on it.",
].join("\n");

describe("commitlint.config.mjs", () => {
  it("passes a commit that says why and names its issue, in any form", async () => {
    for (const footer of ["Refs: #72", "Closes: #87", "Closes #68", "Fixes #69", "Refs #69"]) {
      expect(await errors(`feat(studio): check a draft's links\n\n${why}\n\n${footer}`)).toEqual(
        [],
      );
    }
    expect(await errors(`fix: keep the deck's title\n\n${why} Found in #12.`)).toEqual([]);
  });

  it("passes a security fix that names its advisory instead of an issue", async () => {
    for (const footer of ["Refs: GHSA-fhp3-h74x-mhrr", "Fixes GHSA-2345-6789-cfgh"]) {
      expect(
        await errors(`fix(solid): keep a deck's documents its own\n\n${why}\n\n${footer}`),
      ).toEqual([]);
    }
  });

  it("takes only a well-formed advisory id for one", async () => {
    for (const footer of [
      "Refs: GHSA-1234",
      "Refs: GHSA-abcd-efgh-ijkl",
      "Refs: XGHSA-fhp3-h74x-mhrr",
    ]) {
      expect(await errors(`fix: keep the deck's title\n\n${why}\n\n${footer}`)).toEqual([
        "references-or-renovate",
      ]);
    }
  });

  it("fails a commit with no body", async () => {
    expect(await errors("fix: keep the deck's title")).toContain("body-empty");
    expect(await errors("fix: keep the deck's title\n\nRefs: #72")).toContain("body-empty");
  });

  it("fails a commit that names no issue, pull request or discussion", async () => {
    expect(await errors(`fix: keep the deck's title\n\n${why}`)).toEqual([
      "references-or-renovate",
    ]);
    expect(await errors(`fix: keep the deck's title\n\n${why}\n\nRefs: none`)).toEqual([
      "references-or-renovate",
    ]);
  });

  // semantic-release's own commit is made on main, never in a pull
  // request, and its title alone made a commit count as a release.
  it("fails a commit titled as semantic-release's release commit", async () => {
    for (const header of [
      "chore(release): 6.17.21",
      "chore(release)!: 7.0.0",
      "CHORE(Release): 6.17.21",
    ]) {
      expect(await errors(`${header}\n\nBump the version.\n\nRefs: #1`)).toContain("not-a-release");
    }
    // The ignores read the header alone, so a body line like a merge's
    // does not skip the commit.
    for (const line of ["Merge branch x", "Merge tag x", "Merge x into y"]) {
      expect(
        await errors(`chore(release): 6.17.21\n\nBump the version.\n\n${line}\n\nRefs: #1`),
      ).toContain("not-a-release");
    }
    expect(await errors("Merge branch x\n\nchore(release): 6.17.21")).toEqual([]);
    expect(await errors(`chore(releases): tidy the notes\n\n${why}\n\nRefs: #1`)).toEqual([]);
    expect(await errors(`fix(release): chore(release) is refused\n\n${why}\n\nRefs: #1`)).toEqual(
      [],
    );
  });

  // GitHub skips CI on a push whose head commit's message holds one, and
  // the deploy runs only after CI.
  it("fails a commit that holds a keyword that skips CI, in any case, anywhere", async () => {
    const keywords = [
      "[skip ci]",
      "[ci skip]",
      "[no ci]",
      "[skip actions]",
      "[actions skip]",
      "[Skip CI]",
      "[ SKIP  ACTIONS ]",
    ];
    for (const keyword of keywords) {
      expect(
        await errors(`fix(web): tidy the deck list ${keyword}

${why}

Refs: #1`),
      ).toEqual(["no-skip-keyword"]);
      expect(
        await errors(`fix(web): tidy the deck list

${why} ${keyword}

Refs: #1`),
      ).toEqual(["no-skip-keyword"]);
    }
    for (const trailer of ["skip-checks: true", "Skip-Checks:true"]) {
      expect(
        await errors(`fix(web): tidy the deck list

${why}

Refs: #1
${trailer}`),
      ).toEqual(["no-skip-keyword"]);
    }
    // Even in a commit the other rules skip.
    expect(await errors('Revert "fix: keep the title [skip ci]"')).toContain("no-skip-keyword");
    expect(await errors("fixup! fix: keep the title\n\n[ci skip]")).toContain("no-skip-keyword");
    // The words alone, outside the brackets or the trailer, skip nothing.
    for (const words of ["skip ci on drafts", "[skip] ci", "the skip-checks: line"]) {
      expect(
        await errors(`fix(web): ${words}

${why}

Refs: #1`),
      ).toEqual([]);
    }
  });

  // The release copies a commit's subject and its footer into CHANGELOG.md,
  // whose generated entries are exempt from the linters only through
  // directives in the file.
  it("fails a commit that holds a directive for CHANGELOG.md's linters, anywhere", async () => {
    const directives = [
      "<!-- cspell:enable --> <!-- markdownlint-enable -->",
      "<!-- markdownlint-enable -->",
      "<!-- a note",
      "a note -->",
      "a note --!>",
      "cspell:enable",
      "CSpell::Enable",
      "cspell: locale de",
      "spell:locale de",
      "spellchecker: flagWords the",
      "spell-checker:enable",
      "xcspell:enable",
      "x_cspell: enable",
    ];
    for (const directive of directives) {
      expect(await errors(`fix(ui): tidy the footer ${directive}\n\n${why}\n\nCloses: #1`)).toEqual(
        ["no-changelog-directive"],
      );
      expect(await errors(`fix(ui): tidy the footer\n\n${why} ${directive}\n\nCloses: #1`)).toEqual(
        ["no-changelog-directive"],
      );
      expect(
        await errors(
          `fix(ui)!: tidy the footer\n\n${why}\n\nBREAKING CHANGE: ${directive}\nCloses: #1`,
        ),
      ).toEqual(["no-changelog-directive"]);
    }
  });

  // The release's parser ends a line only at a line feed, so a character
  // another reader takes for the end of one would let a message say one
  // thing to it and another to the release.
  it("fails a control character or a line separator other than a line feed", async () => {
    const hidden = ["\u2028", "\u2029", "\u0085", "\r", "\x1e\x1f", "\0", "\x1b", "\x7f"];
    for (const character of hidden) {
      const breaking = `feat(app): change the deck page\n\n${why}${character}BREAKING CHANGE: x\n\nCloses: #12`;
      expect(await errors(breaking), JSON.stringify(character)).toEqual(["no-hidden-break"]);
      expect(await errors(`fix(app): tidy ${character} it\n\n${why}\n\nCloses: #12`)).toContain(
        "no-hidden-break",
      );
    }
  });

  // The release splits git's output at this text, so a message that held
  // it would be read as another.
  it("fails the text the release splits git's output at", async () => {
    for (const separator of ["==FIELD==", "==END=="]) {
      const message = `feat(app): change the deck page\n\n${why}${separator}x\n\nCloses: #12`;
      expect(await errors(message), separator).toEqual(["no-log-separator"]);
      expect(await errors(`fix(app): tidy ${separator}\n\n${why}\n\nCloses: #12`)).toContain(
        "no-log-separator",
      );
    }
    expect(await errors(`fix(app): tidy ==FIELD and END==\n\n${why}\n\nCloses: #12`)).toEqual([]);
  });

  // A workflow's log reads a line that starts with `::` as a command, and
  // the release and CI print messages there.
  it("fails a line that starts with `::`, after any blank space, and `##[` anywhere", async () => {
    const lines = [
      "::add-mask::8.5.1",
      "  ::add-mask::v8",
      "\t::stop-commands::x",
      "::warning::x",
      "##[add-mask]8.5.1",
      "Why ##[error]x",
    ];
    for (const line of lines) {
      const message = `fix(ui): keep the footer link in view\n\n${why}\n${line}\n\nCloses: #12`;
      expect(await errors(message), line).toEqual(["no-workflow-command"]);
    }
    expect(await errors(`fix(app): tidy\n\n${why}\n\n::add-mask::8.5.1\nCloses: #12`)).toEqual([
      "no-workflow-command",
    ]);
    expect(await errors(`fix(app): tidy ##[add-mask]8.5.1\n\n${why}\n\nCloses: #12`)).toEqual([
      "no-workflow-command",
    ]);
    expect(
      await errors(`fix(app): tidy a::b and std::move\n\n${why} ::x ## [y]\n\nCloses: #12`),
    ).toEqual([]);
    // U+0085 is blank space to the runner too, though no-hidden-break
    // refuses it first.
    expect(WORKFLOW_COMMAND.test("a\n\u0085 ::add-mask::8.5.1")).toBe(true);
  });

  it("passes a tab, and a carriage return right before a line feed", async () => {
    expect(await errors(`fix(app): tidy\r\n\r\n${why}\tYes.\r\n\r\nCloses: #12\r\n`)).toEqual([]);
  });

  it("passes what only looks like a directive", async () => {
    for (const words of [
      "a -> b <- c",
      "the --force flag and <!- half a marker",
      "keep the spelling",
      "the misspell: rule",
      "chore(cspell) words",
    ]) {
      expect(await errors(`fix(ui): ${words}\n\n${why}\n\nCloses: #1`)).toEqual([]);
    }
  });

  // CHANGELOG.md renders the header and a breaking change's footer as
  // Markdown, and CI's link check reads every link and image there.
  const links = [
    "as [the Studio page](docs/no-such-page.md) says",
    "as [the Studio page](docs/studio.md#no-such-heading) says",
    "with ![a picture](docs/no-such-image.png)",
    "as [the Studio page][studio] says",
    "as [the Studio page][] says",
    "as <file:docs/studio.md> says",
    "as file:///docs/studio.md says",
    'as <a href="docs/studio.md">the Studio page</a> says',
    "as <IMG SRC=docs/no-such-image.png> shows",
    'with <img srcset="docs/no-such-image.png">',
    'as <blockquote cite="docs/studio.md">it</blockquote> says',
    'with <object data="docs/no-such-file.pdf"></object>',
    'with <video poster="docs/no-such-image.png"></video>',
    'with <form action="docs/studio.md"></form>',
    'as <a title=">" href="docs/studio.md">the Studio page</a> says',
    "as <img/src=docs/no-such-image.png> shows",
    "with [studio]: docs/studio.md",
  ];

  it("fails a link or an image in the header", async () => {
    for (const link of links) {
      expect(await errors(`fix(studio): keep the order, ${link}\n\n${why}\n\nCloses: #1`)).toEqual([
        "no-changelog-link",
      ]);
    }
  });

  // The parser that commitlint and the release share drops `gpg:` lines
  // and leading blank lines before it reads the header.
  it("fails a link in the header the parser finds after gpg: or blank lines", async () => {
    for (const before of ["gpg: Signature made today\n", "\n", "\n\n", "\n  gpg: x\ngpg: y\n"]) {
      expect(
        await errors(
          `${before}fix(studio): keep [the Studio page](docs/no-such-page.md) in order\n\n${why}\n\nCloses: #1`,
        ),
      ).toEqual(["no-changelog-link"]);
    }
    expect(holdsChangelogLink("gpg: [the page](docs/x.md)\n\n")).toBe(false);
  });

  it("fails a link or an image in a breaking change's footer, on any of its lines", async () => {
    for (const footer of [
      ...links.map((link) => `BREAKING CHANGE: keep the order, ${link}`),
      "BREAKING-CHANGE: keep the order, as [the Studio page] says\n[the Studio page]: docs/studio.md",
      "BREAKING CHANGE: keep the order, as [studio] says\n\n    [studio]: docs/studio.md",
      "BREAKING CHANGE: keep the order, as [studio] says\n\t[studio]: docs/studio.md",
      "BREAKING CHANGE: keep the order, as [studio] says\n> - [studio]: docs/studio.md",
      "BREAKING CHANGE: keep the order, as [studio] says\n1. [studio\n]: docs/studio.md",
      'BREAKING CHANGE: keep the order, as <a\nhref="docs/studio.md">the Studio page</a> says',
      // HTML ends a tag's name only at a space, a `/` or a `>`.
      'BREAKING CHANGE: keep the order\n<div>\n<x:a href="docs/no-such-page.md">the page</x:a>\n</div>',
      'BREAKING CHANGE: keep the order\n<div>\n<a" href="docs/no-such-page.md">the page</a>\n</div>',
      'BREAKING CHANGE: keep the order\n<div>\n<a_b href="docs/no-such-page.md">the page</a_b>\n</div>',
    ]) {
      expect(
        await errors(`fix(studio)!: keep the order\n\n${why}\n\n${footer}\nCloses: #1`),
      ).toEqual(["no-changelog-link"]);
    }
  });

  it("passes a link in the body, which the release leaves out of CHANGELOG.md", async () => {
    expect(
      await errors(
        `fix(studio): keep the order\n\n${why} See [the Studio page](docs/studio.md).\n[studio]: docs/studio.md\n\nCloses: #1`,
      ),
    ).toEqual([]);
  });

  it("passes brackets and parentheses that are no link", async () => {
    for (const words of [
      "keep a card's [front] and (back)",
      "read arr[0] (the first)",
      "keep the order (docs/studio.md)",
      "keep the order, as [the Studio page] (docs/studio.md) says",
      "name the file: docs/studio.md, in a <dialog>",
      "keep x<y and z",
      "keep a <br/> and a <br />",
    ]) {
      expect(await errors(`fix(ui): ${words}\n\n${why}\n\nCloses: #1`)).toEqual([]);
      expect(
        await errors(`fix(ui)!: ${words}\n\n${why}\n\nBREAKING CHANGE: ${words}\nCloses: #1`),
      ).toEqual([]);
    }
  });

  it("reads a long message of tags that never close in linear time", () => {
    const timed = (runs: number) => {
      const message = `fix(ui)!: keep the order\n\n${why}\n\nBREAKING CHANGE: ${"<a b".repeat(runs)}`;
      const started = performance.now();
      expect(holdsChangelogLink(message)).toBe(false);
      expect(holdsChangelogLink(`${message}>`)).toBe(true);
      return performance.now() - started;
    };
    timed(20_000);
    // Ten times the input takes about ten times as long, where a check
    // that read each tag again would take about a hundred times as long.
    expect(timed(200_000)).toBeLessThan(40 * timed(20_000) + 50);
  });

  it("still skips a revert and a fixup, as commitlint does by default", async () => {
    expect(await errors('Revert "fix: keep the deck\'s title"')).toEqual([]);
    expect(await errors("fixup! fix: keep the deck's title")).toEqual([]);
    expect(await errors("chore: 1.2.3")).toContain("body-empty");
  });

  it("passes a Renovate update, which cannot name its pull request", async () => {
    expect(
      await errors(`chore(deps): update dependency vite to v8.3.4\n\n${renovateBody}`),
    ).toEqual([]);
  });

  it("still checks a Renovate update's header", async () => {
    expect(await errors(`Update dependency vite to v8.3.4\n\n${renovateBody}`)).toEqual(
      expect.arrayContaining(["subject-empty", "type-empty"]),
    );
  });

  it("takes Renovate's line from the commitBody that renovate.json5 writes", () => {
    const renovate = readFileSync(join(ROOT, "renovate.json5"), "utf8");
    const commitBody = /commitBody: "(.*)",$/m.exec(renovate)?.[1];
    expect(commitBody).toContain(`\\n${RENOVATE_WHY}`);
    expect(renovateBody.split("\n").at(-1)?.startsWith(RENOVATE_WHY)).toBe(true);
  });
});
