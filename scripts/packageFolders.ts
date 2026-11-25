// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The folders of the workspace's packages in `group` (`apps`, `packages`
 * or `e2e`), from the root `root`: each folder of it with a
 * package.json, and, in a folder without one, which groups packages by
 * their role (`packages/core/`, `packages/adapters/`, `packages/lib/`),
 * each folder of that with one (docs/architecture.md).
 */
export function packageFolders(root: string, group: string): string[] {
  const folders = (parent: string) =>
    readdirSync(join(root, parent), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${parent}/${entry.name}`);
  const isPackage = (folder: string) => existsSync(join(root, folder, "package.json"));
  return folders(group).flatMap((folder) =>
    isPackage(folder) ? [folder] : folders(folder).filter(isPackage),
  );
}
