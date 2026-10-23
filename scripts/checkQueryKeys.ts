// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * `npm run check:keys`: no screen of Solid Memo or the Studio writes a
 * query key out as an array (docs/architecture.md#query-keys). Each key is
 * made by a function of the keys modules, packages/ui/src/ui/queryKeys.ts
 * and apps/studio/src/ui/queryKeys.ts, so a screen that reads a key and
 * one that refreshes it cannot write it two ways, and the keys that sit
 * under another are seen in one place. It fails on an array given as a
 * `queryKey` or `mutationKey`, as a property or a variable (a branch of a
 * condition too), or as the key of a QueryClient's read or write of one
 * query, in code that is not a test. A test writes its keys out, so that
 * it fails when one changes.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** Where the screens are, from the repository's root. */
const ROOTS = ["packages/ui/src", "apps/studio/src"];

/** The modules that make the keys. */
const KEYS_MODULES = new Set([
  "packages/ui/src/ui/queryKeys.ts",
  "apps/studio/src/ui/queryKeys.ts",
]);

/**
 * A key written out: an array as a `queryKey` or `mutationKey`, or as
 * either branch of a condition given as one, or as a query's key in a
 * QueryClient call.
 */
const WRITTEN_OUT = [
  /\b(queryKey|mutationKey)\s*[:=]\s*\[/g,
  /\b(queryKey|mutationKey)\s*:[^,;{}()[\]]*?[?:]\s*\[/g,
  /\.(getQueryData|setQueryData|getQueryState)\s*(?:<[^()]*?>)?\(\s*\[/g,
];

/** Whether a path is a source file the check reads: TypeScript, not a test or a test's helper, not a keys module. */
export function checked(path: string): boolean {
  return (
    /\.tsx?$/.test(path) &&
    !/\.test\.tsx?$/.test(path) &&
    !path.split("/").includes("test") &&
    !KEYS_MODULES.has(path)
  );
}

/** Each key one file writes out, by its line; a comment's are left alone. */
export function fileProblems(path: string, source: string): string[] {
  const lines = source.split("\n");
  return WRITTEN_OUT.flatMap((pattern) =>
    [...source.matchAll(pattern)].map((match) => {
      const line = source.slice(0, match.index).split("\n").length;
      return { line, name: match[1]! };
    }),
  )
    .filter(({ line }) => !/^\s*(\*|\/\/|\/\*)/.test(lines[line - 1]!))
    .sort((a, b) => a.line - b.line)
    .map(
      ({ line, name }) =>
        `${path}:${line}: a ${name} writes its key out; make it with a function of queryKeys.`,
    );
}

export type QueryKeysIo = {
  /** Every file under the screens' roots, as a path from the repository's root. */
  files(): string[];
  read(path: string): string;
  log(message: string): void;
};

export function defaultIo(root: string): QueryKeysIo {
  return {
    files: () =>
      ROOTS.flatMap((dir) =>
        readdirSync(join(root, dir), { recursive: true, encoding: "utf8" }).map(
          (file) => `${dir}/${file}`,
        ),
      ).sort(),
    read: (path) => readFileSync(join(root, path), "utf8"),
    log: (message) => console.log(message),
  };
}

/** Exit code: 0 when no screen writes a query key out. */
export function main(io: QueryKeysIo): number {
  const files = io.files().filter(checked);
  const problems = files.flatMap((path) => fileProblems(path, io.read(path)));
  for (const problem of problems) io.log(problem);
  if (problems.length > 0) return 1;
  io.log(`None of the ${files.length} source files writes a query key out.`);
  return 0;
}

/** The script entry: `node -e "import('./scripts/checkQueryKeys.ts').then((m) => m.run(process))"`. */
export function run(process: { exitCode?: number | string | null | undefined }): void {
  process.exitCode = main(defaultIo(resolve(import.meta.dirname, "..")));
}
