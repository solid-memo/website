// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * `npm run release:version -- <version>`: writes a new version, and
 * today's date, into the metadata that software catalogs and citations
 * read (docs/releasing.md#what-a-release-does): publiccode.yml's
 * `softwareVersion` and `releaseDate`, and CITATION.cff's `version` and
 * `date-released`. semantic-release runs it as it prepares a release
 * (release.config.mjs), after it has set the root package.json's version
 * itself, and commits the files with the release.
 *
 * A key the file already has is replaced in place; one it lacks yet is
 * written on the line after the key that anchors it, so a file that has
 * never been released gains the keys where a reader looks for them.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** One file the release writes: its keys, and the key they follow when they are new. */
export type Target = {
  path: string;
  after: string;
  keys: (version: string, date: string) => [string, string][];
};

/** The files a release writes, and what it writes in each. */
export const TARGETS: readonly Target[] = [
  {
    path: "publiccode.yml",
    after: "landingURL",
    keys: (version, date) => [
      ["softwareVersion", version],
      ["releaseDate", `"${date}"`],
    ],
  },
  {
    path: "CITATION.cff",
    after: "url",
    keys: (version, date) => [
      ["version", `"${version}"`],
      ["date-released", `"${date}"`],
    ],
  },
];

/** A version semantic-release makes on main: MAJOR.MINOR.PATCH, with no prerelease tag. */
export function isReleaseVersion(version: string): boolean {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version);
}

/** A top-level key's line in a YAML file, as this project writes them: `key: value`. */
function keyLine(key: string): RegExp {
  return new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}:.*$`, "m");
}

/**
 * The file with each key set: replaced where it is, or added after the
 * anchor key (each new key after the one before it). Throws when a key
 * is new and the anchor is not there to follow.
 */
export function setKeys(text: string, after: string, keys: readonly [string, string][]): string {
  let result = text;
  let anchor = after;
  for (const [key, value] of keys) {
    const line = `${key}: ${value}`;
    if (keyLine(key).test(result)) {
      result = result.replace(keyLine(key), line);
    } else {
      const found = keyLine(anchor).exec(result);
      if (found === null) throw new Error(`no ${anchor}: line to write ${key}: after`);
      const end = found.index + found[0].length;
      result = `${result.slice(0, end)}\n${line}${result.slice(end)}`;
    }
    anchor = key;
  }
  return result;
}

export type ReleaseIo = {
  read(path: string): string;
  write(path: string, text: string): void;
  /** Today, as YYYY-MM-DD, in UTC: the date semantic-release dates the release by. */
  today(): string;
  log(message: string): void;
};

export function defaultIo(root: string): ReleaseIo {
  return {
    read: (path) => readFileSync(join(root, path), "utf8"),
    write: (path, text) => writeFileSync(join(root, path), text),
    today: () => new Date().toISOString().slice(0, 10),
    log: (message) => console.log(message),
  };
}

/** Exit code: 0 when every file now names the version. */
export function main(argv: readonly string[], io: ReleaseIo): number {
  // `node -e` puts the node binary first and drops the `--`.
  const args = argv.slice(1);
  const version = args[0];
  if (args.length !== 1 || version === undefined || !isReleaseVersion(version)) {
    io.log("Usage: npm run release:version -- <MAJOR.MINOR.PATCH>");
    return 2;
  }
  const date = io.today();
  for (const target of TARGETS) {
    try {
      io.write(
        target.path,
        setKeys(io.read(target.path), target.after, target.keys(version, date)),
      );
    } catch (error) {
      io.log(`${target.path}: ${(error as Error).message}.`);
      return 1;
    }
    io.log(`${target.path}: version ${version}, released ${date}.`);
  }
  return 0;
}

/** The script entry: `node -e "import('./scripts/releaseVersion.ts').then((m) => m.run(process))" -- <version>`. */
export function run(process: {
  argv: readonly string[];
  exitCode?: number | string | null | undefined;
}): void {
  process.exitCode = main(process.argv, defaultIo(resolve(import.meta.dirname, "..")));
}
