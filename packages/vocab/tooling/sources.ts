// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFile } from "node:fs/promises";
import { SHAPES_BASE, SITE, VOCAB_BASE } from "../src/ns.ts";
import { DECKS_ROOT, NS_ROOT, VOCAB_ROOT } from "./root.ts";

/**
 * The documents the site publishes from this repository, as the node
 * tooling reads them: from disk, at their own address. ns/ (the
 * vocabulary and the shapes) and decks/ (the deck library) are published
 * under the same path, this package's vendor/ folder (the vendored
 * profiles) at SITE_VENDOR. Nothing here needs the network.
 */

export { SHAPES_BASE, SITE, VOCAB_BASE };

/** Where the site publishes this package's vendor/ folder. */
export const SITE_VENDOR = `${SITE}vendor/`;

/** The folder each published path prefix is read from. */
const FOLDERS: readonly [prefix: string, dir: string][] = [
  [`${SITE}ns/`, NS_ROOT],
  [`${SITE}decks/`, DECKS_ROOT],
  [SITE_VENDOR, `${VOCAB_ROOT}vendor/`],
];

/** The file a document of the site is read from (its fragment left out), or undefined for one this repository does not publish. */
export function fileOf(url: string): string | undefined {
  const document = url.split("#")[0];
  for (const [prefix, dir] of FOLDERS) {
    if (document.startsWith(prefix)) return `${dir}${document.slice(prefix.length)}`;
  }
  return undefined;
}

/** A document of the site as Turtle, read from this repository; throws when it has none. */
export async function readSiteTurtle(url: string): Promise<string> {
  const file = fileOf(url);
  if (file === undefined) throw new Error(`${url} is not published from this repository.`);
  return readFile(file, "utf8");
}
