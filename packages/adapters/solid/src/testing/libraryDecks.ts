// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import fs from "node:fs";
import fsp from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildIndex,
  INDEX_FILE,
  NEWCOMER_COURSE,
  releasesOf,
} from "@solid-memo/shacl/node/deckLibrary";
import { DECKS_ROOT } from "@solid-memo/vocab/tooling/root";

/**
 * The library's decks that solid's unit tests read (docs/testing.md#conventions). solid#test's inputs name these folders
 * (turbo.json), not all of decks/, so a new deck, or a new release of
 * another, doesn't run the unit tests again. The tests that read the
 * whole library run in the round trip's task. A unit test that reads
 * another deck fails, and says to add it here and to turbo.json.
 */
export const LIBRARY_DECKS: readonly string[] = [
  "academy-award-best-picture",
  "arabic-adjectives",
  "capitals-of-the-world",
  "getting-started",
  "git-commands",
  "greek-alphabet",
  "http-status-codes",
  "korean-at-the-table",
  "roman-numerals",
  "standard-for-public-code",
  "sweden-counties-and-provinces",
];

/**
 * What a read of `path` is to the guard: outside decks/; the index;
 * a listed deck's file; a path in decks/ that isn't there, which reads
 * as it would (a missing file); or another deck's file, or decks/
 * itself, which a unit test may not read.
 */
export function deckReadOf(
  path: string,
  exists: (path: string) => boolean,
): "outside" | "index" | "listed" | "missing" | "unlisted" {
  const at = relative(DECKS_ROOT, resolve(path)).replaceAll("\\", "/");
  if (at.startsWith("../") || at === "..") return "outside";
  if (at === INDEX_FILE) return "index";
  const [deck] = at.split("/");
  if (deck !== undefined && deck !== "" && LIBRARY_DECKS.includes(deck)) return "listed";
  if (deck !== undefined && deck !== "" && !exists(join(DECKS_ROOT, deck))) return "missing";
  return "unlisted";
}

/** The index of LIBRARY_DECKS alone, as `npm run library` writes the whole library's. */
export function indexOfListedDecks(
  readdir: (path: string) => string[] = (path) => fs.readdirSync(path),
  readText: (path: string) => string = (path) => fs.readFileSync(path, "utf8"),
): string {
  const files = new Map<string, string>();
  for (const deck of LIBRARY_DECKS) {
    for (const file of readdir(join(DECKS_ROOT, deck)).sort()) {
      files.set(`${deck}/${file}`, readText(join(DECKS_ROOT, deck, file)));
    }
  }
  const { releases } = releasesOf(files);
  const course =
    NEWCOMER_COURSE !== undefined && LIBRARY_DECKS.includes(NEWCOMER_COURSE)
      ? NEWCOMER_COURSE
      : undefined;
  return buildIndex(releases, course);
}

/** The paths of decks/ a test read that it may not, since the last takeUnlistedReads. */
const unlisted: string[] = [];

/** The reads of other decks since the last call, which the setup fails a test for. */
export function takeUnlistedReads(): string[] {
  return unlisted.splice(0);
}

const pathOf = (path: unknown): string =>
  path instanceof URL ? fileURLToPath(path) : String(path);

/**
 * Guards node's file reads for the unit tests (libraryDecks.setup.ts):
 * a listed deck's files read as they are, the index reads as
 * indexOfListedDecks, and a read of another deck throws, and is kept
 * for takeUnlistedReads, since a reader may take the error for a
 * missing file.
 */
export function guardLibraryReads(): void {
  const original = {
    readFileSync: fs.readFileSync,
    readdirSync: fs.readdirSync,
    statSync: fs.statSync,
    existsSync: fs.existsSync,
    readFile: fsp.readFile,
    readdir: fsp.readdir,
    stat: fsp.stat,
  };
  let index: string | undefined;
  const indexText = () =>
    (index ??= indexOfListedDecks(
      (path) => original.readdirSync(path),
      (path) => original.readFileSync(path, "utf8"),
    ));
  const refuse = (at: string): never => {
    unlisted.push(at);
    throw new Error(
      `${at} is not one of the decks solid's unit tests read: add its deck to LIBRARY_DECKS (src/testing/libraryDecks.ts) and to solid#test's inputs (turbo.json), or read the whole library in the round trip's task.`,
    );
  };
  /** What a read of `path` gives instead, or undefined to read it as it is. */
  const instead = (path: unknown): { text: string } | undefined => {
    const file = resolve(pathOf(path));
    if (file === resolve(DECKS_ROOT)) return refuse("decks/");
    const read = deckReadOf(file, (at) => original.existsSync(at));
    if (read === "index") return { text: indexText() };
    if (read !== "unlisted") return undefined;
    return refuse(`decks/${relative(DECKS_ROOT, file).replaceAll("\\", "/")}`);
  };
  const asRead = (text: string, options: unknown) =>
    typeof options === "string" ||
    (typeof options === "object" && options !== null && "encoding" in options && options.encoding)
      ? text
      : Buffer.from(text);
  Object.assign(fs, {
    readFileSync: (path: fs.PathOrFileDescriptor, options?: unknown) => {
      const read = typeof path === "number" ? undefined : instead(path);
      return read === undefined
        ? original.readFileSync(path, options as never)
        : asRead(read.text, options);
    },
    readdirSync: (path: fs.PathLike, options?: unknown) => {
      instead(path);
      return original.readdirSync(path, options as never);
    },
    statSync: (path: fs.PathLike, options?: unknown) => {
      instead(path);
      return original.statSync(path, options as never);
    },
  });
  Object.assign(fsp, {
    readFile: async (path: fs.PathLike | fsp.FileHandle, options?: unknown) => {
      const read = typeof path === "object" && "fd" in path ? undefined : instead(path);
      return read === undefined
        ? original.readFile(path, options as never)
        : asRead(read.text, options);
    },
    readdir: async (path: fs.PathLike, options?: unknown) => {
      instead(path);
      return original.readdir(path, options as never);
    },
    stat: async (path: fs.PathLike, options?: unknown) => {
      instead(path);
      return original.stat(path, options as never);
    },
  });
  syncBuiltinESMExports();
}
