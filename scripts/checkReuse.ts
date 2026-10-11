// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * `npm run check:reuse`: every library deck version is licensed in
 * REUSE.toml as it says it is in its own Turtle (docs/style.md#licenses).
 * A deck's file cannot carry an SPDX header, since a published version is
 * never edited, so REUSE.toml lists each deck under its license; this
 * check keeps that list true to each version's `dcterms:license`.
 * `reuse lint` checks the rest: that every file has a license at all.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** The SPDX identifier of each license IRI a deck may state. */
export const SPDX_IDS: Readonly<Record<string, string>> = {
  "https://creativecommons.org/publicdomain/zero/1.0/": "CC0-1.0",
  "https://creativecommons.org/licenses/by/4.0/": "CC-BY-4.0",
  "https://creativecommons.org/licenses/by-sa/4.0/": "CC-BY-SA-4.0",
};

export type Annotation = { paths: string[]; license: string | undefined };

/**
 * REUSE.toml's annotations, in order. Reads only what this project writes
 * there: `path` as a string or a list of strings, one a line, and
 * `SPDX-License-Identifier` as a string.
 */
export function annotations(toml: string): Annotation[] {
  return toml
    .split(/^\[\[annotations\]\]$/m)
    .slice(1)
    .map((block) => {
      const path = /^path = (\[[^\]]*\]|"[^"]*")/m.exec(block)?.[1] ?? "";
      const paths = [...path.matchAll(/"([^"]*)"/g)].map(([, glob]) => glob!);
      const license = /^SPDX-License-Identifier = "([^"]*)"/m.exec(block)?.[1];
      return { paths, license };
    });
}

/** Whether a path matches a REUSE glob: `*` within a folder, `**` across folders. */
export function matches(glob: string, path: string): boolean {
  const pattern = glob
    .split(/(\*\*|\*)/)
    .map((part) =>
      part === "**" ? ".*" : part === "*" ? "[^/]*" : part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("");
  return new RegExp(`^${pattern}$`).test(path);
}

/** The license REUSE.toml gives a path: the last annotation that matches it wins. */
export function licenseOf(all: readonly Annotation[], path: string): string | undefined {
  return [...all]
    .reverse()
    .find((annotation) => annotation.paths.some((glob) => matches(glob, path)))?.license;
}

/**
 * The license IRIs a deck version states for itself: the `dcterms:license`
 * of `<>`, as the Turtle formatter writes it (each subject's statements
 * indented under it, up to a blank line), not those of its cards' pictures.
 */
export function deckLicenses(turtle: string): string[] {
  const lines = turtle.split("\n");
  const start = lines.indexOf("<>");
  const end = lines.findIndex((line, index) => index > start && !/^\s/.test(line));
  const subject = lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
  const objects = /dcterms:license\s+((?:<[^>]*>\s*,\s*)*<[^>]*>)/.exec(subject)?.[1] ?? "";
  return [...objects.matchAll(/<([^>]*)>/g)].map(([, iri]) => iri!);
}

/** What is wrong with one deck version's license in REUSE.toml; none when it agrees. */
export function versionProblems(
  path: string,
  turtle: string,
  all: readonly Annotation[],
): string[] {
  const licenses = deckLicenses(turtle);
  if (licenses.length !== 1) {
    return [`${path}: states ${licenses.length} licenses, and this check expects one.`];
  }
  const id = SPDX_IDS[licenses[0]!];
  if (id === undefined) {
    return [
      `${path}: <${licenses[0]}> has no SPDX identifier in scripts/checkReuse.ts; add it there, and its text to LICENSES/ (reuse download).`,
    ];
  }
  const given = licenseOf(all, path);
  if (given === undefined) return [`${path}: not in REUSE.toml; list its deck under ${id}.`];
  if (given !== id) {
    return [`${path}: REUSE.toml says ${given}, but its dcterms:license is ${id}.`];
  }
  return [];
}

export type ReuseIo = {
  toml(): string;
  /** Every deck version, as a path from the repository's root. */
  versions(): string[];
  read(path: string): string;
  log(message: string): void;
};

export function defaultIo(root: string): ReuseIo {
  const decks = join(root, "decks");
  return {
    toml: () => readFileSync(join(root, "REUSE.toml"), "utf8"),
    versions: () =>
      readdirSync(decks, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((deck) =>
          readdirSync(join(decks, deck.name))
            .filter((file) => /^v\d+\.ttl$/.test(file))
            .map((file) => `decks/${deck.name}/${file}`),
        ),
    read: (path) => readFileSync(join(root, path), "utf8"),
    log: (message) => console.log(message),
  };
}

/** Exit code: 0 when REUSE.toml licenses every deck version as it says it is. */
export function main(io: ReuseIo): number {
  const all = annotations(io.toml());
  const versions = io.versions();
  const problems = versions.flatMap((path) => versionProblems(path, io.read(path), all));
  for (const problem of problems) io.log(problem);
  if (problems.length > 0) return 1;
  io.log(`REUSE.toml licenses all ${versions.length} deck versions as they state.`);
  return 0;
}

/** The script entry: `node -e "import('./scripts/checkReuse.ts').then((m) => m.run(process))"`. */
export function run(process: { exitCode?: number | string | null | undefined }): void {
  process.exitCode = main(defaultIo(resolve(import.meta.dirname, "..")));
}
