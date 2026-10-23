// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * What the tests of a set of catalogs (`ui`'s, the Studio's) read of them
 * and of the source, to hold every language to English.
 */

/** Every message's key, and its placeholders, in a message file; a plural message's marked as one. */
export function shape(messages: object, prefix = ""): Record<string, string[]> {
  const found: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(messages)) {
    const path = `${prefix}${key}`;
    if (typeof value === "string") {
      found[path] = [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    } else if (typeof value.other === "string") {
      found[path] = [
        "(plural)",
        ...[
          ...new Set(
            Object.values(value as Record<string, string>).flatMap((form) =>
              [...form.matchAll(/\{(\w+)\}/g)].map((m) => m[1]),
            ),
          ),
        ].sort(),
      ];
    } else {
      Object.assign(found, shape(value, `${path}.`));
    }
  }
  return found;
}

/** The forms each plural message in a message file gives, by key. */
export function pluralForms(messages: object, prefix = ""): Record<string, string[]> {
  const found: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(messages)) {
    if (typeof value === "string") continue;
    if (typeof value.other === "string") found[`${prefix}${key}`] = Object.keys(value).sort();
    else Object.assign(found, pluralForms(value, `${prefix}${key}.`));
  }
  return found;
}

/** Every message key the app's source asks for (keys are literals by rule). */
export function keysUsed(dir: string): Set<string> {
  const used = new Set<string>();
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
    const source = readFileSync(join(entry.parentPath, entry.name), "utf8");
    for (const match of source.matchAll(/\btx?\(\s*"([^"]+)"/g)) used.add(match[1]);
  }
  return used;
}
