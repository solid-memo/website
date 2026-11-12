// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { isTestFile, sourceFiles } from "./checkBoundaries.ts";

const ROOT = join(import.meta.dirname, "..");
const CONTRACT = join(ROOT, "api/browser-storage");

/**
 * The names under `solid-memo` the apps' and packages' code holds that
 * are not kept in the browser, each with what it names instead. They
 * match whole, so a new storage key that only starts like one of them
 * is still checked. A template literal's name ends at its first
 * substitution.
 */
const NOT_KEPT: Record<string, string> = {
  "solid-memo-answers-": "the file an export of the answers is saved as",
  "solid-memo-answers-<study day>.csv": "that file, in a comment",
  "solid-memo:client-id": "a build plugin",
  "solid-memo:publish-": "a build plugin, one for each published path",
  "solid-memo:publish-docs": "a build plugin",
  "solid-memo:site-map": "a build plugin",
  "solid-memo:session-expired": "an event within the page",
};

/** A string literal's text up to its first substitution, for each literal that starts `solid-memo`. */
const NAME = /["'`](solid-memo[:-][^"'`$]*)/g;

/**
 * Whether a line of the contract names `name` whole, followed by a
 * comma, a space or the line's end, or names a key it is the prefix of
 * (one that ends in a separator).
 */
const listed = (contract: string, name: string) =>
  new RegExp(
    `: ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${/[:.-]$/.test(name) ? "" : "(?=[, \n])"}`,
  ).test(contract);

/**
 * Every name the code keeps in the browser under (a storage key or its
 * prefix, a database, a lock, a channel) is in a file of
 * api/browser-storage, so that renaming or dropping it is a line gone,
 * which `npm run check:breaking` holds to a commit that says so. A key
 * only the code knows would change unnoticed and leave what it held
 * behind in the browser.
 */
it("finds every browser storage name of the code in api/browser-storage", () => {
  const contract = readdirSync(CONTRACT)
    .map((file) => readFileSync(join(CONTRACT, file), "utf8"))
    .join("");
  const names = new Map<string, string>();
  for (const parent of ["apps", "packages"]) {
    for (const pkg of readdirSync(join(ROOT, parent))) {
      const src = join(ROOT, parent, pkg, "src");
      for (const file of sourceFiles(src).filter((path) => !isTestFile(path))) {
        const text = readFileSync(join(src, file), "utf8");
        for (const [, name] of text.matchAll(NAME))
          names.set(name!, `${parent}/${pkg}/src/${file}`);
      }
    }
  }
  expect(Object.keys(NOT_KEPT).filter((name) => !names.has(name))).toEqual([]);
  const kept = [...names.keys()].filter((name) => !Object.hasOwn(NOT_KEPT, name));
  expect(kept.length).toBeGreaterThan(0);
  expect(
    kept.filter((name) => !listed(contract, name)).map((name) => `${name} (${names.get(name)})`),
  ).toEqual([]);
});
