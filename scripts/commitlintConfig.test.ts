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

const { RENOVATE_WHY } = (await import(
  new URL("../commitlint.config.mjs", import.meta.url).href
)) as { RENOVATE_WHY: string };
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
    const commitBody = /commitBody: '(.*)',$/m.exec(renovate)?.[1];
    expect(commitBody).toContain(`\\n${RENOVATE_WHY}`);
    expect(renovateBody.split("\n").at(-1)?.startsWith(RENOVATE_WHY)).toBe(true);
  });
});
