// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { packageFolders } from "./packageFolders.ts";

let root = "";
afterEach(() => rmSync(root, { recursive: true, force: true }));

/** A folder at `path` under the root, with a package.json when `pkg`. */
function folder(path: string, pkg = true): void {
  mkdirSync(join(root, path), { recursive: true });
  if (pkg) writeFileSync(join(root, path, "package.json"), "{}");
}

it("finds each package of a group, and each of a folder that groups packages by role", () => {
  root = mkdtempSync(join(tmpdir(), "package-folders-"));
  folder("packages/ui");
  folder("packages/core", false);
  folder("packages/core/domain");
  folder("packages/core/notes", false);
  folder("packages/ui/src", false);
  writeFileSync(join(root, "packages", "README.md"), "");
  expect(packageFolders(root, "packages").sort()).toEqual(["packages/core/domain", "packages/ui"]);
});
