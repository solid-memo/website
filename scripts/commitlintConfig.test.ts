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
